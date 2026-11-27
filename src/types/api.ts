// Shapes mirror the Reclaim app's browser client (src/lib/reclaim/client-api.ts)
// and batch builder (src/lib/reclaim/batch-builder.ts).

export interface PrepareReclaimRequest {
  publicKey: string;
  reclaimAttemptId: string;
  continuationToken?: string;
}

/** Fees the service quotes for one batch. Any field may be absent; absent means 0. */
export interface ReclaimBatchFees {
  serviceLamports?: number;
  referralLamports?: number;
  serviceRentLamports?: number;
  referralPubkey?: string | null;
}

export interface ReclaimBatch {
  batchIndex: number;
  emptyCount: number;
  unsignedTx: string;
  requiresServiceSignature: boolean;
  serverSignerPublicKey?: string;
  preparedTxToken: string;
  blockhash?: string;
  lastValidBlockHeight: number;
  preparedAt?: string;
  grossLamports?: number;
  netLamports?: number;
  fees?: ReclaimBatchFees;
}

export interface PrepareReclaimResponse {
  reclaimAttemptId?: string;
  totalEmpty?: number;
  totalGrossSol?: number;
  totalNetSol?: number;
  requiresServiceRentFee?: boolean;
  serviceRentFeeLamports?: number;
  hasValidReferral?: boolean;
  feePercentsBps?: {
    serviceBps: number;
    referralBps: number;
  };
  /** Absent when the service has nothing to prepare. */
  hasMore?: boolean;
  estimatedBatchCount?: number;
  /** The service prepares at most one batch per call. */
  batches: ReclaimBatch[];
}

export interface ExecuteReclaimRequest {
  signedTx: string;
  preparedTx: string;
  publicKey: string;
  reclaimAttemptId: string;
  batchIndex: number;
  requiresServiceSignature: boolean;
  preparedTxToken: string;
  lastValidBlockHeight: number;
  preparedAt?: string;
}

export interface ExecuteReclaimResponse {
  txid: string;
  continuationToken: string;
}

export interface ApiErrorResponse {
  error?: string;
  code?: string;
  category?: string;
  retryable?: boolean;
  /** Older spelling still sent on some responses. */
  retriable?: boolean;
  nextAction?: string;
}
