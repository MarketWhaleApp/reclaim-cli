import { randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { HttpError, RequestTimeoutError } from "../client/http.js";
import type { ReclaimApi } from "../client/reclaimApi.js";
import { PresignCheckError } from "../signer/presignCheck.js";
import { signReclaimTransaction } from "../signer/solanaSigner.js";
import type { ExecuteReclaimResponse, PrepareReclaimResponse, ReclaimBatch } from "../types/api.js";

/** Re-prepare attempts allowed per batch after the service reports `blockhash_expired`. */
export const MAX_BLOCKHASH_RETRIES = 2;

export type ReclaimFailureKind =
  | "prepare_failed"
  | "insufficient_funds"
  | "missing_empty_sol_token_account"
  | "invalid_response"
  | "sign_failed"
  | "presign_rejected"
  | "blockhash_expired"
  | "outcome_unknown";

export interface ReclaimFailure {
  kind: ReclaimFailureKind;
  /** 1-based batch number the run stopped at. */
  batchNumber: number;
  message: string;
}

export interface SubmittedBatch {
  batchIndex: number;
  emptyCount: number;
  txid: string;
}

export interface ReclaimRunResult {
  reclaimAttemptId: string;
  totalEmpty: number;
  submitted: SubmittedBatch[];
  failure?: ReclaimFailure;
}

export interface ReclaimRunOptions {
  log?: (line: string) => void;
  error?: (line: string) => void;
  reclaimAttemptId?: string;
  sign?: typeof signReclaimTransaction;
}

const RESCAN_ADVICE =
  "Do not run reclaim again yet: check the wallet's recent transactions in a Solana explorer, then run `npm run wallet:check` to re-scan before deciding whether to continue.";

function describeHttpError(error: HttpError): string {
  return `HTTP ${error.status}${error.code ? `, code ${error.code}` : ""}`;
}

function oneLine(message: string): string {
  return message.replace(/\s+/g, " ").slice(0, 200);
}

function isValidBatch(batch: unknown, expectedIndex: number): batch is ReclaimBatch {
  if (typeof batch !== "object" || batch === null) return false;
  const b = batch as Partial<ReclaimBatch>;
  return (
    b.batchIndex === expectedIndex &&
    typeof b.unsignedTx === "string" &&
    typeof b.preparedTxToken === "string" &&
    Number.isInteger(b.lastValidBlockHeight) &&
    Number.isInteger(b.emptyCount)
  );
}

/**
 * Run one reclaim attempt: strictly sequential prepare -> check + sign -> execute,
 * one batch at a time, following the service's continuation tokens until it
 * reports no more batches. Mirrors the Reclaim app's own browser client.
 */
export async function runReclaim(api: ReclaimApi, keypair: Keypair, options: ReclaimRunOptions = {}): Promise<ReclaimRunResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const error = options.error ?? ((line: string) => console.error(line));
  const sign = options.sign ?? signReclaimTransaction;
  const publicKey = keypair.publicKey.toBase58();
  const reclaimAttemptId = options.reclaimAttemptId ?? randomUUID();
  const result: ReclaimRunResult = { reclaimAttemptId, totalEmpty: 0, submitted: [] };

  let continuationToken: string | undefined;
  let batchIndex = 0;
  let blockhashRetries = 0;
  let estimatedBatchCount = 0;

  const stop = (kind: ReclaimFailureKind, message: string): ReclaimRunResult => {
    result.failure = { kind, batchNumber: batchIndex + 1, message };
    error(`[reclaim] stopped batch=${batchIndex + 1} reason=${kind}: ${message}`);
    return result;
  };

  log(`[reclaim] wallet=${publicKey} attempt=${reclaimAttemptId} mode=sequential`);

  for (;;) {
    let prepared: PrepareReclaimResponse;
    try {
      prepared = await api.prepareNextBatch({ publicKey, reclaimAttemptId, continuationToken });
    } catch (e) {
      if (e instanceof HttpError && e.code === "insufficient_funds") {
        return stop("insufficient_funds", "The wallet does not have enough SOL to pay the network fee for this batch. Nothing was signed.");
      }
      if (e instanceof HttpError && e.code === "missing_empty_sol_token_account") {
        return stop(
          "missing_empty_sol_token_account",
          "This low-balance wallet needs an empty SOL (wrapped SOL) token account for the service to cover fees. Add at least 0.0001 SOL to the wallet, then run `npm run wallet:check` again. Nothing was signed.",
        );
      }
      const detail = e instanceof HttpError ? describeHttpError(e) : e instanceof RequestTimeoutError ? "timed out" : "network error";
      return stop("prepare_failed", `Preparing the batch failed (${detail}). Nothing was signed for this batch.`);
    }

    if (typeof prepared !== "object" || prepared === null || !Array.isArray(prepared.batches)) {
      return stop("invalid_response", "The service returned an unexpected prepare response. Nothing was signed for this batch.");
    }

    if (batchIndex === 0 && blockhashRetries === 0) {
      result.totalEmpty = Number.isSafeInteger(prepared.totalEmpty) ? Number(prepared.totalEmpty) : 0;
      log(`[reclaim] closable=${result.totalEmpty} estimatedBatches=${prepared.estimatedBatchCount ?? 0}`);
    }

    if (prepared.batches.length === 0) {
      if (batchIndex === 0) log("[reclaim] nothing to reclaim");
      return result;
    }

    const batch = prepared.batches[0];
    if (prepared.batches.length !== 1 || !isValidBatch(batch, batchIndex)) {
      return stop("invalid_response", "The service returned an unexpected batch. Nothing was signed for this batch.");
    }
    if (Number.isSafeInteger(prepared.estimatedBatchCount)) estimatedBatchCount = Number(prepared.estimatedBatchCount);

    let signedTx: string;
    try {
      signedTx = sign(batch.unsignedTx, keypair, batch.fees);
    } catch (e) {
      if (e instanceof PresignCheckError) {
        return stop("presign_rejected", `${e.message}. Nothing was signed or submitted.`);
      }
      const detail = e instanceof Error ? oneLine(e.message) : "unknown error";
      return stop("sign_failed", `Could not sign the batch locally (${detail}). Nothing was submitted.`);
    }

    let executed: ExecuteReclaimResponse;
    try {
      executed = await api.executeBatch({
        signedTx,
        preparedTx: batch.unsignedTx,
        publicKey,
        reclaimAttemptId,
        batchIndex: batch.batchIndex,
        requiresServiceSignature: batch.requiresServiceSignature === true,
        preparedTxToken: batch.preparedTxToken,
        lastValidBlockHeight: batch.lastValidBlockHeight,
        preparedAt: batch.preparedAt,
      });
    } catch (e) {
      if (e instanceof HttpError && e.code === "blockhash_expired") {
        if (blockhashRetries < MAX_BLOCKHASH_RETRIES) {
          blockhashRetries += 1;
          log(`[reclaim] batch=${batchIndex + 1} expired before landing; preparing a fresh transaction (retry ${blockhashRetries}/${MAX_BLOCKHASH_RETRIES})`);
          continue;
        }
        return stop("blockhash_expired", `The batch expired before reaching Solana ${blockhashRetries + 1} times. ${RESCAN_ADVICE}`);
      }
      if (e instanceof HttpError && e.code === "insufficient_funds") {
        return stop("insufficient_funds", "The wallet does not have enough SOL to pay the network fee for this batch.");
      }
      const detail =
        e instanceof RequestTimeoutError
          ? `no response within ${Math.round(e.timeoutMs / 1000)}s`
          : e instanceof HttpError
            ? describeHttpError(e)
            : "network error";
      return stop("outcome_unknown", `The signed batch was sent but its outcome is unknown (${detail}). ${RESCAN_ADVICE}`);
    }

    const txid = typeof executed?.txid === "string" && executed.txid ? executed.txid : null;
    if (!txid) {
      return stop("outcome_unknown", `The service accepted the batch without returning a transaction id. ${RESCAN_ADVICE}`);
    }

    result.submitted.push({ batchIndex: batch.batchIndex, emptyCount: batch.emptyCount, txid });
    log(`[reclaim] batch=${batchIndex + 1}/${Math.max(estimatedBatchCount, batchIndex + 1)} empty=${batch.emptyCount} txid=${txid}`);

    if (prepared.hasMore !== true) return result;

    if (typeof executed.continuationToken !== "string" || !executed.continuationToken) {
      batchIndex += 1;
      return stop("invalid_response", "The service did not return a continuation token, so the next batch cannot be prepared. Run `npm run wallet:check` to re-scan.");
    }

    continuationToken = executed.continuationToken;
    batchIndex += 1;
    blockhashRetries = 0;
  }
}
