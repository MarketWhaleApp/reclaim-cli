// Test support: builds reclaim transactions shaped exactly like the Reclaim app's
// current server builder (src/lib/reclaim/batch-builder.ts prepareNextReclaimBatch
// and src/lib/reclaim/sponsored-transaction.ts prepareTransactionForWallet).
// Token instructions are encoded as @solana/spl-token 0.4 encodes them
// (createCloseAccountInstruction, createHarvestWithheldTokensToMintInstruction);
// spl-token itself is not a dependency because it pulls in a package with a
// high-severity audit advisory.
import { Buffer } from "buffer";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { ReclaimBatch } from "../types/api.js";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
// App src/config/reclaim.ts and reclaim-economics.ts.
export const FEE_WALLET = new PublicKey("mwhVNV8JdSH1813YBA1igDAD1yWLRGyzZtLLmmcSNDA");
const BASE_COMPUTE_UNITS = 1_300;
const LEGACY_CLOSE_CU = 2_916;
const V2_HARVEST_CLOSE_CU = 3_000;
const COMPUTE_UNIT_PRICE = 70_000;
const SERVICE_FEE_BPS = 600;
const REF_FEE_BPS = 400;
const SUBSIDY_EXTRA_PER_ACCOUNT = 100_000;
export const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280;

export type AppAccount =
  | { type: "legacy"; account: PublicKey; lamports: number }
  | { type: "v2"; account: PublicKey; mint: PublicKey; hasTransferFee: boolean; lamports: number };

export function createCloseAccountInstruction(
  account: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  programId: PublicKey,
  multiSigners: PublicKey[] = [],
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({ pubkey: signer, isSigner: true, isWritable: false })),
    ],
    data: Buffer.from([9]),
  });
}

export function createHarvestWithheldTokensToMintInstruction(mint: PublicKey, sources: PublicKey[]): TransactionInstruction {
  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      ...sources.map((source) => ({ pubkey: source, isSigner: false, isWritable: true })),
    ],
    data: Buffer.from([26, 4]),
  });
}

export function legacyAccount(): AppAccount {
  return { type: "legacy", account: Keypair.generate().publicKey, lamports: TOKEN_ACCOUNT_RENT_LAMPORTS };
}

export function token2022Account(hasTransferFee: boolean): AppAccount {
  return {
    type: "v2",
    account: Keypair.generate().publicKey,
    mint: Keypair.generate().publicKey,
    hasTransferFee,
    lamports: TOKEN_ACCOUNT_RENT_LAMPORTS,
  };
}

/** App calculateBatchFees. Note serviceLamports already includes the service-rent fee. */
export function calculateBatchFees(params: {
  accounts: AppAccount[];
  hasValidReferral: boolean;
  isSubsidized: boolean;
  serviceRentFeeLamports: number;
}) {
  const grossLamports = params.accounts.reduce((sum, account) => sum + account.lamports, 0);
  let serviceLamports = Math.floor((grossLamports * SERVICE_FEE_BPS) / 10_000) + params.serviceRentFeeLamports;
  let referralLamports = params.hasValidReferral ? Math.floor((grossLamports * REF_FEE_BPS) / 10_000) : 0;
  if (!params.hasValidReferral) {
    serviceLamports += Math.floor((grossLamports * REF_FEE_BPS) / 10_000);
    referralLamports = 0;
  }
  if (params.isSubsidized) serviceLamports += SUBSIDY_EXTRA_PER_ACCOUNT * params.accounts.length;
  return { grossLamports, serviceLamports, referralLamports, netLamports: grossLamports - serviceLamports - referralLamports };
}

export function fakeBlockhash(): string {
  return Keypair.generate().publicKey.toBase58();
}

export interface AppBatchParams {
  owner: PublicKey;
  accounts: AppAccount[];
  sponsor?: Keypair | null;
  referral?: PublicKey | null;
  serviceRentFeeLamports?: number;
  batchIndex?: number;
  blockhash?: string;
  lastValidBlockHeight?: number;
}

