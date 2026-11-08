"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { useConnection, useWallet, WalletMultiButton } from "@solana/wallet-adapter";
import type { PaymentIntent } from "@/lib/types";
import { friendlyError } from "@/lib/errors";
import {
  PROGRAM_ID,
  VAULT_ACCOUNT_SIZE,
  buildCloseVaultInstruction,
  buildDepositInstruction,
  buildInitializeVaultInstruction,
  buildPayInstruction,
  buildSetPausedInstruction,
  buildUpdateLimitsInstruction,
  decodeVault,
  deriveVaultAddress,
  effectiveSpentToday,
  explorerUrl,
  formatLamports,
  parseSolToLamports,
  shortAddress,
  type VaultState,
} from "@/lib/vaultpilot";

type BusyAction =
  | "create"
  | "deposit"
  | "limits"
  | "pause"
  | "pay"
  | "close"
  | null;

type Notice = {
  kind: "success" | "error";
  message: string;
  signature?: string;
};

function ShieldIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 3 20 6.4v5.8c0 4.8-3.1 8.5-8 10.3-4.9-1.8-8-5.5-8-10.3V6.4L12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m8.7 12.2 2.1 2.1 4.7-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" fill="currentColor" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "check-icon check-icon-ok" : "check-icon check-icon-bad"}>
      {ok ? "✓" : "×"}
    </span>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

