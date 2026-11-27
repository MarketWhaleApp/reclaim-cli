import { loadConfig } from "../config/env.js";
import { HttpClient } from "../client/http.js";
import { ReclaimApiClient } from "../client/reclaimApi.js";
import { loadKeypair } from "../signer/solanaSigner.js";
import { runReclaim } from "../workflows/reclaimLoop.js";

export async function runCommand(): Promise<void> {
  const config = loadConfig();
  const keypair = loadKeypair(config.privateKey);
  const publicKey = keypair.publicKey.toBase58();

  const http = new HttpClient({
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.timeoutMs,
  });

  const api = new ReclaimApiClient(http);
  const result = await runReclaim(api, keypair);
  const accountsClosed = result.submitted.reduce((sum, batch) => sum + batch.emptyCount, 0);

  console.log(
    `[reclaim] finished wallet=${publicKey} submitted=${result.submitted.length} accountsClosed=${accountsClosed} failedBatches=${result.failure ? 1 : 0}`,
  );

  if (result.failure) {
    process.exitCode = 1;
  }
}
