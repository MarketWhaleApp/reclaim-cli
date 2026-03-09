import "dotenv/config";
import { HttpClient } from "../client/http.js";
import { ReclaimApiClient } from "../client/reclaimApi.js";
import { loadConfig } from "../config/env.js";
import { loadKeypair } from "../signer/solanaSigner.js";

const DEFAULT_API_BASE_URL = "https://reclaim.mwh.app";
const DEFAULT_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  const cliPublicKey = process.argv[2]?.trim();
  const publicKey = cliPublicKey || derivePublicKeyFromEnv();

  const api = new ReclaimApiClient(
    new HttpClient({
      baseUrl: DEFAULT_API_BASE_URL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    }),
  );

  const summary = await api.getSummary(publicKey);

  console.log("Wallet Check");
  console.log("");
  console.log(`Your wallet ${publicKey} can close ${summary.count} account${summary.count === 1 ? "" : "s"}.`);
  console.log(`You can receive ${formatSol(summary.netSol)}.`);
  console.log(`Current wallet balance -> ${formatSol(summary.walletSol)}`);
  console.log(`Wallet balance after reclaim -> ${formatSol(summary.walletSol + summary.netSol)}`);
  console.log("");
  console.log('Run "npm run start" to begin reclaim execution.');
}

function derivePublicKeyFromEnv(): string {
  const config = loadConfig();
  const keypair = loadKeypair(config.privateKey);

  return keypair.publicKey.toBase58();
}

function formatSol(value: number): string {
  return `${value.toFixed(6)} SOL`;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown smoke test error";
  console.error(`[wallet:check] failed: ${message}`);
  process.exitCode = 1;
});
