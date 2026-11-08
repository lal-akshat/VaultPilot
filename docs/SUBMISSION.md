# VaultPilot submission kit

## One-line pitch

VaultPilot turns plain-English payment requests into wallet-approved Solana transactions while an Anchor vault enforces spending limits on-chain.

## Short description

AI payment agents are useful only when they cannot quietly overspend. VaultPilot gives users a program-owned SOL vault with a per-payment cap, UTC daily cap, emergency pause, and owner-only recovery. A model extracts an amount and exact user-supplied address from natural language, strict code validates the output, and the user reviews the result before signing. The Solana program repeats every critical policy check against current account state before moving lamports.

## Full submission description

VaultPilot is a non-custodial AI treasury copilot built for Solana. A user connects a Devnet wallet, creates a deterministic Program Derived Address, chooses per-payment and daily limits, and deposits only the SOL they want protected. They can then type a request such as “send 0.02 SOL to this wallet for our design invoice.”

The intent service converts that text into a structured payment. It may use any configured OpenAI-compatible model, but it never accepts model output as authority. The server validates a strict schema, preserves only an address present in the request, validates that address with the Solana SDK, and checks decimal precision and current policy limits. The browser shows the exact recipient, amount, warnings, available balance, and each policy decision. The connected wallet must approve the final instruction.

The VaultPilot Anchor program is the actual enforcement layer. It verifies the owner signer and PDA seeds, checks the pause flag, refreshes daily usage from Solana's Clock sysvar, applies both caps, preserves rent exemption, transfers lamports, updates totals, and emits a `PaymentExecuted` event. A modified client cannot bypass these checks.

Solana makes the product viable: deterministic program custody, public policy state, one-step settlement, low fees for small payments, and events that other treasury tools can compose with.

## Track selection

### AI Track

- The model performs a bounded, useful task: translating natural language into a structured payment and plain-language review.
- Solana gives the AI proposal enforceable ownership, payment, and policy boundaries.
- The AI never receives a private key or signing authority.
- Invalid, incomplete, or over-limit output cannot execute.

### DeFi Track

- VaultPilot moves value from a program-controlled treasury account.
- Limits, balances, authority, daily accounting, settlement, and recovery are on-chain.
- It creates a base for payroll, subscriptions, team treasuries, and agent budgets.

### Top 3 Overall

- The product has a complete wallet-to-settlement flow.
- Blockchain use is central rather than decorative.
- The demo visibly proves both success and rejection paths.
- The architecture has a focused path from hackathon MVP to a useful treasury product.

### Best Beginner Hack

Select this only if more than half the team meets the event's first-time-hacker requirement. Emphasize what the team learned: PDAs, Anchor account constraints, CPIs, direct program-owned lamport movement, Wallet Standard integration, and safe AI boundaries.

## Two-minute demo script

### 0:00–0:15 — Problem

“AI can prepare payments quickly, but giving a model unrestricted wallet access is unsafe. VaultPilot lets AI help while a Solana program controls what can actually move.”

### 0:15–0:35 — Create policy

1. Connect a wallet on Devnet.
2. Create a vault with a `0.10 SOL` per-payment cap and `0.50 SOL` daily cap.
3. Point out the deterministic vault PDA and active policy indicator.

Say: “The balance and policy now live in a program-owned account, not our database.”

### 0:35–0:50 — Fund it

Deposit `0.25 SOL` and show the spendable balance update after confirmation.

Say: “The UI excludes the rent reserve, so it never promises funds the program must preserve.”

### 0:50–1:20 — AI-assisted payment

Use the safe demo button or type:

```text
Send 0.01 SOL to <your connected wallet address> for the demo
```

Show the structured amount, exact recipient, model/fallback source label, confidence, balance check, per-payment check, and daily-limit check. Approve the transaction, then open it in Solana Explorer.

Say: “The AI only proposed this. My wallet signed it, and the program independently enforced the policy.”

### 1:20–1:40 — Prove rejection

Enter a payment above `0.10 SOL`. Show that the review marks the per-payment check as failed and disables approval. If time permits, explain that a hand-crafted instruction also fails on-chain.

### 1:40–1:52 — Emergency control

Pause the vault and show that new intents cannot execute. Resume it.

### 1:52–2:00 — Close

“VaultPilot combines AI usability with Solana-enforced safety. Next we add USDC, recipient allowlists, and bounded session keys for autonomous agents.”

## Submission checklist

- [ ] Public source repository URL
- [ ] Hosted web app URL
- [ ] Devnet program address
- [ ] At least one successful Devnet transaction link
- [ ] Two-minute video showing creation, funding, payment, and rejection
- [ ] AI API configured for the recorded demo
- [ ] AI, DeFi, and Beginner tracks selected when eligible
- [ ] Team member names and first-time-hacker eligibility confirmed
- [ ] Initial submission completed by Sunday at 10:00 AM ET
- [ ] Final submission completed by Sunday at 11:45 AM ET

## Suggested project tagline

**Let AI prepare the payment. Let Solana enforce the rules.**

## Suggested future-work answer

“With more time, we would add USDC through Token-2022, owner-approved session keys for autonomous agents, recipient allowlists, delayed policy increases, and an event indexer for recurring payments and team reporting. We would complete an external security review before any mainnet deployment.”
