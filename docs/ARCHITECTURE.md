# VaultPilot architecture and invariants

## Components

### Anchor program

`anchor/programs/vaultpilot/src/lib.rs` owns the treasury policy and value-transfer rules. Every wallet has at most one vault at seeds `[b"vault", owner]`.

### Browser transaction client

`app/src/lib/vaultpilot.ts` uses current web3.js v3. It derives the PDA asynchronously, encodes Anchor-compatible instruction data, decodes account state, and never stores a secret key.

### Intent API

`app/src/app/api/intent/route.ts` treats model output as untrusted input. It has a deterministic fallback so the product can still be demonstrated without a paid API key, but labels the source accurately.

### Product interface

`app/src/components/vault-dashboard.tsx` connects the wallet, reads live Devnet state, builds review screens, submits signed transactions, waits for confirmation, and refreshes the account.

## Enforced program invariants

1. The owner must sign every state-changing instruction.
2. The vault PDA must match `[b"vault", owner]` and its stored bump.
3. The stored owner must match the signer.
4. Per-payment and daily limits must remain positive and internally consistent.
5. A payment must be positive and cannot target the vault itself.
6. A paused vault cannot pay.
7. Daily usage comes from the Clock sysvar, not the browser.
8. `spent_today + amount` cannot exceed the daily limit.
9. `amount` cannot exceed the per-payment limit.
10. The vault retains the current rent-exempt minimum.
11. All additions and subtractions use checked arithmetic.
12. Only successful payments update totals and emit `PaymentExecuted`.

## AI safety pipeline

1. Limit the request to 500 characters.
2. Ask only for a bounded JSON payment-intent schema.
3. Tell the model to treat the request as untrusted data.
4. Reject malformed model responses.
5. Normalize the amount to a positive decimal with no more than nine places.
6. Reconstruct the address with `PublicKey` and require canonical Base58.
7. Compare the amount with live client policy state for preview.
8. Require explicit wallet approval.
9. Repeat authoritative checks in the Solana program.

## Account layout

The Anchor discriminator occupies bytes `0..8`; the `Vault` payload is 90 bytes.

| Offset | Size | Field |
| ---: | ---: | --- |
| 0 | 8 | Anchor account discriminator |
| 8 | 32 | owner |
| 40 | 8 | per-transaction limit |
| 48 | 8 | daily limit |
| 56 | 8 | spent today |
| 64 | 8 | UTC day index, signed |
| 72 | 8 | cumulative deposits |
| 80 | 8 | cumulative payments |
| 88 | 8 | payment count |
| 96 | 1 | paused flag |
| 97 | 1 | canonical bump |

The program contains a compile-time assertion for the 90-byte payload. The browser checks both the 98-byte minimum and account discriminator before decoding.

## Production hardening

Before mainnet:

- Complete an independent program audit.
- Use a managed RPC endpoint rather than the public endpoint.
- Replace process-local API rate limiting with a shared store.
- Add delayed policy increases and separate recovery authority.
- Add telemetry that excludes prompts, addresses, secrets, and signed payloads.
- Pin a reviewed deployment and verify its source build.