function StatCard({
  eyebrow,
  value,
  detail,
  accent,
}: {
  eyebrow: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={accent ? "stat-card stat-card-accent" : "stat-card"}>
      <p>{eyebrow}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function ActionButton({
  busy,
  children,
  className = "button button-primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button className={className} {...props} disabled={busy || props.disabled}>
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function VaultDashboard() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [programAvailable, setProgramAvailable] = useState<boolean | null>(null);
  const [vault, setVault] = useState<VaultState | null>(null);
  const [vaultAddress, setVaultAddress] = useState<PublicKey | null>(null);
  const [vaultLamports, setVaultLamports] = useState(0n);
  const [rentFloor, setRentFloor] = useState(0n);
  const [walletLamports, setWalletLamports] = useState(0n);
  const [vaultStatus, setVaultStatus] = useState<
    "idle" | "loading" | "missing" | "ready" | "error"
  >("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [perTransactionInput, setPerTransactionInput] = useState("0.1");
  const [dailyInput, setDailyInput] = useState("0.5");
  const [depositInput, setDepositInput] = useState("0.25");
  const [paymentRequest, setPaymentRequest] = useState("");
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const spentToday = vault ? effectiveSpentToday(vault) : 0n;
  const dailyRemaining = vault
    ? vault.dailyLimit > spentToday
      ? vault.dailyLimit - spentToday
      : 0n
    : 0n;
  const spendableBalance =
    vaultLamports > rentFloor ? vaultLamports - rentFloor : 0n;
  const dailyUsage = vault?.dailyLimit
    ? Math.min(
        100,
        Number((spentToday * 10_000n) / vault.dailyLimit) / 100,
      )
    : 0;
  const intentAmountLamports = (() => {
    if (!intent?.amountSol) return null;
    try {
      return parseSolToLamports(intent.amountSol);
    } catch {
      return null;
    }
  })();

  const loadVault = useCallback(async () => {
    if (!publicKey) {
      setVault(null);
      setVaultAddress(null);
      setVaultLamports(0n);
      setWalletLamports(0n);
      setVaultStatus("idle");
      return;
    }

    setVaultStatus("loading");
    setLoadError(null);
    try {
      const [address] = await deriveVaultAddress(publicKey);
      setVaultAddress(address);
      const [accountInfo, walletBalance, minimumRent] = await Promise.all([
        connection.getAccountInfo(address, "confirmed"),
        connection.getBalance(publicKey, "confirmed"),
        connection.getMinimumBalanceForRentExemption(VAULT_ACCOUNT_SIZE),
      ]);

      setWalletLamports(BigInt(walletBalance));
      setRentFloor(BigInt(minimumRent));

      if (!accountInfo) {
        setVault(null);
        setVaultLamports(0n);
        setVaultStatus("missing");
        return;
      }
      if (!accountInfo.owner.equals(PROGRAM_ID)) {
        throw new Error("The derived vault address is owned by another program.");
      }

      const decoded = decodeVault(accountInfo.data);
      if (!decoded.owner.equals(publicKey)) {
        throw new Error("The vault owner does not match the connected wallet.");
      }

      setVault(decoded);
      setVaultLamports(BigInt(accountInfo.lamports));
      setPerTransactionInput(formatLamports(decoded.perTransactionLimit, 9));
      setDailyInput(formatLamports(decoded.dailyLimit, 9));
      setVaultStatus("ready");
    } catch (error) {
      setVaultStatus("error");
      setLoadError(friendlyError(error));
    }
  }, [connection, publicKey]);

  useEffect(() => {
    let active = true;
    connection
      .getAccountInfo(PROGRAM_ID, "confirmed")
      .then((account) => {
        if (active) setProgramAvailable(Boolean(account?.executable));
      })
      .catch(() => {
        if (active) setProgramAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [connection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVault();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadVault]);

  const submitInstruction = useCallback(
    async (
      action: Exclude<BusyAction, null>,
      successMessage: string,
      instruction: TransactionInstruction,
    ) => {
      if (!publicKey || !sendTransaction) {
        throw new Error("Connect a Solana wallet first.");
      }

      setBusy(action);
      setNotice(null);
      try {
        const {
          context: { slot: minContextSlot },
          value: latestBlockhash,
        } = await connection.getLatestBlockhashAndContext("confirmed");
        const transaction = new Transaction().add(instruction);
        transaction.feePayer = publicKey;
        transaction.recentBlockhash = latestBlockhash.blockhash;
        transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
          preflightCommitment: "confirmed",
          skipPreflight: false,
        });
        const confirmation = await connection.confirmTransaction(
          { signature, ...latestBlockhash },
          "confirmed",
        );
        if (confirmation.value.err) {
          throw new Error(
            `Solana rejected the transaction: ${JSON.stringify(
              confirmation.value.err,
              (_, value) =>
                typeof value === "bigint" ? value.toString() : value,
            )}`,
          );
        }

        setNotice({ kind: "success", message: successMessage, signature });
        await loadVault();
        return signature;
      } catch (error) {
        const message = friendlyError(error);
        setNotice({ kind: "error", message });
        throw error;
      } finally {
        setBusy(null);
      }
    },
    [connection, loadVault, publicKey, sendTransaction],
  );

  async function handleCreateVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publicKey) return;

    try {
      const perTransaction = parseSolToLamports(perTransactionInput);
      const daily = parseSolToLamports(dailyInput);
      if (perTransaction <= 0n) throw new Error("Set a per-payment limit above zero.");
      if (daily < perTransaction) {
        throw new Error("The daily limit must be at least the per-payment limit.");
      }
      await submitInstruction(
        "create",
        "Your guarded vault is live on Devnet.",
        await buildInitializeVaultInstruction(publicKey, perTransaction, daily),
      );
    } catch (error) {
      if (!(error instanceof Error) || busy) return;
      setNotice({ kind: "error", message: friendlyError(error) });
    }
  }

  async function handleDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publicKey) return;

    try {
      const amount = parseSolToLamports(depositInput);
      if (amount <= 0n) throw new Error("Enter a deposit above zero.");
      await submitInstruction(
        "deposit",
        `${formatLamports(amount, 9)} SOL added to the vault.`,
        await buildDepositInstruction(publicKey, amount),
      );
    } catch (error) {
      if (!(error instanceof Error) || busy) return;
      setNotice({ kind: "error", message: friendlyError(error) });
    }
  }

  async function handleUpdateLimits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publicKey) return;

    try {
      const perTransaction = parseSolToLamports(perTransactionInput);
      const daily = parseSolToLamports(dailyInput);
      if (daily < perTransaction) {
        throw new Error("The daily limit must be at least the per-payment limit.");
      }
      await submitInstruction(
        "limits",
        "The program-enforced limits were updated.",
        await buildUpdateLimitsInstruction(publicKey, perTransaction, daily),
      );
    } catch (error) {
      if (!(error instanceof Error) || busy) return;
      setNotice({ kind: "error", message: friendlyError(error) });
    }
  }

  async function handlePause() {
    if (!publicKey || !vault) return;
    try {
      await submitInstruction(
        "pause",
        vault.isPaused ? "Vault resumed." : "Vault paused. Payments are blocked.",
        await buildSetPausedInstruction(publicKey, !vault.isPaused),
      );
    } catch {
      // submitInstruction already publishes a safe error notice.
    }
  }

  async function handleCloseVault() {
    if (!publicKey || !vault) return;
    const confirmed = window.confirm(
      "Close this vault and return all SOL, including rent, to your wallet? This removes the on-chain policy account.",
    );
    if (!confirmed) return;

    try {
      await submitInstruction(
        "close",
        "Vault closed and all SOL returned to your wallet.",
        await buildCloseVaultInstruction(publicKey),
      );
      setIntent(null);
    } catch {
      // submitInstruction already publishes a safe error notice.
    }
  }

  async function analyzePayment() {
    if (!vault || !paymentRequest.trim()) return;
    setAnalyzing(true);
    setIntent(null);
    setNotice(null);

    try {
      const response = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: paymentRequest,
          perTransactionLimitSol: formatLamports(
            vault.perTransactionLimit,
            9,
          ),
          dailyRemainingSol: formatLamports(dailyRemaining, 9),
        }),
      });
      const body = (await response.json()) as PaymentIntent | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "Could not analyze request.");
      }
      setIntent(body);
    } catch (error) {
      setNotice({ kind: "error", message: friendlyError(error) });
    } finally {
      setAnalyzing(false);
    }
  }

  async function executePayment() {
    if (!publicKey || !vault || !intent?.recipient || !intent.amountSol) return;

    try {
      const recipient = new PublicKey(intent.recipient);
      const amount = parseSolToLamports(intent.amountSol);
      await submitInstruction(
        "pay",
        `${intent.amountSol} SOL paid with every guardrail enforced.`,
        await buildPayInstruction(publicKey, recipient, amount),
      );
      setPaymentRequest("");
      setIntent(null);
    } catch (error) {
      if (!(error instanceof Error) || busy) return;
      setNotice({ kind: "error", message: friendlyError(error) });
    }
  }

  const paymentIsSafe = Boolean(
    intent?.action === "pay" &&
      intent.policyChecks.validRecipient &&
      intent.policyChecks.withinPerTransactionLimit &&
      intent.policyChecks.withinDailyLimit &&
      vault &&
      !vault.isPaused &&
      intentAmountLamports !== null &&
      intentAmountLamports <= spendableBalance,
  );

  return (
    <div className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="VaultPilot home">
          <span className="brand-mark"><ShieldIcon size={19} /></span>
          <span>VaultPilot</span>
        </a>
        <div className="topbar-actions">
          <span
            className={`network-pill ${programAvailable === false ? "network-pill-warn" : ""}`}
            title={`Program ${PROGRAM_ID.toBase58()}`}
          >
            <i />
            {programAvailable === null
              ? "Checking Devnet"
              : programAvailable
                ? "Live on Devnet"
                : "Devnet setup needed"}
          </span>
          <WalletMultiButton />
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><SparkIcon size={16} /> AI × Solana treasury</div>
            <h1>
              Say what to pay.
              <span>Guardrails decide what can move.</span>
            </h1>
            <p className="hero-description">
              VaultPilot turns plain-English requests into Solana payments, then
              enforces your limits inside the program before a single lamport moves.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#control-room">
                Open control room <ArrowIcon />
              </a>
              <a
                className="button button-ghost"
                href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                View program
              </a>
            </div>
            <div className="proof-row" aria-label="Solana advantages">
              <div><strong>~1 sec</strong><span>settlement</span></div>
              <div><strong>&lt;$0.01</strong><span>typical fee</span></div>
              <div><strong>100%</strong><span>on-chain limits</span></div>
            </div>
          </div>

          <div className="hero-visual" aria-label="Example guarded payment">
            <div className="console-glow" />
            <div className="console-window">
              <div className="console-bar">
                <div className="window-dots"><i /><i /><i /></div>
                <span>PAYMENT INTENT</span>
                <span className="secure-label"><ShieldIcon size={14} /> secured</span>
              </div>
              <div className="prompt-preview">
                <span className="prompt-spark"><SparkIcon /></span>
                <p>“Send 0.08 SOL to the design contributor.”</p>
              </div>
              <div className="flow-line"><span>AI extracted</span><i /></div>
              <div className="preview-payment">
                <div><small>AMOUNT</small><strong>0.08 SOL</strong></div>
                <div><small>TO</small><strong>9xQe…k3mP</strong></div>
              </div>
              <div className="guard-list">
                <div><CheckIcon ok /><span>Below 0.10 SOL per-payment limit</span></div>
                <div><CheckIcon ok /><span>0.34 SOL remains today</span></div>
                <div><CheckIcon ok /><span>Recipient copied, never invented</span></div>
              </div>
              <button className="preview-button" type="button" tabIndex={-1}>
                Ready for wallet approval <ArrowIcon />
              </button>
            </div>
            <div className="float-card float-card-left"><span>POLICY</span><strong>Program enforced</strong></div>
            <div className="float-card float-card-right"><span>NETWORK</span><strong>Solana Devnet</strong></div>
          </div>
        </section>

        <section className="how-strip" aria-label="How VaultPilot works">
          <div><span>01</span><p><strong>Describe</strong> a SOL payment naturally</p></div>
          <i />
          <div><span>02</span><p><strong>Review</strong> the AI-parsed transaction</p></div>
          <i />
          <div><span>03</span><p><strong>Enforce</strong> limits inside the program</p></div>
        </section>

        <section className="control-room" id="control-room">
          <div className="section-heading">
            <div>
              <span className="section-kicker">LIVE APP</span>
              <h2>Your control room</h2>
            </div>
            {connected && publicKey ? (
              <div className="identity-chip">
                <span className="identity-orb" />
                <div><small>CONNECTED WALLET</small><strong>{shortAddress(publicKey, 5)}</strong></div>
              </div>
            ) : null}
          </div>

          {programAvailable === false ? (
            <div className="callout callout-warning">
              <div className="callout-icon">!</div>
              <div>
                <strong>The program is not deployed at this Devnet address yet.</strong>
                <p>Run the deploy steps in the README, then refresh this page. The interface and AI parser remain available for review.</p>
              </div>
            </div>
          ) : null}

          {!connected ? (
            <div className="connect-gate panel">
              <div className="gate-graphic"><ShieldIcon size={36} /></div>
              <span className="section-kicker">STEP 1</span>
              <h3>Connect a wallet to begin</h3>
              <p>Use Phantom, Solflare, or another Wallet Standard wallet on Devnet. Your wallet always approves state changes.</p>
              <WalletMultiButton />
              <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">Need Devnet SOL? Open the faucet <ArrowIcon /></a>
            </div>
          ) : vaultStatus === "loading" || vaultStatus === "idle" ? (
            <div className="loading-panel panel"><Spinner /><span>Reading your vault from Solana…</span></div>
          ) : vaultStatus === "error" ? (
            <div className="callout callout-error">
              <div className="callout-icon">×</div>
              <div><strong>Could not read this vault.</strong><p>{loadError}</p></div>
              <button className="button button-ghost" onClick={() => void loadVault()}>Retry</button>
            </div>
          ) : vaultStatus === "missing" ? (
            <div className="setup-grid">
              <form className="panel setup-card" onSubmit={handleCreateVault}>
                <span className="section-kicker">STEP 2</span>
                <h3>Create your guarded vault</h3>
                <p>One deterministic PDA stores your policy and holds only the SOL you choose to protect.</p>
                <div className="field-grid">
                  <label>
                    <span>Per-payment limit</span>
                    <div className="input-unit"><input value={perTransactionInput} onChange={(event) => setPerTransactionInput(event.target.value)} inputMode="decimal" aria-label="Per-payment limit in SOL" /><b>SOL</b></div>
                  </label>
                  <label>
                    <span>Daily limit</span>
                    <div className="input-unit"><input value={dailyInput} onChange={(event) => setDailyInput(event.target.value)} inputMode="decimal" aria-label="Daily limit in SOL" /><b>SOL</b></div>
                  </label>
                </div>
                <ActionButton busy={busy === "create"} disabled={programAvailable !== true} type="submit">
                  Create on-chain vault <ArrowIcon />
                </ActionButton>
                <small className="form-note">You pay only Solana rent and the network fee. No VaultPilot fee.</small>
              </form>

              <article className="panel architecture-card">
                <div className="mini-vault"><ShieldIcon size={30} /><i /></div>
                <h3>Why a PDA vault?</h3>
                <ul>
                  <li><CheckIcon ok /><span><strong>Non-custodial.</strong> Your wallet remains the only policy authority.</span></li>
                  <li><CheckIcon ok /><span><strong>Program controlled.</strong> Payments cannot bypass the stored limits.</span></li>
                  <li><CheckIcon ok /><span><strong>Composable.</strong> Every payment and policy change emits an on-chain event.</span></li>
                </ul>
                <div className="address-box"><span>FUTURE VAULT ADDRESS</span><code>{vaultAddress ? shortAddress(vaultAddress, 8) : "—"}</code></div>
              </article>
            </div>
          ) : vault ? (
            <>
              <div className="stats-grid">
                <StatCard eyebrow="SPENDABLE BALANCE" value={`${formatLamports(spendableBalance)} SOL`} detail="Rent reserve excluded" accent />
                <StatCard eyebrow="REMAINING TODAY" value={`${formatLamports(dailyRemaining)} SOL`} detail={`of ${formatLamports(vault.dailyLimit)} SOL policy`} />
                <StatCard eyebrow="PAYMENTS EXECUTED" value={vault.paymentCount.toString()} detail={`${formatLamports(vault.totalPaid)} SOL total`} />
                <StatCard eyebrow="PROTECTION" value={vault.isPaused ? "Paused" : "Active"} detail={vault.isPaused ? "All payments blocked" : "Program guardrails online"} />
              </div>

              <div className="workspace-grid">
                <article className="panel ai-card">
                  <div className="card-heading">
                    <div className="card-icon card-icon-purple"><SparkIcon /></div>
                    <div><span className="section-kicker">AI PAYMENT COPILOT</span><h3>What should the vault pay?</h3></div>
                  </div>
                  <label className="composer">
                    <span className="sr-only">Payment request</span>
                    <textarea
                      value={paymentRequest}
                      onChange={(event) => {
                        setPaymentRequest(event.target.value);
                        setIntent(null);
                      }}
                      maxLength={500}
                      placeholder="Send 0.05 SOL to 7xKX… for the API invoice"
                    />
                    <div className="composer-footer">
                      <button
                        type="button"
                        className="example-button"
                        onClick={() => {
                          if (publicKey) {
                            setPaymentRequest(`Send 0.01 SOL to ${publicKey.toBase58()} for the demo`);
                            setIntent(null);
                          }
                        }}
                      >
                        Use safe demo
                      </button>
                      <ActionButton
                        className="button button-ai"
                        busy={analyzing}
                        disabled={!paymentRequest.trim() || vault.isPaused}
                        type="button"
                        onClick={() => void analyzePayment()}
                      >
                        <SparkIcon size={17} /> Analyze intent
                      </ActionButton>
                    </div>
                  </label>

                  {vault.isPaused ? (
                    <div className="inline-alert">Vault paused. Resume payments in Policy controls before preparing an intent.</div>
                  ) : null}

                  {intent ? (
                    <div className="intent-review">
                      <div className="review-topline">
                        <span className={`source-badge source-${intent.source}`}><i />{intent.source === "ai" ? "AI interpreted" : "Safe parser fallback"}</span>
                        <span>{Math.round(intent.confidence * 100)}% confidence</span>
                      </div>
                      <p className="intent-summary">{intent.summary}</p>
                      <div className="intent-values">
                        <div><span>AMOUNT</span><strong>{intent.amountSol ? `${intent.amountSol} SOL` : "Missing"}</strong></div>
                        <div><span>RECIPIENT</span><strong title={intent.recipient ?? undefined}>{intent.recipient ? shortAddress(intent.recipient, 7) : "Missing"}</strong></div>
                      </div>
                      <div className="policy-checks">
                        <div><CheckIcon ok={intent.policyChecks.validRecipient} /><span>Valid Solana recipient</span></div>
                        <div><CheckIcon ok={intent.policyChecks.withinPerTransactionLimit} /><span>Within {formatLamports(vault.perTransactionLimit)} SOL payment cap</span></div>
                        <div><CheckIcon ok={intent.policyChecks.withinDailyLimit} /><span>Within {formatLamports(dailyRemaining)} SOL daily remainder</span></div>
                        <div><CheckIcon ok={Boolean(intentAmountLamports !== null && intentAmountLamports <= spendableBalance)} /><span>Vault has enough spendable SOL</span></div>
                      </div>
                      {intent.warnings.length ? (
                        <ul className="warning-list">{intent.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                      ) : null}
                      <ActionButton
                        busy={busy === "pay"}
                        disabled={!paymentIsSafe}
                        onClick={() => void executePayment()}
                        type="button"
                      >
                        Approve in wallet &amp; pay <ArrowIcon />
                      </ActionButton>
                      <p className="approval-note"><ShieldIcon size={14} /> The AI cannot sign. Your wallet confirms the exact transaction.</p>
                    </div>
                  ) : (
                    <div className="empty-intent">
                      <div className="empty-orbit"><SparkIcon /><i /></div>
                      <p>Your structured payment and policy checks will appear here.</p>
                    </div>
                  )}
                </article>

                <div className="side-stack">
                  <form className="panel compact-card" onSubmit={handleDeposit}>
                    <div className="card-heading compact-heading">
                      <div className="card-icon card-icon-green">↓</div>
                      <div><span className="section-kicker">FUND VAULT</span><h3>Add protected SOL</h3></div>
                    </div>
                    <div className="balance-line"><span>Wallet balance</span><strong>{formatLamports(walletLamports)} SOL</strong></div>
                    <div className="inline-form">
                      <div className="input-unit"><input value={depositInput} onChange={(event) => setDepositInput(event.target.value)} inputMode="decimal" aria-label="Deposit amount in SOL" /><b>SOL</b></div>
                      <ActionButton busy={busy === "deposit"} type="submit">Deposit</ActionButton>
                    </div>
                  </form>

                  <form className="panel compact-card policy-card" onSubmit={handleUpdateLimits}>
                    <div className="card-heading compact-heading">
                      <div className="card-icon"><ShieldIcon size={18} /></div>
                      <div><span className="section-kicker">POLICY CONTROLS</span><h3>On-chain guardrails</h3></div>
                      <span className={vault.isPaused ? "status-tag status-paused" : "status-tag"}>{vault.isPaused ? "PAUSED" : "ACTIVE"}</span>
                    </div>
                    <div className="usage-row"><span>Daily usage</span><strong>{formatLamports(spentToday)} / {formatLamports(vault.dailyLimit)} SOL</strong></div>
                    <div className="meter"><i style={{ width: `${dailyUsage}%` }} /></div>
                    <div className="field-grid policy-fields">
                      <label><span>Per payment</span><div className="input-unit"><input value={perTransactionInput} onChange={(event) => setPerTransactionInput(event.target.value)} inputMode="decimal" /><b>SOL</b></div></label>
                      <label><span>Per UTC day</span><div className="input-unit"><input value={dailyInput} onChange={(event) => setDailyInput(event.target.value)} inputMode="decimal" /><b>SOL</b></div></label>
                    </div>
                    <div className="policy-actions">
                      <ActionButton busy={busy === "limits"} className="button button-secondary" type="submit">Save limits</ActionButton>
                      <ActionButton busy={busy === "pause"} className={vault.isPaused ? "button button-resume" : "button button-danger"} type="button" onClick={() => void handlePause()}>{vault.isPaused ? "Resume" : "Pause"}</ActionButton>
                    </div>
                    <details className="advanced-controls">
                      <summary>Advanced &amp; recovery</summary>
                      <div className="vault-address-row">
                        <div><span>VAULT PDA</span><code title={vaultAddress?.toBase58()}>{vaultAddress ? shortAddress(vaultAddress, 7) : "—"}</code></div>
                        <button type="button" onClick={() => vaultAddress && void navigator.clipboard.writeText(vaultAddress.toBase58())}>Copy</button>
                      </div>
                      <ActionButton busy={busy === "close"} className="text-danger" type="button" onClick={() => void handleCloseVault()}>Close vault &amp; withdraw all SOL</ActionButton>
                    </details>
                  </form>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="architecture-section">
          <div className="section-heading centered-heading">
            <div><span className="section-kicker">BUILT FOR SOLANA</span><h2>AI proposes. The program disposes.</h2></div>
            <p>The model never receives signing power. Deterministic code makes the final decision against live on-chain state.</p>
          </div>
          <div className="architecture-flow">
            <article><span className="flow-number">01</span><div className="flow-icon"><SparkIcon /></div><h3>Intent layer</h3><p>An OpenAI-compatible model extracts the amount and exact address. Strict validation rejects invented or incomplete fields.</p><code>POST /api/intent</code></article>
            <div className="flow-arrow"><ArrowIcon /></div>
            <article><span className="flow-number">02</span><div className="flow-icon"><ShieldIcon /></div><h3>Policy layer</h3><p>The Anchor program checks ownership, pause status, per-payment cap, daily cap, and available PDA balance.</p><code>vaultpilot::pay</code></article>
            <div className="flow-arrow"><ArrowIcon /></div>
            <article><span className="flow-number">03</span><div className="flow-icon">◎</div><h3>Settlement layer</h3><p>Only a valid wallet-approved instruction moves lamports. The payment produces a composable on-chain event.</p><code>PaymentExecuted</code></article>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark"><ShieldIcon size={17} /></span><span>VaultPilot</span></a>
        <p>Built for the MLH Solana Hackathon · Devnet funds have no monetary value.</p>
        <div><a href="https://github.com/solana-developers" target="_blank" rel="noreferrer">Solana resources</a><a href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer">Explorer</a></div>
      </footer>

      {notice ? (
        <div className={`toast toast-${notice.kind}`} role="status" aria-live="polite">
          <span>{notice.kind === "success" ? "✓" : "!"}</span>
          <p>{notice.message}</p>
          {notice.signature ? <a href={explorerUrl(notice.signature)} target="_blank" rel="noreferrer">Explorer</a> : null}
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button>
        </div>
      ) : null}
    </div>
  );
}
