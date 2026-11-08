use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("FdJjp7evC18dbEK7xj3fBccNo15HrXzz4XGAKD9fKUVd");

const VAULT_SEED: &[u8] = b"vault";
const SECONDS_PER_DAY: i64 = 86_400;

#[program]
pub mod vaultpilot {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        per_transaction_limit: u64,
        daily_limit: u64,
    ) -> Result<()> {
        validate_limits(per_transaction_limit, daily_limit)?;

        let clock = Clock::get()?;
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.per_transaction_limit = per_transaction_limit;
        vault.daily_limit = daily_limit;
        vault.spent_today = 0;
        vault.day_index = day_index(clock.unix_timestamp);
        vault.total_deposited = 0;
        vault.total_paid = 0;
        vault.payment_count = 0;
        vault.is_paused = false;
        vault.bump = ctx.bumps.vault;

        emit!(VaultInitialized {
            owner: vault.owner,
            vault: vault.key(),
            per_transaction_limit,
            daily_limit,
        });

        Ok(())
    }

    pub fn update_limits(
        ctx: Context<ManageVault>,
        per_transaction_limit: u64,
        daily_limit: u64,
    ) -> Result<()> {
        validate_limits(per_transaction_limit, daily_limit)?;

        let vault = &mut ctx.accounts.vault;
        vault.refresh_day(Clock::get()?.unix_timestamp);
        vault.per_transaction_limit = per_transaction_limit;
        vault.daily_limit = daily_limit;

        emit!(LimitsUpdated {
            owner: vault.owner,
            vault: vault.key(),
            per_transaction_limit,
            daily_limit,
        });

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        let transfer_accounts = Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        };
        let transfer_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        );
        system_program::transfer(transfer_context, amount)?;

        let vault = &mut ctx.accounts.vault;
        vault.total_deposited = vault
            .total_deposited
            .checked_add(amount)
            .ok_or(VaultError::ArithmeticOverflow)?;

        emit!(FundsDeposited {
            owner: vault.owner,
            vault: vault.key(),
            amount,
            total_deposited: vault.total_deposited,
        });

        Ok(())
    }

    pub fn pay(ctx: Context<Pay>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        require!(
            ctx.accounts.recipient.key() != ctx.accounts.vault.key(),
            VaultError::InvalidRecipient
        );

        let unix_timestamp = Clock::get()?.unix_timestamp;
        let vault = &mut ctx.accounts.vault;
        vault.refresh_day(unix_timestamp);

        require!(!vault.is_paused, VaultError::VaultPaused);
        require!(
            amount <= vault.per_transaction_limit,
            VaultError::PerTransactionLimitExceeded
        );

        let next_daily_spend = vault
            .spent_today
            .checked_add(amount)
            .ok_or(VaultError::ArithmeticOverflow)?;
        require!(
            next_daily_spend <= vault.daily_limit,
            VaultError::DailyLimitExceeded
        );

        let vault_info = vault.to_account_info();
        let recipient_info = ctx.accounts.recipient.to_account_info();
        let rent_floor = Rent::get()?.minimum_balance(Vault::DISCRIMINATOR.len() + Vault::INIT_SPACE);
        let vault_balance = vault_info.lamports();
        let spendable_balance = vault_balance
            .checked_sub(rent_floor)
            .ok_or(VaultError::InsufficientVaultBalance)?;
        require!(amount <= spendable_balance, VaultError::InsufficientVaultBalance);

        let recipient_balance = recipient_info.lamports();
        let next_recipient_balance = recipient_balance
            .checked_add(amount)
            .ok_or(VaultError::ArithmeticOverflow)?;
        let next_vault_balance = vault_balance
            .checked_sub(amount)
            .ok_or(VaultError::ArithmeticOverflow)?;

        vault.spent_today = next_daily_spend;
        vault.total_paid = vault
            .total_paid
            .checked_add(amount)
            .ok_or(VaultError::ArithmeticOverflow)?;
        vault.payment_count = vault
            .payment_count
            .checked_add(1)
            .ok_or(VaultError::ArithmeticOverflow)?;

        let owner = vault.owner;
        let vault_key = vault.key();
        let recipient = ctx.accounts.recipient.key();
        let total_paid = vault.total_paid;
        let payment_count = vault.payment_count;

        **vault_info.try_borrow_mut_lamports()? = next_vault_balance;
        **recipient_info.try_borrow_mut_lamports()? = next_recipient_balance;

        emit!(PaymentExecuted {
            owner,
            vault: vault_key,
            recipient,
            amount,
            spent_today: next_daily_spend,
            total_paid,
            payment_count,
            unix_timestamp,
        });

        Ok(())
    }

    pub fn set_paused(ctx: Context<ManageVault>, is_paused: bool) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.is_paused = is_paused;

        emit!(PauseStatusChanged {
            owner: vault.owner,
            vault: vault.key(),
            is_paused,
        });

        Ok(())
    }

    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        emit!(VaultClosed {
            owner: ctx.accounts.owner.key(),
            vault: ctx.accounts.vault.key(),
            lamports_returned: ctx.accounts.vault.to_account_info().lamports(),
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = Vault::DISCRIMINATOR.len() + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageVault<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pay<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, Vault>,
    /// CHECK: Any writable account may receive lamports. The program never reads or deserializes it.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        seeds = [VAULT_SEED, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, Vault>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    pub per_transaction_limit: u64,
    pub daily_limit: u64,
    pub spent_today: u64,
    pub day_index: i64,
    pub total_deposited: u64,
    pub total_paid: u64,
    pub payment_count: u64,
    pub is_paused: bool,
    pub bump: u8,
}

// Keep the hand-written web client decoder synchronized with this account layout.
const _: () = assert!(Vault::INIT_SPACE == 90);

impl Vault {
    fn refresh_day(&mut self, unix_timestamp: i64) {
        let current_day = day_index(unix_timestamp);
        if current_day > self.day_index {
            self.day_index = current_day;
            self.spent_today = 0;
        }
    }
}

fn day_index(unix_timestamp: i64) -> i64 {
    unix_timestamp.div_euclid(SECONDS_PER_DAY)
}

fn validate_limits(per_transaction_limit: u64, daily_limit: u64) -> Result<()> {
    require!(
        per_transaction_limit > 0,
        VaultError::InvalidPerTransactionLimit
    );
    require!(
        daily_limit >= per_transaction_limit,
        VaultError::InvalidDailyLimit
    );
    Ok(())
}

#[event]
pub struct VaultInitialized {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub per_transaction_limit: u64,
    pub daily_limit: u64,
}

#[event]
pub struct LimitsUpdated {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub per_transaction_limit: u64,
    pub daily_limit: u64,
}

#[event]
pub struct FundsDeposited {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
}

#[event]
pub struct PaymentExecuted {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub spent_today: u64,
    pub total_paid: u64,
    pub payment_count: u64,
    pub unix_timestamp: i64,
}

#[event]
pub struct PauseStatusChanged {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub is_paused: bool,
}

#[event]
pub struct VaultClosed {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub lamports_returned: u64,
}

#[error_code]
pub enum VaultError {
    #[msg("The per-transaction limit must be greater than zero.")]
    InvalidPerTransactionLimit,
    #[msg("The daily limit must be at least the per-transaction limit.")]
    InvalidDailyLimit,
    #[msg("The amount must be greater than zero.")]
    ZeroAmount,
    #[msg("The vault is paused.")]
    VaultPaused,
    #[msg("The payment exceeds the per-transaction limit.")]
    PerTransactionLimitExceeded,
    #[msg("The payment exceeds the remaining daily limit.")]
    DailyLimitExceeded,
    #[msg("The vault does not have enough spendable SOL.")]
    InsufficientVaultBalance,
    #[msg("The vault cannot pay itself.")]
    InvalidRecipient,
    #[msg("Arithmetic overflow or underflow occurred.")]
    ArithmeticOverflow,
}
