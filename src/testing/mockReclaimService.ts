// Test support: an offline mock of the Reclaim app's POST /api/reclaim and
// POST /api/reclaim/execute, mirroring the app's request gates
// (src/app/api/reclaim/route.ts, src/app/api/reclaim/execute/route.ts):
// one batch per prepare call, continuation tokens issued only after a batch
// "confirms", prepared-transaction tokens bound to the exact message, and full
// signature verification including the service fee-payer signature.
import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Buffer } from "buffer";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { AppAccount, buildAppBatch, legacyAccount, TOKEN_ACCOUNT_RENT_LAMPORTS } from "./appBatchBuilder.js";

const BATCH_SIZE = 20;

export interface MockServiceOptions {
  owner: PublicKey;
  accounts?: AppAccount[];
  subsidized?: boolean;
  referral?: PublicKey | null;
  serviceRentFeeLamports?: number;
  /** Answer execute with blockhash_expired this many times before succeeding. */
  blockhashExpiredTimes?: number;
  /** Answer execute for this batch index with broadcast_failed. */
  broadcastFailedAtBatch?: number;
  /** Delay before answering execute (the app confirms before answering). */
  executeDelayMs?: number;
  prepareError?: { status: number; body: Record<string, unknown> };
  /** Rewrite the prepared transaction before it is returned. */
  tamper?: (tx: Transaction) => void;
}

interface Prepared {
  batchIndex: number;
  messageHash: string;
  lastValidBlockHeight: number;
  unsignedTx: string;
  accounts: AppAccount[];
}

export interface MockService {
  baseUrl: string;
  sponsor: Keypair | null;
  requests: Array<{ method: string; path: string; body: Record<string, unknown> | null }>;
  maxConcurrent: number;
  remaining: () => number;
  close: () => Promise<void>;
}

const messageHash = (tx: Transaction) => createHash("sha256").update(tx.serializeMessage()).digest("hex");

