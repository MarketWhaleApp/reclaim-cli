import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "buffer";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { checkReclaimTransaction, PresignCheckError, quotedFeeLamports } from "./presignCheck.js";
import { signReclaimTransaction } from "./solanaSigner.js";
import {
  AppAccount,
  buildAppBatch,
  buildAppTransaction,
  createCloseAccountInstruction,
  createHarvestWithheldTokensToMintInstruction,
  fakeBlockhash,
  legacyAccount,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  token2022Account,
} from "../testing/appBatchBuilder.js";

const SERVICE_RENT_FEE = 2_039_280;

function decoded(unsignedTx: string): Transaction {
  return Transaction.from(Buffer.from(unsignedTx, "base64"));
}

function expectRule(fn: () => void, rule: string, instructionIndex: number) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof PresignCheckError, `expected PresignCheckError, got ${String(error)}`);
    assert.equal(error.rule, rule);
    assert.equal(error.instructionIndex, instructionIndex);
    assert.match(error.message, new RegExp(`rule ${rule} at instruction ${instructionIndex}`));
    return true;
  });
}

// ── App-shaped transactions: every combination must pass and sign ─────────────

const accountMixes: Array<[string, () => AppAccount[]]> = [
  ["SPL Token", () => Array.from({ length: 20 }, legacyAccount)],
  ["Token-2022 without transfer fee", () => Array.from({ length: 5 }, () => token2022Account(false))],
  ["Token-2022 with transfer-fee harvest", () => Array.from({ length: 5 }, () => token2022Account(true))],
  ["mixed SPL Token and Token-2022", () => [legacyAccount(), token2022Account(true), token2022Account(false), legacyAccount()]],
];

for (const subsidized of [false, true]) {
  for (const [mixName, accounts] of accountMixes) {
    for (const withReferral of [false, true]) {
      for (const withServiceRent of subsidized ? [false, true] : [false]) {
        const name = `${subsidized ? "subsidized" : "user-paid"} ${mixName}${withReferral ? " with referral" : ""}${withServiceRent ? " with service-rent fee" : ""} passes and signs`;
        test(name, () => {
          const owner = Keypair.generate();
          const sponsor = subsidized ? Keypair.generate() : null;
          const batch = buildAppBatch({
            owner: owner.publicKey,
            accounts: accounts(),
            sponsor,
            referral: withReferral ? Keypair.generate().publicKey : null,
            serviceRentFeeLamports: withServiceRent ? SERVICE_RENT_FEE : 0,
          });

          checkReclaimTransaction(decoded(batch.unsignedTx), owner.publicKey, batch.fees);

          const signed = decoded(signReclaimTransaction(batch.unsignedTx, owner, batch.fees));
          assert.equal(signed.verifySignatures(true), true, "all required signatures present and valid");
          const signers = signed.signatures.filter((s) => s.signature).map((s) => s.publicKey.toBase58());
          assert.ok(signers.includes(owner.publicKey.toBase58()));
          if (sponsor) assert.ok(signers.includes(sponsor.publicKey.toBase58()), "service fee-payer signature kept");
        });
      }
    }
  }
}

// ── Things the check deliberately does not look at ────────────────────────────

test("check ignores fee payer, fee recipient, programs and order that do not touch the wallet", () => {
  const owner = Keypair.generate();
  const stranger = Keypair.generate().publicKey;
  const tx = new Transaction({ feePayer: Keypair.generate().publicKey, recentBlockhash: fakeBlockhash() });
  // Unknown program, no wallet reference.
  tx.add(new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [{ pubkey: stranger, isSigner: false, isWritable: true }], data: Buffer.from([1, 2, 3]) }));
  // System transfer between other accounts.
  tx.add(SystemProgram.transfer({ fromPubkey: stranger, toPubkey: Keypair.generate().publicKey, lamports: 10_000_000_000 }));
  // Fee to an address that is not the service fee wallet, below the quote.
  tx.add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
  tx.add(createCloseAccountInstruction(Keypair.generate().publicKey, owner.publicKey, owner.publicKey, TOKEN_PROGRAM_ID));
  // A close that only pays the wallet, under someone else's authority.
  tx.add(createCloseAccountInstruction(Keypair.generate().publicKey, owner.publicKey, stranger, TOKEN_2022_PROGRAM_ID));
  // SOL into the wallet.
  tx.add(SystemProgram.transfer({ fromPubkey: stranger, toPubkey: owner.publicKey, lamports: 5 }));

  checkReclaimTransaction(tx, owner.publicKey, { serviceLamports: 100 });
});

