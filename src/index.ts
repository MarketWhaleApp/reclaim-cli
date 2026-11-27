import "dotenv/config";
import { runCommand } from "./commands/run.js";
import { WalletConfigError } from "./config/walletConfigError.js";

async function main(): Promise<void> {
  await runCommand();
}

main().catch((error: unknown) => {
  const message = error instanceof WalletConfigError ? error.safeMessage : "Unexpected reclaim failure";
  console.error(`[reclaim] fatal error=${message}`);
  process.exitCode = 1;
});
