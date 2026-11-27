import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { ReclaimBatchFees } from "../types/api.js";

/**
 * Minimal pre-sign check for service-prepared reclaim transactions.
 *
 * It holds only rules that follow from what a reclaim is, derived from the
 * decoded transaction and the wallet's own public key:
 *   a. every account closed under the wallet's authority pays its lamports to the wallet;
 *   b. SOL leaving the wallet through System transfers totals at most the fees
 *      the service quoted for this batch (an upper bound, never an exact match);
 *   c. no other instruction uses the wallet as signer or authority;
 *   d. no durable-nonce transactions.
 *
 * It deliberately does NOT check program allowlists, the fee payer, fee wallet
 * addresses, the blockhash, compute budget, instruction count or order, or
 * exact amounts, so ordinary service-side changes do not break signing.
 * Instructions that never reference the wallet pass untouched: a program can
 * only act on accounts its instruction passes to it.
 */

export type PresignRule = "a" | "b" | "c" | "d";

const RULE_TEXT: Record<PresignRule, string> = {
  a: "an account closed with the wallet as authority must send its lamports to the wallet",
  b: "SOL sent from the wallet exceeds the fees the service quoted for this batch",
  c: "an instruction uses the wallet as signer or authority outside closing accounts and paying the quoted fees",
  d: "durable-nonce transactions are not accepted",
};

export class PresignCheckError extends Error {
  constructor(
    readonly rule: PresignRule,
    readonly instructionIndex: number,
  ) {
    super(`Pre-sign check failed: rule ${rule} at instruction ${instructionIndex}: ${RULE_TEXT[rule]}`);
    this.name = "PresignCheckError";
  }
}

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// System program instruction tags (u32 little-endian).
const SYSTEM_TRANSFER = 2;
const SYSTEM_ADVANCE_NONCE_ACCOUNT = 4;
// SPL Token / Token-2022 instruction tags (u8).
const TOKEN_CLOSE_ACCOUNT = 9;
const TOKEN_TRANSFER_FEE_EXTENSION = 26;
const TRANSFER_FEE_HARVEST_WITHHELD_TOKENS_TO_MINT = 4;

/** Sum of the fees the service quoted for one batch. Missing or malformed fields count as 0. */
export function quotedFeeLamports(fees: ReclaimBatchFees | undefined): bigint {
  const lamports = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? BigInt(value) : 0n;
  return lamports(fees?.serviceLamports) + lamports(fees?.referralLamports) + lamports(fees?.serviceRentLamports);
}

function systemTag(ix: TransactionInstruction): number | null {
  return ix.data.length >= 4 ? ix.data.readUInt32LE(0) : null;
}

function isTokenProgram(programId: PublicKey): boolean {
  return programId.equals(TOKEN_PROGRAM_ID) || programId.equals(TOKEN_2022_PROGRAM_ID);
}

function isHarvestToMint(ix: TransactionInstruction): boolean {
  return (
    ix.programId.equals(TOKEN_2022_PROGRAM_ID) &&
    ix.data.length >= 2 &&
    ix.data[0] === TOKEN_TRANSFER_FEE_EXTENSION &&
    ix.data[1] === TRANSFER_FEE_HARVEST_WITHHELD_TOKENS_TO_MINT
  );
}

export function checkReclaimTransaction(
  transaction: Transaction,
  wallet: PublicKey,
  fees: ReclaimBatchFees | undefined,
): void {
  const feeLimit = quotedFeeLamports(fees);
  const closedByWallet = new Set<string>();
  const harvestsTouchingWallet: number[] = [];
  let sentFromWallet = 0n;

  transaction.instructions.forEach((ix, index) => {
    const touchesWallet = ix.keys.some(({ pubkey }) => pubkey.equals(wallet));

    if (ix.programId.equals(SystemProgram.programId)) {
      const tag = systemTag(ix);
      if (tag === SYSTEM_ADVANCE_NONCE_ACCOUNT) throw new PresignCheckError("d", index);
      if (!touchesWallet) return;

      if (tag === SYSTEM_TRANSFER && ix.data.length >= 12 && ix.keys.length >= 2) {
        const from = ix.keys[0].pubkey;
        const to = ix.keys[1].pubkey;
        if (from.equals(wallet) && !to.equals(wallet)) {
          sentFromWallet += ix.data.readBigUInt64LE(4);
          if (sentFromWallet > feeLimit) throw new PresignCheckError("b", index);
        }
        // A transfer into the wallet (or to itself) does not spend the wallet's SOL.
        return;
      }

      throw new PresignCheckError("c", index);
    }

    if (!touchesWallet) return;

    if (isTokenProgram(ix.programId) && ix.data[0] === TOKEN_CLOSE_ACCOUNT && ix.keys.length >= 3) {
      // keys: [account, destination, authority, ...multisig signers]
      const walletAsAuthority = ix.keys.some(({ pubkey }, position) => position !== 1 && pubkey.equals(wallet));
      if (!walletAsAuthority) return; // the wallet only receives the closed account's lamports
      if (!ix.keys[1].pubkey.equals(wallet)) throw new PresignCheckError("a", index);
      closedByWallet.add(ix.keys[0].pubkey.toBase58());
      return;
    }

    if (isHarvestToMint(ix)) {
      // Permissionless; allowed to reference the wallet only for accounts this transaction closes.
      harvestsTouchingWallet.push(index);
      return;
    }

    throw new PresignCheckError("c", index);
  });

  for (const index of harvestsTouchingWallet) {
    // keys: [mint, ...source token accounts]
    const [mint, ...sources] = transaction.instructions[index].keys;
    const ok =
      !mint.pubkey.equals(wallet) &&
      sources.length > 0 &&
      sources.every(({ pubkey }) => closedByWallet.has(pubkey.toBase58()));
    if (!ok) throw new PresignCheckError("c", index);
  }
}
