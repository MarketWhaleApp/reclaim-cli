import { ReclaimApiClient } from "../client/reclaimApi.js";
import { executeBatches } from "../runner/executor.js";
import { Keypair } from "@solana/web3.js";
import { ReclaimRuntimeConfig } from "../types/config.js";

export interface ReclaimRunResult {
  iteration: number;
  totalEmpty: number;
  totalBatches: number;
  executedBatches: number;
  succeededBatches: number;
  failedBatches: number;
  txids: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runReclaimLoop(
  api: ReclaimApiClient,
  keypair: Keypair,
  config: ReclaimRuntimeConfig,
): Promise<ReclaimRunResult[]> {
  const results: ReclaimRunResult[] = [];
  const maxIterations = config.loop.enabled ? (config.loop.maxIterations ?? Number.POSITIVE_INFINITY) : 1;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const publicKey = keypair.publicKey.toBase58();
    const summary = await api.getSummary(publicKey);

    console.log(
      `[reclaim] iteration=${iteration} wallet=${publicKey} empty=${summary.count} walletSol=${summary.walletSol} netSol=${summary.netSol}`,
    );

    if (summary.count === 0) {
      results.push({
        iteration,
        totalEmpty: 0,
        totalBatches: 0,
        executedBatches: 0,
        succeededBatches: 0,
        failedBatches: 0,
        txids: [],
      });
    } else {
      const prepared = await api.prepareReclaim({
        publicKey,
        balance: summary.walletSol,
      });
      const batches = prepared.batches;

      const executions = await executeBatches(api, {
        publicKey,
        keypair,
        batches,
        stopOnError: config.loop.stopOnError,
      });

      const txids = executions.flatMap((result) => (result.txid ? [result.txid] : []));
      const failedBatches = executions.filter((result) => result.error).length;

      for (const result of executions) {
        if (result.txid) {
          console.log(
            `[reclaim] batch=${result.batchIndex + 1}/${batches.length} empty=${result.emptyCount} txid= ${result.txid}`,
          );
        } else {
          console.error(
            `[reclaim] batch=${result.batchIndex + 1}/${batches.length} empty=${result.emptyCount} error=${result.error}`,
          );
        }
      }

      results.push({
        iteration,
        totalEmpty: prepared.totalEmpty,
        totalBatches: prepared.batches.length,
        executedBatches: executions.length,
        succeededBatches: txids.length,
        failedBatches,
        txids,
      });

      if (failedBatches > 0 && config.loop.stopOnError) {
        break;
      }
    }

    if (!config.loop.enabled || iteration >= maxIterations) {
      break;
    }

    await sleep(config.loop.intervalMs);
  }

  return results;
}
