// Keep aligned with the versioned OpenAPI contract in the web repository.
export const PREVIEW_VERSION = "1.0" as const;
export type PreviewReason = "NO_EMPTY_ACCOUNTS" | "ONLY_PROTECTED_NATIVE_ACCOUNT" | "MISSING_NATIVE_SOL_ACCOUNT" | "UNSUPPORTED_CLOSE_AUTHORITY" | "NO_POSITIVE_ESTIMATE";
export type PreviewErrorCode = "INVALID_REQUEST" | "INVALID_PUBLIC_KEY" | "RATE_LIMITED" | "RPC_UNAVAILABLE" | "RPC_TIMEOUT" | "WALLET_TOO_LARGE" | "SERVICE_UNAVAILABLE";
export interface PreviewV1 {
  schemaVersion: typeof PREVIEW_VERSION;
  publicKey: string;
  network: "mainnet-beta";
  observation: { commitment: "confirmed"; minSlot: number; maxSlot: number; observedAt: string; expiresAt: string };
  accounts: { scanned: number; empty: number; candidates: number; protected: number };
  amounts: {
    walletBalanceLamports: string;
    grossRentLamports: string;
    deductions: {
      serviceLamports: string;
      referralPortionLamports: string;
      referralRecipient: "service";
      subsidyLamports: string;
      serviceAccountRentLamports: string;
      networkFeeLamports: null;
    };
    estimatedNetLamports: string;
    estimatedNetIncludesNetworkFee: false;
  };
  eligibility: { status: "eligible" | "blocked" | "no_accounts"; reasonCodes: PreviewReason[] };
  warnings: string[];
  continueUrl: string;
}