test("fee bound is an upper bound over service, referral and service-rent fees", () => {
  const owner = Keypair.generate();
  const tx = (lamports: number[]) => {
    const t = new Transaction({ feePayer: owner.publicKey, recentBlockhash: fakeBlockhash() });
    for (const amount of lamports) t.add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: Keypair.generate().publicKey, lamports: amount }));
    return t;
  };
  const fees = { serviceLamports: 100, referralLamports: 50, serviceRentLamports: 25 };
  assert.equal(quotedFeeLamports(fees), 175n);
  checkReclaimTransaction(tx([175]), owner.publicKey, fees);
  checkReclaimTransaction(tx([100, 50, 25]), owner.publicKey, fees);
  checkReclaimTransaction(tx([1]), owner.publicKey, fees);
  checkReclaimTransaction(tx([]), owner.publicKey, undefined);
  assert.equal(quotedFeeLamports({ serviceLamports: 10 }), 10n, "missing fields count as 0");
  assert.equal(quotedFeeLamports({ serviceLamports: "10" as never, referralLamports: -5 }), 0n, "malformed fields count as 0");
});

// ── Rule a: closes under the wallet's authority pay the wallet ───────────────

test("rule a rejects a close under the wallet's authority that pays someone else", () => {
  const owner = Keypair.generate();
  const { transaction } = buildAppTransaction({ owner: owner.publicKey, accounts: [legacyAccount(), legacyAccount()] });
  // instructions: 0,1 compute budget; 2,3 closes; 4 fee transfer
  transaction.instructions[3] = createCloseAccountInstruction(Keypair.generate().publicKey, Keypair.generate().publicKey, owner.publicKey, TOKEN_PROGRAM_ID);
  expectRule(() => checkReclaimTransaction(transaction, owner.publicKey, { serviceLamports: 1e9 }), "a", 3);
});

test("rule a covers the wallet as a multisig signer and Token-2022", () => {
  const owner = Keypair.generate();
  const tx = new Transaction({ feePayer: owner.publicKey, recentBlockhash: fakeBlockhash() });
  tx.add(createCloseAccountInstruction(Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey, TOKEN_2022_PROGRAM_ID, [owner.publicKey]));
  expectRule(() => checkReclaimTransaction(tx, owner.publicKey, undefined), "a", 0);
});

// ── Rule b: SOL leaving the wallet is bounded by the quoted fees ─────────────

test("rule b rejects a fee transfer above the quote", () => {
  const owner = Keypair.generate();
  const batch = buildAppBatch({ owner: owner.publicKey, accounts: [legacyAccount()] });
  const quote = { ...batch.fees, serviceLamports: batch.fees!.serviceLamports! - 1 };
  // instructions: 0,1 compute budget; 2 close; 3 fee transfer
  expectRule(() => checkReclaimTransaction(decoded(batch.unsignedTx), owner.publicKey, quote), "b", 3);
});

test("rule b sums every transfer from the wallet, to anyone", () => {
  const owner = Keypair.generate();
  const tx = new Transaction({ feePayer: owner.publicKey, recentBlockhash: fakeBlockhash() });
  tx.add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 60 }));
  tx.add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 60 }));
  expectRule(() => checkReclaimTransaction(tx, owner.publicKey, { serviceLamports: 100 }), "b", 1);
});

test("rule b rejects any transfer from the wallet when the service quoted no fees", () => {
  const owner = Keypair.generate();
  const tx = new Transaction({ feePayer: owner.publicKey, recentBlockhash: fakeBlockhash() });
  tx.add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
  expectRule(() => checkReclaimTransaction(tx, owner.publicKey, undefined), "b", 0);
});

// ── Rule c: no other use of the wallet as signer or authority ───────────────

function tokenInstruction(programId: PublicKey, data: number[], keys: PublicKey[], signer: PublicKey) {
  return new TransactionInstruction({
    programId,
    keys: keys.map((pubkey) => ({ pubkey, isSigner: pubkey.equals(signer), isWritable: !pubkey.equals(signer) })),
    data: Buffer.from(data),
  });
}

