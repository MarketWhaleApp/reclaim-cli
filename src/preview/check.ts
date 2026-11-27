import { PublicKey } from "@solana/web3.js";
import type { PreviewV1 } from "./contract.js";

export const DEFAULT_PREVIEW_BASE_URL = "https://reclaim.mwh.app";
const reasonCodes = ["NO_EMPTY_ACCOUNTS", "ONLY_PROTECTED_NATIVE_ACCOUNT", "MISSING_NATIVE_SOL_ACCOUNT", "UNSUPPORTED_CLOSE_AUTHORITY", "NO_POSITIVE_ESTIMATE"];
export class CheckError extends Error {
  constructor(public code: string, message: string, public exitCode: number, public retryable = false, public retryAfterSeconds: number | null = null) { super(message); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
const amount = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9]\d*)$/.test(v);
const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function validatePreview(value: unknown, publicKey: string, now = Date.now()): PreviewV1 {
  const fail = (): never => { throw new CheckError("INVALID_RESPONSE", "The service returned an incompatible preview.", 1); };
  if (!isRecord(value) || value.schemaVersion !== "1.0" || value.publicKey !== publicKey || value.network !== "mainnet-beta") return fail();
  const { observation, accounts, amounts, eligibility } = value;
  if (!isRecord(observation) || !isRecord(accounts) || !isRecord(amounts) || !isRecord(eligibility)) return fail();
  if (observation.commitment !== "confirmed" || !integer(observation.minSlot) || !integer(observation.maxSlot) || Number(observation.minSlot) > Number(observation.maxSlot)) return fail();
  const observed = typeof observation.observedAt === "string" ? Date.parse(observation.observedAt) : NaN;
  const expires = typeof observation.expiresAt === "string" ? Date.parse(observation.expiresAt) : NaN;
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || expires <= observed || expires - observed > 30_000 || observed > now + 5_000) return fail();
  if (expires <= now) throw new CheckError("STALE_PREVIEW", "The preview has expired. Request a fresh preview.", 1, true);
  if (![accounts.scanned, accounts.empty, accounts.candidates, accounts.protected].every(integer)) return fail();
  if (Number(accounts.scanned) > 5000 || Number(accounts.empty) > Number(accounts.scanned) || Number(accounts.candidates) + Number(accounts.protected) > Number(accounts.empty) || Number(accounts.protected) > 1) return fail();
  const deductions = amounts.deductions;
  if (!isRecord(deductions) || ![amounts.walletBalanceLamports, amounts.grossRentLamports, amounts.estimatedNetLamports, deductions.serviceLamports, deductions.referralPortionLamports, deductions.subsidyLamports, deductions.serviceAccountRentLamports].every(amount)) return fail();
  if (deductions.networkFeeLamports !== null || deductions.referralRecipient !== "service" || amounts.estimatedNetIncludesNetworkFee !== false) return fail();
  const net = BigInt(String(amounts.grossRentLamports)) - BigInt(String(deductions.serviceLamports)) - BigInt(String(deductions.referralPortionLamports)) - BigInt(String(deductions.subsidyLamports)) - BigInt(String(deductions.serviceAccountRentLamports));
  if (String(amounts.estimatedNetLamports) !== String(net > 0n ? net : 0n)) return fail();
  if (!["eligible", "blocked", "no_accounts"].includes(String(eligibility.status)) || !Array.isArray(eligibility.reasonCodes) || !eligibility.reasonCodes.every(c => reasonCodes.includes(c))) return fail();
  if ((eligibility.status === "eligible") !== (eligibility.reasonCodes.length === 0) || (eligibility.status === "no_accounts") !== (accounts.candidates === 0)) return fail();
  if (!Array.isArray(value.warnings) || !value.warnings.every(w => typeof w === "string") || value.continueUrl !== "https://reclaim.mwh.app/") return fail();
  return value as unknown as PreviewV1;
}
export function validatePublicAddress(value: string) {
  try {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) || new PublicKey(value).toBase58() !== value) throw new Error();
    return value;
  } catch { throw new CheckError("INVALID_PUBLIC_KEY", "Supply a canonical Solana public address.", 2); }
}
export async function fetchPreview(publicKey: string, baseUrl = DEFAULT_PREVIEW_BASE_URL, fetcher = fetch): Promise<PreviewV1> {
  validatePublicAddress(publicKey);
  const url = new URL("/api/v1/preview", baseUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new CheckError("INVALID_REQUEST", "Use HTTPS, or HTTP on localhost for development.", 2);
  }
  url.searchParams.set("publicKey", publicKey);
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(16_000), redirect: "error" });
    // Contract responses are small; do not consume unbounded proxy/error pages.
    const reader = response.body?.getReader();
    if (!reader) throw new CheckError("INVALID_RESPONSE", "The service returned an empty response.", 1);
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 64 * 1024) throw new CheckError("INVALID_RESPONSE", "The preview response exceeded its size limit.", 1);
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new CheckError("INVALID_RESPONSE", "The service returned invalid JSON.", 1); }
    if (!response.ok) {
      const error = isRecord(body) && isRecord(body.error) ? body.error : null;
      const code = typeof error?.code === "string" && /^[A-Z_]+$/.test(error.code) ? error.code : "HTTP_ERROR";
      const exitCode = response.status === 429 ? 4 : response.status === 400 ? 2 : 1;
      // Avoid printing arbitrary server messages, URLs, or response bodies.
      const retryHeader = response.headers.get("retry-after");
      const retryAfter = retryHeader && /^\d{1,5}$/.test(retryHeader) ? Number(retryHeader) : null;
      throw new CheckError(code, `Preview request failed (HTTP ${response.status}). See /developers for this error code.`, exitCode, response.status === 429 || response.status >= 500, retryAfter);
    }
    return validatePreview(body, publicKey);
  } catch (error) {
    if (error instanceof CheckError) throw error;
    throw new CheckError("NETWORK_ERROR", "Could not obtain a preview. Check the endpoint and try again.", 1, true);
  }
}
function sol(lamports: string): string {
  const value = BigInt(lamports);
  return `${value / 1_000_000_000n}.${(value % 1_000_000_000n).toString().padStart(9, "0")} SOL`;
}
export function previewText(p: PreviewV1): string {
  const d = p.amounts.deductions;
  return [
    `Wallet Check — ${p.publicKey}`, `${p.accounts.candidates} candidate accounts (${p.accounts.protected} protected).`,
    `Gross rent: ${sol(p.amounts.grossRentLamports)}`,
    `Service: ${sol(d.serviceLamports)}; referral portion (${d.referralRecipient}): ${sol(d.referralPortionLamports)}`,
    `Subsidy: ${sol(d.subsidyLamports)}; service account rent: ${sol(d.serviceAccountRentLamports)}`,
    `Network fee: unknown (excluded from estimate).`,
    `Estimated net before network fees: ${sol(p.amounts.estimatedNetLamports)}`,
    `Current balance: ${sol(p.amounts.walletBalanceLamports)}`,
    `Eligibility: ${p.eligibility.status}; reasons: ${p.eligibility.reasonCodes.join(", ") || "none"}`,
    `Observed: ${p.observation.observedAt}; slots ${p.observation.minSlot}–${p.observation.maxSlot}; expires ${p.observation.expiresAt}`,
    `Warnings: ${p.warnings.join(", ")}`, `No transactions signed or submitted. Continue in your browser: ${p.continueUrl}`,
  ].join("\n");
}
