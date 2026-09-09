import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { previewSolanaRent } from "./tool.js";

const fixture = JSON.parse(await readFile(new URL("../../docs/preview-v1-example.json", import.meta.url), "utf8"));
function fresh() {
  const value = structuredClone(fixture);
  const now = Date.now();
  value.observation.observedAt = new Date(now).toISOString();
  value.observation.expiresAt = new Date(now + 30_000).toISOString();
  return value;
}
test("tool returns validated data through one read-only request", async () => {
  let calls = 0;
  const result = await previewSolanaRent({ publicKey: fixture.publicKey }, { fetcher: async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).pathname, "/api/v1/preview");
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(init?.body, undefined);
    return Response.json(fresh());
  } });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.preview.amounts.estimatedNetLamports, "3670705");
});
test("tool rejects missing, invalid and extra arguments before fetching", async () => {
  for (const input of [null, [], {}, { publicKey: "bad" }, { publicKey: fixture.publicKey, baseUrl: "https://example.com" }, { publicKey: fixture.publicKey, execute: true }]) {
    let calls = 0;
    const result = await previewSolanaRent(input, { fetcher: async () => { calls++; throw new Error("Unexpected request"); } });
    assert.equal(result.ok, false); assert.equal(calls, 0);
  }
});
test("tool preserves throttling and stale-preview failures without retries", async () => {
  let calls = 0;
  const result = await previewSolanaRent({ publicKey: fixture.publicKey }, { fetcher: async () => {
    calls++; return Response.json({ error: { code: "RATE_LIMITED", message: "untrusted message" } }, { status: 429, headers: { "Retry-After": "30" } });
  } });
  assert.equal(calls, 1); assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.error.retryAfterSeconds, 30); assert.equal(result.error.retryable, true); assert.ok(!result.error.message.includes("untrusted")); }
  const expired = fresh();
  const now = Date.now();
  expired.observation.observedAt = new Date(now - 60_000).toISOString();
  expired.observation.expiresAt = new Date(now - 30_000).toISOString();
  const stale = await previewSolanaRent({ publicKey: fixture.publicKey }, { fetcher: async () => Response.json(expired) });
  assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.error.code, "STALE_PREVIEW");
});
test("empty and blocked previews remain valid tool results", async () => {
  const empty = fresh();
  empty.accounts = { scanned: 0, empty: 0, candidates: 0, protected: 0 };
  empty.amounts.grossRentLamports = "0"; empty.amounts.estimatedNetLamports = "0";
  empty.amounts.deductions.serviceLamports = "0"; empty.amounts.deductions.referralPortionLamports = "0";
  empty.eligibility = { status: "no_accounts", reasonCodes: ["NO_EMPTY_ACCOUNTS"] };
  const blocked = fresh(); blocked.eligibility = { status: "blocked", reasonCodes: ["UNSUPPORTED_CLOSE_AUTHORITY"] };
  for (const payload of [empty, blocked]) {
    const result = await previewSolanaRent({ publicKey: fixture.publicKey }, { fetcher: async () => Response.json(payload) });
    assert.equal(result.ok, true); if (result.ok) assert.equal(result.preview.eligibility.status, payload.eligibility.status);
  }
});
