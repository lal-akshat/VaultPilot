# VaultPilot 1–2 minute video narration

Meet VaultPilot, an AI-assisted Solana treasury with spending rules enforced on-chain.

AI makes payment workflows easier, but giving a model unrestricted wallet access is dangerous. VaultPilot separates intent from authority. The AI proposes a payment. The user reviews and signs it. A Solana program makes the final decision.

First, the owner connects a wallet and creates a deterministic vault account. They choose a maximum of 0.1 SOL per payment and 0.5 SOL per UTC day. Those rules and the protected balance live in a program-owned PDA, not a private web database.

The owner deposits 0.25 SOL. VaultPilot excludes the rent reserve when showing spendable funds.

Next, the owner types a natural request: send 0.05 SOL to this contributor for the API invoice. The intent layer extracts the exact amount and user-supplied address. It never invents a recipient.

Before approval, VaultPilot checks the address, per-payment cap, daily remainder, and available balance. The wallet still controls the signature. The Anchor program repeats every critical check using current on-chain state, transfers lamports, updates daily usage, and emits a `PaymentExecuted` event.

The important part is the failure path. A request for 0.2 SOL exceeds the 0.1 cap. Approval is disabled, and even a modified client would be rejected by the program.

VaultPilot uses Solana for real utility: custody, policy enforcement, low-cost settlement, and composable events. AI proposes. Solana enforces.
