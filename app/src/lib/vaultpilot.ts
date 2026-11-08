import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

const DEFAULT_PROGRAM_ID = "FdJjp7evC18dbEK7xj3fBccNo15HrXzz4XGAKD9fKUVd";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_VAULTPILOT_PROGRAM_ID ?? DEFAULT_PROGRAM_ID,
);
export const VAULT_SEED = Buffer.from("vault");
export const VAULT_ACCOUNT_SIZE = 98;
export const LAMPORTS_PER_SOL_BIGINT = 1_000_000_000n;

const DISCRIMINATORS = {
  initializeVault: Buffer.from([48, 191, 163, 44, 71, 129, 63, 164]),
  updateLimits: Buffer.from([89, 37, 137, 60, 75, 70, 48, 194]),
  deposit: Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]),
  pay: Buffer.from([119, 18, 216, 65, 192, 117, 122, 220]),
  setPaused: Buffer.from([91, 60, 125, 192, 176, 225, 166, 218]),
  closeVault: Buffer.from([141, 103, 17, 126, 72, 75, 29, 29]),
  vaultAccount: Buffer.from([211, 8, 232, 43, 2, 152, 117, 119]),
} as const;

export interface VaultState {
  owner: PublicKey;
  perTransactionLimit: bigint;
  dailyLimit: bigint;
  spentToday: bigint;
  dayIndex: bigint;
  totalDeposited: bigint;
  totalPaid: bigint;
  paymentCount: bigint;
  isPaused: boolean;
  bump: number;
}

function encodeU64(value: bigint): Buffer {
  if (value < 0n || value > 18_446_744_073_709_551_615n) {
    throw new Error("Amount is outside the unsigned 64-bit range.");
  }

  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64LE(value);
  return encoded;
}

function instructionData(
  discriminator: Buffer,
  ...values: bigint[]
): Buffer {
  return Buffer.concat([discriminator, ...values.map(encodeU64)]);
}

export async function deriveVaultAddress(
  owner: PublicKey,
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [VAULT_SEED, owner.toBytes()],
    PROGRAM_ID,
  );
}

export function decodeVault(data: Buffer | Uint8Array): VaultState {
  const bytes = Buffer.from(data);

  if (bytes.length < VAULT_ACCOUNT_SIZE) {
    throw new Error("Vault account data is too short.");
  }
  if (!bytes.subarray(0, 8).equals(DISCRIMINATORS.vaultAccount)) {
    throw new Error("Account is not a VaultPilot vault.");
  }

  return {
    owner: new PublicKey(bytes.subarray(8, 40)),
    perTransactionLimit: bytes.readBigUInt64LE(40),
    dailyLimit: bytes.readBigUInt64LE(48),
    spentToday: bytes.readBigUInt64LE(56),
    dayIndex: bytes.readBigInt64LE(64),
    totalDeposited: bytes.readBigUInt64LE(72),
    totalPaid: bytes.readBigUInt64LE(80),
    paymentCount: bytes.readBigUInt64LE(88),
    isPaused: bytes[96] === 1,
    bump: bytes[97],
  };
}

export async function buildInitializeVaultInstruction(
  owner: PublicKey,
  perTransactionLimit: bigint,
  dailyLimit: bigint,
): Promise<TransactionInstruction> {
  const [vault] = await deriveVaultAddress(owner);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData(
      DISCRIMINATORS.initializeVault,
      perTransactionLimit,
      dailyLimit,
    ),
  });
}

export async function buildUpdateLimitsInstruction(
  owner: PublicKey,
  perTransactionLimit: bigint,
  dailyLimit: bigint,
): Promise<TransactionInstruction> {
  const [vault] = await deriveVaultAddress(owner);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
    ],
    data: instructionData(
      DISCRIMINATORS.updateLimits,
      perTransactionLimit,
      dailyLimit,
    ),
  });
}

export async function buildDepositInstruction(
  owner: PublicKey,
  amount: bigint,
): Promise<TransactionInstruction> {
  const [vault] = await deriveVaultAddress(owner);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData(DISCRIMINATORS.deposit, amount),
  });
}

export async function buildPayInstruction(
  owner: PublicKey,
  recipient: PublicKey,
  amount: bigint,
): Promise<TransactionInstruction> {
  const [vault] = await deriveVaultAddress(owner);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
    ],
    data: instructionData(DISCRIMINATORS.pay, amount),
  });
}

export async function buildSetPausedInstruction(
  owner: PublicKey,
  isPaused: boolean,
): Promise<TransactionInstruction> {
  const [vault] = await deriveVaultAddress(owner);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([
      DISCRIMINATORS.setPaused,
      Buffer.from([isPaused ? 1 : 0]),
    ]),
  });
}

export async function buildCloseVaultInstruction(
  owner: PublicKey,
): Promise<TransactionInstruction> {
  const [vault] = await deriveVaultAddress(owner);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
    ],
    data: DISCRIMINATORS.closeVault,
  });
}

export function parseSolToLamports(value: string): bigint {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(normalized);
  if (!match) {
    throw new Error("Enter a valid SOL amount with at most 9 decimal places.");
  }

  const whole = BigInt(match[1]);
  const fractional = (match[2] ?? "").padEnd(9, "0");
  return whole * LAMPORTS_PER_SOL_BIGINT + BigInt(fractional || "0");
}

export function formatLamports(
  lamports: bigint,
  maximumFractionDigits = 4,
): string {
  const isNegative = lamports < 0n;
  const absolute = isNegative ? -lamports : lamports;
  const whole = absolute / LAMPORTS_PER_SOL_BIGINT;
  const fraction = (absolute % LAMPORTS_PER_SOL_BIGINT)
    .toString()
    .padStart(9, "0")
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");

  return `${isNegative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function effectiveSpentToday(vault: VaultState): bigint {
  const today = BigInt(Math.floor(Date.now() / 86_400_000));
  return vault.dayIndex === today ? vault.spentToday : 0n;
}

export function shortAddress(address: PublicKey | string, edge = 4): string {
  const value = typeof address === "string" ? address : address.toBase58();
  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}

export function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
