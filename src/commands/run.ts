import { loadConfig } from "../config/env.js";
import { HttpClient } from "../client/http.js";
import { ReclaimApiClient } from "../client/reclaimApi.js";
import { loadKeypair } from "../signer/solanaSigner.js";
import { runReclaimLoop } from "../workflows/reclaimLoop.js";

export async function runCommand(): Promise<void> {
  const config = loadConfig();
  const keypair = loadKeypair(config.privateKey);
  const publicKey = keypair.publicKey.toBase58();

  const http = new HttpClient({
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.timeoutMs,
  });

  const api = new ReclaimApiClient(http);
  const results = await runReclaimLoop(api, keypair, config);

  const totalRuns = results.length;
  const totalTxids = results.reduce((sum, result) => sum + result.txids.length, 0);
  const totalFailures = results.reduce((sum, result) => sum + result.failedBatches, 0);

  console.log(
    `[reclaim] finished wallet=${publicKey} runs=${totalRuns} submitted=${totalTxids} failedBatches=${totalFailures}`,
  );
}
