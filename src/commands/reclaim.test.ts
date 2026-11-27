import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { devNull, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const entryPoint = fileURLToPath(new URL("../index.js", import.meta.url));

test("reclaim reports malformed wallet keys without echoing key material", () => {
  const cases = [
    {
      privateKey: "[201,202,203,]",
      sentinel: "201,202,203",
      message: "WALLET_PRIVATE_KEY is not a valid JSON byte array",
    },
    {
      privateKey: "1,2,307,308,309",
      sentinel: "307,308,309",
      message: "WALLET_PRIVATE_KEY array values must be integers between 0 and 255",
    },
    {
      privateKey: "invalid0base58",
      sentinel: "invalid0base58",
      message: "WALLET_PRIVATE_KEY is not valid base58",
    },
    {
      privateKey: "[91,92,93]",
      sentinel: "91,92,93",
      message: "WALLET_PRIVATE_KEY is not a valid Solana secret key",
    },
  ];

  for (const { privateKey, sentinel, message } of cases) {
    const result = spawnSync(process.execPath, [entryPoint], {
      cwd: tmpdir(),
      encoding: "utf8",
      env: {
        DOTENV_CONFIG_PATH: devNull,
        RECLAIM_API_BASE_URL: "http://127.0.0.1:9",
        WALLET_PRIVATE_KEY: privateKey,
      },
      timeout: 5_000,
    });

    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(sentinel), false, "stdout exposed dummy key material");
    assert.equal(result.stderr.includes(sentinel), false, "stderr exposed dummy key material");
    assert.ok(result.stderr.split(/\r?\n/).includes(`[reclaim] fatal error=${message}`));
  }
});
