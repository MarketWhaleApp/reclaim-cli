import { Buffer } from "buffer";
import bs58 from "bs58";
import { Keypair, Transaction } from "@solana/web3.js";
import { WalletConfigError } from "../config/walletConfigError.js";
import type { ReclaimBatchFees } from "../types/api.js";
import { checkReclaimTransaction } from "./presignCheck.js";

function parseByteArray(input: unknown): Uint8Array {
  if (!Array.isArray(input)) {
    throw new WalletConfigError("invalidArray");
  }

  const bytes = input.map((value) => {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new WalletConfigError("invalidByte");
    }

    return value;
  });

  return Uint8Array.from(bytes);
}

export function parseWalletPrivateKey(privateKey: string): Uint8Array {
  const trimmed = privateKey.trim();

  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new WalletConfigError("invalidJson");
    }
    return parseByteArray(parsed);
  }

  if (/^\d+(\s*,\s*\d+)+$/.test(trimmed)) {
    return parseByteArray(trimmed.split(",").map((value) => Number(value.trim())));
  }

  try {
    return bs58.decode(trimmed);
  } catch {
    throw new WalletConfigError("invalidBase58");
  }
}

export function loadKeypair(privateKey: string): Keypair {
  const secretKey = parseWalletPrivateKey(privateKey);
  try {
    return Keypair.fromSecretKey(secretKey);
  } catch {
    throw new WalletConfigError("invalidSecretKey");
  }
}

/**
 * Check, then sign, a service-prepared reclaim transaction.
 *
 * The pre-sign check runs on the same decoded transaction that is signed; on
 * failure it throws `PresignCheckError` and nothing is signed. `partialSign`
 * adds the wallet signature while keeping any service fee-payer signature
 * already present on subsidized batches (`sign` would discard it).
 */
export function signReclaimTransaction(unsignedTx: string, keypair: Keypair, fees: ReclaimBatchFees | undefined): string {
  const transaction = Transaction.from(Buffer.from(unsignedTx, "base64"));
  checkReclaimTransaction(transaction, keypair.publicKey, fees);
  transaction.partialSign(keypair);

  return Buffer.from(transaction.serialize()).toString("base64");
}
