import { Buffer } from "buffer";
import bs58 from "bs58";
import { Keypair, Transaction } from "@solana/web3.js";

function parseByteArray(input: unknown): Uint8Array {
  if (!Array.isArray(input)) {
    throw new Error("WALLET_PRIVATE_KEY array value must be an array");
  }

  const bytes = input.map((value) => {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error("WALLET_PRIVATE_KEY array values must be integers between 0 and 255");
    }

    return value;
  });

  return Uint8Array.from(bytes);
}

export function parseWalletPrivateKey(privateKey: string): Uint8Array {
  const trimmed = privateKey.trim();

  if (trimmed.startsWith("[")) {
    return parseByteArray(JSON.parse(trimmed));
  }

  if (/^\d+(\s*,\s*\d+)+$/.test(trimmed)) {
    return parseByteArray(trimmed.split(",").map((value) => Number(value.trim())));
  }

  return bs58.decode(trimmed);
}

export function loadKeypair(privateKey: string): Keypair {
  const secretKey = parseWalletPrivateKey(privateKey);
  return Keypair.fromSecretKey(secretKey);
}

export function signUnsignedTransaction(unsignedTx: string, keypair: Keypair): string {
  const transaction = Transaction.from(Buffer.from(unsignedTx, "base64"));
  transaction.sign(keypair);

  return Buffer.from(transaction.serialize()).toString("base64");
}
