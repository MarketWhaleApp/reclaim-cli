import { ReclaimApiClient } from "../client/reclaimApi.js";
import { ReclaimBatch } from "../types/api.js";
import { signUnsignedTransaction } from "../signer/solanaSigner.js";
import { Keypair } from "@solana/web3.js";

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
}

export async function executeBatches(
  api: ReclaimApiClient,
  options: ExecuteBatchesOptions,
): Promise<BatchExecutionResult[]> {
  const results: BatchExecutionResult[] = [];

  for (const [batchIndex, batch] of options.batches.entries()) {
    try {
      const signedTx = signUnsignedTransaction(batch.unsignedTx, options.keypair);
      const execution = await api.executeReclaim({
        signedTx,
        publicKey: options.publicKey,
      });

      results.push({
        batchIndex,
        emptyCount: batch.emptyCount,
        txid: execution.txid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown batch execution error";
      results.push({
        batchIndex,
        emptyCount: batch.emptyCount,
        error: message,
      });

      if (options.stopOnError) {
        break;
      }
    }
  }

  return results;
}
