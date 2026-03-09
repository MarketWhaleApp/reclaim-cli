import test from "node:test";
import assert from "node:assert/strict";
import bs58 from "bs58";
import { parseWalletPrivateKey } from "./solanaSigner.js";

test("parseWalletPrivateKey supports JSON array input", () => {
  const parsed = parseWalletPrivateKey("[1, 2, 3, 4]");

  assert.deepEqual(Array.from(parsed), [1, 2, 3, 4]);
});

test("parseWalletPrivateKey supports comma-separated numeric string input", () => {
  const parsed = parseWalletPrivateKey("1, 2, 3, 4");

  assert.deepEqual(Array.from(parsed), [1, 2, 3, 4]);
});

test("parseWalletPrivateKey supports base58 string input", () => {
  const expected = Uint8Array.from([1, 2, 3, 4]);
  const parsed = parseWalletPrivateKey(bs58.encode(expected));

  assert.deepEqual(Array.from(parsed), Array.from(expected));
});
