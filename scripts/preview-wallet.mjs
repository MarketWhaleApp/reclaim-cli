// Node.js 22+, no dependencies, no private key or local signer access.
const publicKey = process.argv[2];
const baseUrl = process.argv[3] ?? "https://reclaim.mwh.app";
try {
  if (!publicKey || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(publicKey)) throw new Error("Supply a Solana public address.");
  const url = new URL("/api/v1/preview", baseUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Use HTTPS or local HTTP.");
  url.searchParams.set("publicKey", publicKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(16_000), redirect: "error" });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = response.status === 429 ? 4 : !response.ok ? 1 : result.eligibility?.status === "eligible" ? 0 : 3;
} catch {
  console.error("Preview failed. Check the public address and endpoint; no transaction was signed.");
  process.exitCode = 1;
}
