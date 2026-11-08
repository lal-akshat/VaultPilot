const ANCHOR_ERROR_MESSAGES: Record<number, string> = {
  6000: "The per-payment limit must be greater than zero.",
  6001: "The daily limit must be at least the per-payment limit.",
  6002: "The payment amount must be greater than zero.",
  6003: "This vault is paused. Resume it before paying.",
  6004: "This payment is above the vault's per-payment limit.",
  6005: "This payment is above the vault's remaining daily limit.",
  6006: "The vault does not have enough spendable SOL.",
  6007: "A vault cannot pay itself.",
  6008: "The program rejected an unsafe arithmetic operation.",
};

export function friendlyError(error: unknown): string {
  const fallback = "The transaction failed. Check your wallet and try again.";
  if (!(error instanceof Error)) return fallback;

  const text = error.message;
  const anchorCode = /custom program error: 0x([0-9a-f]+)/i.exec(text);
  if (anchorCode) {
    const numericCode = Number.parseInt(anchorCode[1], 16);
    if (ANCHOR_ERROR_MESSAGES[numericCode]) {
      return ANCHOR_ERROR_MESSAGES[numericCode];
    }
  }

  if (/User rejected|rejected the request/i.test(text)) {
    return "You cancelled the wallet request. No funds moved.";
  }
  if (/Attempt to debit an account but found no record of a prior credit/i.test(text)) {
    return "Your wallet needs Devnet SOL before it can create or fund a vault.";
  }
  if (/Blockhash not found|block height exceeded/i.test(text)) {
    return "The transaction expired before confirmation. Please try again.";
  }
  if (/Account does not exist|could not find account/i.test(text)) {
    return "The VaultPilot program or vault is not available on this cluster.";
  }

  return text.length <= 180 ? text : fallback;
}