/** Unsigned (user-paid) or sponsor pre-signed (subsidized) transaction, before serialization. */
export function buildAppTransaction(params: AppBatchParams) {
  const sponsor = params.sponsor ?? null;
  const isSubsidized = !!sponsor;
  const serviceRentFeeLamports = params.serviceRentFeeLamports ?? 0;
  const transaction = new Transaction({
    feePayer: sponsor?.publicKey ?? params.owner,
    recentBlockhash: params.blockhash ?? fakeBlockhash(),
  });
  const accounts = params.accounts;
  const legacyCount = accounts.filter(({ type }) => type === "legacy").length;
  const withHarvest = accounts.filter((a) => a.type === "v2" && a.hasTransferFee).length;
  const withoutHarvest = accounts.length - legacyCount - withHarvest;
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: BASE_COMPUTE_UNITS + legacyCount * LEGACY_CLOSE_CU + withHarvest * V2_HARVEST_CLOSE_CU + withoutHarvest * LEGACY_CLOSE_CU,
    }),
  );
  transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE }));

  for (const account of accounts) {
    if (account.type === "legacy") {
      transaction.add(createCloseAccountInstruction(account.account, params.owner, params.owner, TOKEN_PROGRAM_ID));
    } else {
      if (account.hasTransferFee) transaction.add(createHarvestWithheldTokensToMintInstruction(account.mint, [account.account]));
      transaction.add(createCloseAccountInstruction(account.account, params.owner, params.owner, TOKEN_2022_PROGRAM_ID));
    }
  }

  const fees = calculateBatchFees({ accounts, hasValidReferral: !!params.referral, isSubsidized, serviceRentFeeLamports });
  transaction.add(SystemProgram.transfer({ fromPubkey: params.owner, toPubkey: FEE_WALLET, lamports: fees.serviceLamports }));
  if (params.referral && fees.referralLamports > 0) {
    transaction.add(SystemProgram.transfer({ fromPubkey: params.owner, toPubkey: params.referral, lamports: fees.referralLamports }));
  }
  if (sponsor) transaction.partialSign(sponsor);

  return { transaction, fees, serviceRentFeeLamports };
}

/**
 * A batch object exactly as POST /api/reclaim returns it. Like the app, it takes
 * up to `accounts.length` accounts and drops one at a time while the transaction
 * is too large to serialize.
 */
export function buildAppBatch(params: AppBatchParams): ReclaimBatch {
  const blockhash = params.blockhash ?? fakeBlockhash();
  for (let batchSize = params.accounts.length; ; batchSize -= 1) {
    try {
      return serializeAppBatch({ ...params, blockhash, accounts: params.accounts.slice(0, batchSize) });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("Transaction too large") && batchSize > 1)) throw error;
    }
  }
}

function serializeAppBatch(params: AppBatchParams): ReclaimBatch {
  const { transaction, fees, serviceRentFeeLamports } = buildAppTransaction(params);
  const sponsor = params.sponsor ?? null;
  const raw = transaction.serialize({ requireAllSignatures: false, verifySignatures: !!sponsor });
  return {
    batchIndex: params.batchIndex ?? 0,
    emptyCount: params.accounts.length,
    unsignedTx: raw.toString("base64"),
    requiresServiceSignature: !!sponsor,
    serverSignerPublicKey: sponsor?.publicKey.toBase58(),
    preparedTxToken: `prepared.${params.batchIndex ?? 0}`,
    blockhash: transaction.recentBlockhash!,
    lastValidBlockHeight: params.lastValidBlockHeight ?? 1_000,
    preparedAt: new Date().toISOString(),
    grossLamports: fees.grossLamports,
    netLamports: fees.netLamports,
    fees: {
      serviceLamports: fees.serviceLamports,
      referralLamports: fees.referralLamports,
      serviceRentLamports: serviceRentFeeLamports,
      referralPubkey: params.referral?.toBase58() ?? null,
    },
  };
}
