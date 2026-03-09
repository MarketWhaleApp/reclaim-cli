import "dotenv/config";
import { runCommand } from "./commands/run.js";

async function main(): Promise<void> {
  await runCommand();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown fatal error";
  console.error(`[reclaim] fatal error=${message}`);
  process.exitCode = 1;
});