export async function startMockReclaimService(options: MockServiceOptions): Promise<MockService> {
  const sponsor = options.subsidized ? Keypair.generate() : null;
  let open = [...(options.accounts ?? Array.from({ length: 45 }, legacyAccount))];
  const prepared = new Map<string, Prepared>();
  const continuations = new Map<string, { attempt: string; nextBatchIndex: number }>();
  let blockhashExpiredLeft = options.blockhashExpiredTimes ?? 0;
  let tokenCounter = 0;
  let inFlight = 0;
  const state: MockService = {
    baseUrl: "",
    sponsor,
    requests: [],
    maxConcurrent: 0,
    remaining: () => open.length,
    close: async () => {},
  };

  const server = http.createServer(async (req, res) => {
    inFlight += 1;
    state.maxConcurrent = Math.max(state.maxConcurrent, inFlight);
    const send = (status: number, json: unknown) => {
      inFlight -= 1;
      if (res.destroyed) return;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>) : null;
    const path = new URL(req.url ?? "/", "http://mock").pathname;
    state.requests.push({ method: req.method ?? "", path, body });

    if (req.method === "POST" && path === "/api/reclaim" && body) {
      if (!body.publicKey) return send(400, { error: "Missing publicKey" });
      const attempt = typeof body.reclaimAttemptId === "string" && body.reclaimAttemptId ? body.reclaimAttemptId : "server-attempt";
      let batchIndex = 0;
      if (body.continuationToken !== undefined) {
        const claims = typeof body.continuationToken === "string" ? continuations.get(body.continuationToken) : undefined;
        if (!claims || claims.attempt !== attempt) return send(400, { error: "Invalid or expired continuationToken" });
        batchIndex = claims.nextBatchIndex;
      }
      if (options.prepareError) return send(options.prepareError.status, { reclaimAttemptId: attempt, ...options.prepareError.body });
      if (open.length === 0) return send(200, { reclaimAttemptId: attempt, batches: [], totalEmpty: 0, totalGrossSol: 0 });

      const serviceRent = batchIndex === 0 ? (options.serviceRentFeeLamports ?? 0) : 0;
      const batch = buildAppBatch({
        owner: options.owner,
        accounts: open.slice(0, BATCH_SIZE),
        sponsor,
        referral: options.referral ?? null,
        serviceRentFeeLamports: serviceRent,
        batchIndex,
        lastValidBlockHeight: 5_000 + tokenCounter,
      });
      if (options.tamper) {
        const tx = Transaction.from(Buffer.from(batch.unsignedTx, "base64"));
        options.tamper(tx);
        batch.unsignedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
      }
      const accounts = open.slice(0, batch.emptyCount);
      const tx = Transaction.from(Buffer.from(batch.unsignedTx, "base64"));
      batch.preparedTxToken = `prepared-${(tokenCounter += 1)}`;
      prepared.set(batch.preparedTxToken, {
        batchIndex,
        messageHash: messageHash(tx),
        lastValidBlockHeight: batch.lastValidBlockHeight,
        unsignedTx: batch.unsignedTx,
        accounts,
      });
      const hasMore = open.length > batch.emptyCount;
      return send(200, {
        reclaimAttemptId: attempt,
        totalEmpty: open.length,
        totalGrossSol: (open.length * TOKEN_ACCOUNT_RENT_LAMPORTS) / 1e9,
        totalNetSol: 0,
        hasValidReferral: !!options.referral,
        requiresServiceRentFee: serviceRent > 0,
        serviceRentFeeLamports: serviceRent,
        feePercentsBps: { serviceBps: options.referral ? 600 : 1000, referralBps: options.referral ? 400 : 0 },
        hasMore,
        estimatedBatchCount: batchIndex + Math.ceil(open.length / batch.emptyCount),
        batches: [batch],
      });
    }

    if (req.method === "POST" && path === "/api/reclaim/execute" && body) {
      // Verbatim parameter gates from the app's execute route.
      const { signedTx, preparedTx, publicKey, reclaimAttemptId, batchIndex, preparedTxToken, lastValidBlockHeight } = body;
      if (!signedTx || !publicKey || !reclaimAttemptId) return send(400, { error: "Missing signedTx, publicKey, or reclaimAttemptId" });
      if (typeof preparedTxToken !== "string" || typeof batchIndex !== "number" || !Number.isInteger(lastValidBlockHeight)) {
        return send(400, { error: "Missing preparedTxToken, batchIndex, or lastValidBlockHeight" });
      }
      const claims = prepared.get(preparedTxToken);
      try {
        const tx = Transaction.from(Buffer.from(String(signedTx), "base64"));
        if (!claims || claims.batchIndex !== batchIndex || claims.lastValidBlockHeight !== lastValidBlockHeight) throw new Error("token mismatch");
        if (messageHash(tx) !== claims.messageHash || preparedTx !== claims.unsignedTx) throw new Error("Prepared transaction message mismatch");
        if (sponsor && !tx.signatures.find((s) => s.publicKey.equals(sponsor.publicKey))?.signature) throw new Error("Missing sponsor fee-payer signature");
        tx.serialize({ requireAllSignatures: true, verifySignatures: true });
      } catch {
        return send(403, { error: "Failed to execute transaction", code: "broadcast_failed", category: "broadcast_failed", retryable: true, nextAction: "check_transaction" });
      }
      if (blockhashExpiredLeft > 0) {
        blockhashExpiredLeft -= 1;
        return send(409, { error: "expired", code: "blockhash_expired", retriable: true, category: "transaction_expired", retryable: true, nextAction: "check_transaction" });
      }
      if (options.broadcastFailedAtBatch === batchIndex) {
        return send(403, { error: "Failed to execute transaction", code: "broadcast_failed", category: "broadcast_failed", retryable: true, nextAction: "check_transaction" });
      }
      if (options.executeDelayMs) await new Promise((resolve) => setTimeout(resolve, options.executeDelayMs));
      const closed = new Set(claims!.accounts.map((a) => a.account.toBase58()));
      open = open.filter((a) => !closed.has(a.account.toBase58()));
      const continuationToken = `cont-${reclaimAttemptId}-${batchIndex + 1}`;
      continuations.set(continuationToken, { attempt: String(reclaimAttemptId), nextBatchIndex: batchIndex + 1 });
      return send(200, { txid: `txid-${batchIndex}-${tokenCounter}`, continuationToken });
    }

    return send(404, { error: "not found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return state;
}
