import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { devNull, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { HttpClient } from "../client/http.js";
import { EXECUTE_TIMEOUT_MS, ReclaimApiClient } from "../client/reclaimApi.js";
import { createCloseAccountInstruction, legacyAccount, TOKEN_PROGRAM_ID, token2022Account } from "../testing/appBatchBuilder.js";
import { MockService, MockServiceOptions, startMockReclaimService } from "../testing/mockReclaimService.js";
import { MAX_BLOCKHASH_RETRIES, runReclaim } from "./reclaimLoop.js";

// Keys the app's browser client sends to execute (src/lib/reclaim/client-api.ts).
const APP_EXECUTE_KEYS = [
  "batchIndex",
  "lastValidBlockHeight",
  "preparedAt",
  "preparedTx",
  "preparedTxToken",
  "publicKey",
  "reclaimAttemptId",
  "requiresServiceSignature",
  "signedTx",
].sort();

async function run(options: Omit<MockServiceOptions, "owner">, client: { executeTimeoutMs?: number } = {}) {
  const owner = Keypair.generate();
  const service = await startMockReclaimService({ ...options, owner: owner.publicKey });
  const lines: string[] = [];
  try {
    const api = new ReclaimApiClient(new HttpClient({ baseUrl: service.baseUrl, timeoutMs: 5_000 }), client.executeTimeoutMs);
    const result = await runReclaim(api, owner, { log: (l) => lines.push(l), error: (l) => lines.push(l) });
    return { owner, service, result, lines };
  } finally {
    await service.close();
  }
}

const prepares = (s: MockService) => s.requests.filter((r) => r.path === "/api/reclaim");
const executes = (s: MockService) => s.requests.filter((r) => r.path === "/api/reclaim/execute");

test("runs batches strictly sequentially, chaining continuation tokens until hasMore is false", async () => {
  const { owner, service, result, lines } = await run({ accounts: Array.from({ length: 45 }, legacyAccount) });

  assert.equal(result.failure, undefined);
  assert.equal(result.totalEmpty, 45);
  assert.deepEqual(result.submitted.map((b) => [b.batchIndex, b.emptyCount]), [[0, 20], [1, 20], [2, 5]]);
  assert.equal(service.remaining(), 0);
  assert.equal(service.maxConcurrent, 1, "never more than one request in flight");
  assert.deepEqual(service.requests.map((r) => r.path), [
    "/api/reclaim", "/api/reclaim/execute",
    "/api/reclaim", "/api/reclaim/execute",
    "/api/reclaim", "/api/reclaim/execute",
  ]);
  assert.ok(service.requests.every((r) => r.method === "POST"), "no legacy GET /api/reclaim pre-check");

  const prepareBodies = prepares(service).map((r) => r.body!);
  assert.deepEqual(prepareBodies.map((b) => b.continuationToken), [undefined, `cont-${result.reclaimAttemptId}-1`, `cont-${result.reclaimAttemptId}-2`]);
  assert.ok(prepareBodies.every((b) => b.reclaimAttemptId === result.reclaimAttemptId && b.publicKey === owner.publicKey.toBase58()));

  for (const [index, { body }] of executes(service).entries()) {
    assert.deepEqual(Object.keys(body!).sort(), APP_EXECUTE_KEYS);
    assert.equal(body!.batchIndex, index);
    assert.equal(body!.reclaimAttemptId, result.reclaimAttemptId);
    assert.equal(body!.requiresServiceSignature, false);
  }
  assert.ok(lines.some((l) => l === `[reclaim] batch=3/3 empty=5 txid=${result.submitted[2].txid}`));
});

test("subsidized wallets keep the service fee-payer signature (Token-2022, referral, service-rent fee)", async () => {
  const accounts = [...Array.from({ length: 12 }, () => token2022Account(true)), ...Array.from({ length: 12 }, legacyAccount)];
  const { service, result } = await run({ accounts, subsidized: true, referral: Keypair.generate().publicKey, serviceRentFeeLamports: 2_039_280 });

  assert.equal(result.failure, undefined);
  assert.equal(result.submitted.length, 2);
  assert.equal(service.remaining(), 0);
  for (const { body } of executes(service)) {
    assert.equal(body!.requiresServiceSignature, true);
    const tx = Transaction.from(Buffer.from(String(body!.signedTx), "base64"));
    assert.ok(tx.feePayer!.equals(service.sponsor!.publicKey));
    assert.equal(tx.verifySignatures(true), true);
  }
});

test("nothing to reclaim ends cleanly without signing", async () => {
  const { service, result, lines } = await run({ accounts: [] });
  assert.equal(result.failure, undefined);
  assert.equal(result.submitted.length, 0);
  assert.equal(executes(service).length, 0);
  assert.ok(lines.includes("[reclaim] nothing to reclaim"));
});

test("blockhash_expired re-prepares the same batch with the same continuation token", async () => {
  const { service, result } = await run({ accounts: Array.from({ length: 25 }, legacyAccount), blockhashExpiredTimes: 1 });
  assert.equal(result.failure, undefined);
  assert.equal(result.submitted.length, 2);
  const indexes = executes(service).map((r) => r.body!.batchIndex);
  assert.deepEqual(indexes, [0, 0, 1]);
  assert.deepEqual(prepares(service).map((r) => r.body!.continuationToken), [undefined, undefined, `cont-${result.reclaimAttemptId}-1`]);
});

test("blockhash_expired retries are bounded", async () => {
  const { service, result } = await run({ accounts: [legacyAccount()], blockhashExpiredTimes: 10 });
  assert.equal(result.failure?.kind, "blockhash_expired");
  assert.equal(executes(service).length, MAX_BLOCKHASH_RETRIES + 1);
  assert.equal(prepares(service).length, MAX_BLOCKHASH_RETRIES + 1);
});

test("broadcast_failed stops without re-preparing and tells the user to re-scan", async () => {
  const { service, result, lines } = await run({ accounts: Array.from({ length: 45 }, legacyAccount), broadcastFailedAtBatch: 1 });
  assert.equal(result.failure?.kind, "outcome_unknown");
  assert.equal(result.failure?.batchNumber, 2);
  assert.equal(result.submitted.length, 1);
  assert.equal(prepares(service).length, 2, "no re-prepare after an unknown outcome");
  assert.ok(lines.some((l) => l.includes("code broadcast_failed") && l.includes("npm run wallet:check")));
});

test("an execute timeout stops without re-preparing", async () => {
  const { service, result } = await run({ accounts: [legacyAccount()], executeDelayMs: 1_000 }, { executeTimeoutMs: 100 });
  assert.equal(result.failure?.kind, "outcome_unknown");
  assert.match(result.failure!.message, /no response within/);
  assert.equal(prepares(service).length, 1);
});

test("the default execute timeout allows server-side confirmation", () => {
  assert.ok(EXECUTE_TIMEOUT_MS >= 90_000);
});

for (const [code, status] of [["insufficient_funds", 422], ["missing_empty_sol_token_account", 403]] as const) {
  test(`prepare ${code} stops with a clear message and signs nothing`, async () => {
    const { service, result } = await run({ prepareError: { status, body: { error: "x", code } } });
    assert.equal(result.failure?.kind, code);
    assert.equal(executes(service).length, 0);
  });
}

test("a prepared transaction that fails the pre-sign check is never signed or submitted", async () => {
  const thief = Keypair.generate().publicKey;
  const { service, result } = await run({
    accounts: [legacyAccount(), legacyAccount()],
    tamper: (tx) => {
      const owner = tx.instructions[2].keys[2].pubkey as PublicKey;
      tx.instructions[3] = createCloseAccountInstruction(tx.instructions[3].keys[0].pubkey, thief, owner, TOKEN_PROGRAM_ID);
    },
  });
  assert.equal(result.failure?.kind, "presign_rejected");
  assert.match(result.failure!.message, /rule a at instruction 3/);
  assert.equal(executes(service).length, 0);
});

test("npm run reclaim entry point completes a sequential run against the mock service", async () => {
  const owner = Keypair.generate();
  const service = await startMockReclaimService({ owner: owner.publicKey, accounts: Array.from({ length: 21 }, legacyAccount) });
  try {
    const entryPoint = fileURLToPath(new URL("../index.js", import.meta.url));
    const child = spawn(process.execPath, [entryPoint], {
      cwd: tmpdir(),
      env: { DOTENV_CONFIG_PATH: devNull, RECLAIM_API_BASE_URL: service.baseUrl, WALLET_PRIVATE_KEY: bs58.encode(owner.secretKey) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const status = await new Promise<number | null>((resolve) => child.on("close", resolve));
    assert.equal(status, 0, stderr);
    assert.match(stdout, /\[reclaim\] batch=2\/2 empty=1 txid=/);
    assert.match(stdout, new RegExp(`\\[reclaim\\] finished wallet=${owner.publicKey.toBase58()} submitted=2 accountsClosed=21 failedBatches=0`));
    assert.equal(stdout.includes(bs58.encode(owner.secretKey)), false);
  } finally {
    await service.close();
  }
});
