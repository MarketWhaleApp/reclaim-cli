export interface ReclaimReferralInfo {
  autoCode: string | null;
  vanityCode: string | null;
}

export interface ReclaimSummaryResponse {
  count: number;
  grossSol: number;
  netSol: number;
  walletSol: number;
  referral: ReclaimReferralInfo;
}

export interface PrepareReclaimRequest {
  publicKey: string;
  balance?: number;
}

export interface ReclaimBatchFees {
  serviceLamports: number;
  referralLamports: number;
  referralPubkey?: string | null;
}

export interface ReclaimBatch {
  emptyCount: number;
  unsignedTx: string;
  grossLamports: number;
  netLamports: number;
  fees: ReclaimBatchFees;
}

export interface PrepareReclaimResponse {
  totalEmpty: number;
  totalGrossSol: number;
  totalNetSol?: number;
  hasValidReferral?: boolean;
  feePercentsBps?: {
    serviceBps: number;
    referralBps: number;
  };
  batches: ReclaimBatch[];
}

export interface ExecuteReclaimRequest {
  signedTx: string;
  publicKey: string;
}

export interface ExecuteReclaimResponse {
  txid: string;
}

export interface ApiErrorResponse {
  error: string;
}
