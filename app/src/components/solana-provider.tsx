"use client";

import { type ReactNode } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletModalProvider,
  WalletProvider,
} from "@solana/wallet-adapter";

export function SolanaProvider({ children }: { children: ReactNode }) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet");

  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{ commitment: "confirmed" }}
    >
      <WalletProvider chain="solana:devnet">
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
