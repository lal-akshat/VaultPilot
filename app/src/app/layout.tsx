import type { Metadata, Viewport } from "next";
import "@solana/wallet-adapter/styles.css";
import "./globals.css";
import { SolanaProvider } from "@/components/solana-provider";

export const metadata: Metadata = {
  title: "VaultPilot | AI payments with on-chain guardrails",
  description:
    "Turn plain-English payment requests into Solana transactions protected by program-enforced spending limits.",
  applicationName: "VaultPilot",
  keywords: ["Solana", "AI", "payments", "DeFi", "Anchor"],
  openGraph: {
    title: "VaultPilot",
    description: "AI payment intent. Human approval. On-chain guardrails.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07110f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}
