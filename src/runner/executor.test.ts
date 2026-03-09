import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { executeBatches } from "./executor.js";
import type { ReclaimBatch } from "../types/api.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("executeBatches keeps at most 5 requests in flight and preserves ordered results", async () => {
  const batches: ReclaimBatch[] = Array.from({ length: 20 }, (_, index) => ({
    emptyCount: 1,
    unsignedTx: `unsigned-${index}`,
    grossLamports: 1000,
    netLamports: 900,
    fees: {
      serviceLamports: 100,
      referralLamports: 0,
      referralPubkey: null,
    },
  }));

  let inFlight = 0;
  let maxInFlight = 0;
  const startedAt: number[] = [];

  const api = {
    async executeReclaim(payload: { signedTx: string; publicKey: string }) {
      const batchIndex = Number(payload.signedTx.replace("signed-", ""));
      startedAt[batchIndex] = Date.now();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      console.log(`[executor:test] start batch=${batchIndex} inFlight=${inFlight}`);

      await sleep(2_000);

      inFlight -= 1;
      console.log(`[executor:test] done batch=${batchIndex} inFlight=${inFlight}`);

      return { txid: `txid-${batchIndex}` };
    },
  };

  const results = await executeBatches(api as never, {
    publicKey: Keypair.generate().publicKey.toBase58(),
    keypair: Keypair.generate(),
    batches,
    stopOnError: true,
    signTransaction: (unsignedTx) => unsignedTx.replace("unsigned-", "signed-"),
  });

  assert.equal(results.length, 20);
  assert.equal(maxInFlight, 5);

  for (const [index, result] of results.entries()) {
    assert.equal(result.batchIndex, index);
    assert.equal(result.txid, `txid-${index}`);
    assert.equal(result.error, undefined);
  }

  assert.ok(startedAt[5] - startedAt[0] >= 250);
  assert.ok(startedAt[10] - startedAt[5] >= 250);
  assert.ok(startedAt[15] - startedAt[10] >= 250);
  console.log(`[executor:test] maxInFlight=${maxInFlight} totalResults=${results.length}`);
});
