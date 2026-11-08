export type IntentSource = "ai" | "rules";

export interface PaymentIntent {
  action: "pay" | "unknown";
  amountSol: string | null;
  recipient: string | null;
  confidence: number;
  summary: string;
  warnings: string[];
  source: IntentSource;
  policyChecks: {
    validRecipient: boolean;
    withinPerTransactionLimit: boolean;
    withinDailyLimit: boolean;
  };
}

export interface IntentRequest {
  message: string;
  perTransactionLimitSol?: string;
  dailyRemainingSol?: string;
}
