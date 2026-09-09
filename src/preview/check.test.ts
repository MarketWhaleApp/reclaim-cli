import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { CheckError, fetchPreview, validatePreview } from "./check.js";
const fixture = JSON.parse(await readFile(new URL("../../docs/preview-v1-example.json", import.meta.url), "utf8"));
const time = Date.parse("2026-09-09T12:00:01.000Z");
function fresh() {
  const p = structuredClone(fixture);
  const observed = Date.now();
  p.observation.observedAt = new Date(observed).toISOString();
  p.observation.expiresAt = new Date(observed + 30_000).toISOString();
  return p;
}
test("validates exact lamport math, schema, identity, timestamps, and unknown network fee", () => {
  assert.equal(validatePreview(fixture, fixture.publicKey, time).amounts.estimatedNetLamports, "3670705");
  for (const mutate of [
    (p: any) => { p.schemaVersion = "2.0"; },
    (p: any) => { p.amounts.estimatedNetLamports = "999999"; },
    (p: any) => { p.amounts.deductions.networkFeeLamports = "0"; },
    (p: any) => { p.accounts.scanned = -1; },
    (p: any) => { p.eligibility.status = "approved"; },
  ]) {
    const p = structuredClone(fixture); mutate(p);
    assert.throws(() => validatePreview(p, fixture.publicKey, time), CheckError);
  }
  assert.throws(() => validatePreview(fixture, fixture.publicKey, time + 60_000), (error: unknown) => error instanceof CheckError && error.code === "STALE_PREVIEW");
});
test("rejects invalid input without a request and maps throttle failures", async () => {
  let called = false;
  await assert.rejects(fetchPreview("bad", undefined, async () => { called = true; return new Response(); }), CheckError);
  assert.equal(called, false);
  await assert.rejects(fetchPreview(fixture.publicKey, undefined, async () => Response.json({ error: { code: "RATE_LIMITED", message: "do not echo untrusted body" } }, { status: 429 })), (error: unknown) => error instanceof CheckError && error.exitCode === 4 && !error.message.includes("untrusted"));
});
function run(args: string[], baseUrl: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, RECLAIM_API_BASE_URL: baseUrl, WALLET_PRIVATE_KEY: "invalid-test-value-must-not-be-read" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", x => { stdout += x; }); child.stderr.on("data", x => { stderr += x; });
    child.on("error", reject); child.on("close", code => resolve({ code, stdout, stderr }));
  });
}
test("CLI JSON process and dependency-free example never enroll or sign", async () => {
  let payload = fresh();
  const paths: string[] = [];
  const server = createServer((req, res) => {
    paths.push(req.url ?? ""); assert.equal(req.method, "GET");
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(payload));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const cli = await run(["dist/scripts/smokeGet.js", fixture.publicKey, "--json"], base);
    assert.equal(cli.code, 0, cli.stderr + cli.stdout); assert.deepEqual(JSON.parse(cli.stdout), payload); assert.ok(!cli.stderr.includes("invalid-test-value"));
    const example = await run(["scripts/preview-wallet.mjs", fixture.publicKey, base], base);
    assert.equal(example.code, 0); assert.deepEqual(JSON.parse(example.stdout), payload);
    payload = fresh(); payload.accounts = { scanned: 0, empty: 0, candidates: 0, protected: 0 };
    payload.amounts.grossRentLamports = "0"; payload.amounts.estimatedNetLamports = "0";
    payload.amounts.deductions.serviceLamports = "0"; payload.amounts.deductions.referralPortionLamports = "0";
    payload.eligibility = { status: "no_accounts", reasonCodes: ["NO_EMPTY_ACCOUNTS"] };
    const empty = await run(["dist/scripts/smokeGet.js", fixture.publicKey, "--json"], base);
    assert.equal(empty.code, 3, empty.stderr); assert.equal(JSON.parse(empty.stdout).eligibility.status, "no_accounts");
    const invalid = await run(["dist/scripts/smokeGet.js", "--json"], base);
    assert.equal(invalid.code, 2); assert.equal(JSON.parse(invalid.stdout).error.code, "INVALID_REQUEST");
    assert.equal(paths.length, 3); assert.ok(paths.every(path => path.startsWith("/api/v1/preview?publicKey=")));
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