const rogue: Array<[string, (owner: PublicKey) => TransactionInstruction]> = [
  ["SPL Token Transfer", (o) => tokenInstruction(TOKEN_PROGRAM_ID, [3, 1, 0, 0, 0, 0, 0, 0, 0], [Keypair.generate().publicKey, Keypair.generate().publicKey, o], o)],
  ["Token-2022 TransferChecked", (o) => tokenInstruction(TOKEN_2022_PROGRAM_ID, [12, 1, 0, 0, 0, 0, 0, 0, 0, 6], [Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey, o], o)],
  ["SPL Token Approve", (o) => tokenInstruction(TOKEN_PROGRAM_ID, [4, 255, 255, 255, 255, 255, 255, 255, 255], [Keypair.generate().publicKey, Keypair.generate().publicKey, o], o)],
  ["SPL Token SetAuthority", (o) => tokenInstruction(TOKEN_PROGRAM_ID, [6, 2, 1, ...Keypair.generate().publicKey.toBytes()], [Keypair.generate().publicKey, o], o)],
  ["System Assign of the wallet", (o) => SystemProgram.assign({ accountPubkey: o, programId: Keypair.generate().publicKey })],
  ["System CreateAccount funded by the wallet", (o) => SystemProgram.createAccount({ fromPubkey: o, newAccountPubkey: Keypair.generate().publicKey, lamports: 1, space: 0, programId: Keypair.generate().publicKey })],
  ["unknown program given the wallet", (o) => new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [{ pubkey: o, isSigner: true, isWritable: true }], data: Buffer.alloc(0) })],
  ["harvest naming the wallet for an account not being closed", (o) => createHarvestWithheldTokensToMintInstruction(Keypair.generate().publicKey, [o])],
];

for (const [name, build] of rogue) {
  test(`rule c rejects ${name}`, () => {
    const owner = Keypair.generate();
    const { transaction } = buildAppTransaction({ owner: owner.publicKey, accounts: [token2022Account(true)] });
    // instructions: 0,1 compute budget; 2 harvest; 3 close; 4 fee transfer; 5 rogue
    transaction.add(build(owner.publicKey));
    expectRule(() => checkReclaimTransaction(transaction, owner.publicKey, { serviceLamports: 1e12 }), "c", 5);
  });
}

test("rule c lets a harvest reference the wallet only through accounts the wallet closes", () => {
  const owner = Keypair.generate();
  const closing = Keypair.generate().publicKey;
  const tx = new Transaction({ feePayer: owner.publicKey, recentBlockhash: fakeBlockhash() });
  const harvest = createHarvestWithheldTokensToMintInstruction(Keypair.generate().publicKey, [closing]);
  harvest.keys.push({ pubkey: owner.publicKey, isSigner: true, isWritable: false });
  tx.add(harvest);
  tx.add(createCloseAccountInstruction(closing, owner.publicKey, owner.publicKey, TOKEN_2022_PROGRAM_ID));
  expectRule(() => checkReclaimTransaction(tx, owner.publicKey, undefined), "c", 0);

  const ok = new Transaction({ feePayer: owner.publicKey, recentBlockhash: fakeBlockhash() });
  ok.add(createHarvestWithheldTokensToMintInstruction(Keypair.generate().publicKey, [closing]));
  ok.add(createCloseAccountInstruction(closing, owner.publicKey, owner.publicKey, TOKEN_2022_PROGRAM_ID));
  checkReclaimTransaction(ok, owner.publicKey, undefined);
});

// ── Rule d: no durable nonce ──────────────────────────────────────────────────

test("rule d rejects durable-nonce transactions even when the wallet is not the nonce authority", () => {
  const owner = Keypair.generate();
  const { transaction } = buildAppTransaction({ owner: owner.publicKey, accounts: [legacyAccount()] });
  transaction.instructions.unshift(
    SystemProgram.nonceAdvance({ noncePubkey: Keypair.generate().publicKey, authorizedPubkey: Keypair.generate().publicKey }),
  );
  expectRule(() => checkReclaimTransaction(transaction, owner.publicKey, { serviceLamports: 1e12 }), "d", 0);
});

// ── Signing stops before any signature on rejection ──────────────────────────

test("signReclaimTransaction refuses to sign a rejected transaction", () => {
  const owner = Keypair.generate();
  const batch = buildAppBatch({ owner: owner.publicKey, accounts: [legacyAccount()] });
  assert.throws(() => signReclaimTransaction(batch.unsignedTx, owner, { serviceLamports: 0 }), PresignCheckError);
});
