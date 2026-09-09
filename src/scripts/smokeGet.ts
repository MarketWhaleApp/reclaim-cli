import { CheckError, fetchPreview, previewText, validatePublicAddress } from "../preview/check.js";
const args = process.argv.slice(2);
const json = args.includes("--json");
async function main(): Promise<void> {
  const positionals = args.filter(arg => !arg.startsWith("--"));
  if (args.some(arg => arg.startsWith("--") && arg !== "--json") || positionals.length > 1 || args.filter(a => a === "--json").length > 1) {
    throw new CheckError("INVALID_REQUEST", "Usage: wallet:check -- PUBLIC_KEY [--json]", 2);
  }
  if (json && positionals.length !== 1) throw new CheckError("INVALID_REQUEST", "JSON preview requires a public address; it never loads a signer.", 2);
  let publicKey = positionals[0];
  if (!publicKey) {
    // Explicit public-address previews never load dotenv or a signer.
    await import("dotenv/config");
    const { loadConfig } = await import("../config/env.js");
    const { loadKeypair } = await import("../signer/solanaSigner.js");
    publicKey = loadKeypair(loadConfig().privateKey).publicKey.toBase58();
  }
  validatePublicAddress(publicKey);
  const preview = await fetchPreview(publicKey, process.env.RECLAIM_API_BASE_URL);
  process.stdout.write((json ? JSON.stringify(preview) : previewText(preview)) + "\n");
  process.exitCode = preview.eligibility.status === "eligible" ? 0 : 3;
}
main().catch((error: unknown) => {
  const e = error instanceof CheckError ? error : new CheckError("PREVIEW_FAILED", "Preview failed. Provide a public address to avoid local signer configuration.", 1);
  if (json) process.stdout.write(JSON.stringify({ schemaVersion: "1.0", error: { code: e.code, message: e.message, retryable: e.retryable, retryAfterSeconds: e.retryAfterSeconds } }) + "\n");
  else process.stderr.write(`[wallet:check] ${e.code}: ${e.message}\n`);
  process.exitCode = e.exitCode;
});
