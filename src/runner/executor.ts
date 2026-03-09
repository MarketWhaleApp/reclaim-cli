import { ReclaimApiClient } from "../client/reclaimApi.js";
import { ReclaimBatch } from "../types/api.js";
import { signUnsignedTransaction } from "../signer/solanaSigner.js";
import { Keypair } from "@solana/web3.js";

const SUBMISSION_INTERVAL_MS = 300;
const MAX_IN_FLIGHT = 5;

export interface BatchExecutionResult {
  batchIndex: number;
  emptyCount: number;
  txid?: string;
  error?: string;
}

export interface ExecuteBatchesOptions {
  publicKey: string;
  keypair: Keypair;
  batches: ReclaimBatch[];
  stopOnError: boolean;
  signTransaction?: (unsignedTx: string, keypair: Keypair) => string;
}

export async function executeBatches(
  api: ReclaimApiClient,
  options: ExecuteBatchesOptions,
): Promise<BatchExecutionResult[]> {
  const results: Array<BatchExecutionResult | undefined> = [];
  const inFlight = new Set<Promise<void>>();
  let stopSubmitting = false;
  const signTransaction = options.signTransaction ?? signUnsignedTransaction;

  for (const [batchIndex, batch] of options.batches.entries()) {
    while (inFlight.size >= MAX_IN_FLIGHT) {
      await Promise.race(inFlight);
    }

    if (stopSubmitting) {
      break;
    }

    const task = executeBatch(api, options.publicKey, options.keypair, batchIndex, batch, signTransaction)
      .then((result) => {
        results[batchIndex] = result;

        if (result.error && options.stopOnError) {
          stopSubmitting = true;
        }
      })
      .finally(() => {
        inFlight.delete(task);
      });

    inFlight.add(task);

    if (batchIndex < options.batches.length - 1) {
      await sleep(SUBMISSION_INTERVAL_MS);
    }
  }

  await Promise.allSettled(inFlight);

  return results.filter((result): result is BatchExecutionResult => result !== undefined);
}

async function executeBatch(
  api: ReclaimApiClient,
  publicKey: string,
  keypair: Keypair,
  batchIndex: number,
  batch: ReclaimBatch,
  signTransaction: (unsignedTx: string, keypair: Keypair) => string,
): Promise<BatchExecutionResult> {
  try {
    const signedTx = signTransaction(batch.unsignedTx, keypair);
    const execution = await api.executeReclaim({
      signedTx,
      publicKey,
    });

    return {
      batchIndex,
      emptyCount: batch.emptyCount,
      txid: execution.txid,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown batch execution error";

    return {
      batchIndex,
      emptyCount: batch.emptyCount,
      error: message,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
