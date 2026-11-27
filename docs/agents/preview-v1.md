# Reclaim public-address agent guide — version 1.0

Use this guide when a user wants to inspect or explain potentially reclaimable Solana token-account rent. This version accompanies the preview-v1 source implementation; it does not claim a published package or release tag. It requires a deployed `/api/v1/preview` endpoint (or an explicitly configured local development instance).

From this repository checkout with Node.js 20+:

```sh
npm install
npm --silent run wallet:check -- PUBLIC_WALLET_ADDRESS --json
```

Replace the placeholder with the user's public address. This mode needs no `.env`, private key, wallet connection, or referral enrollment. Do not create local signer configuration for a preview. Respect the wallet and task scope the user selected.

Interpret schemaVersion `1.0` using the [developer contract](https://reclaim.mwh.app/developers) and [illustrative response](../preview-v1-example.json). Amounts are exact lamport strings; use BigInt rather than floating point. Show candidate count, gross rent, each deduction, and the estimated net before network fees. `networkFeeLamports: null` means unknown. Eligibility is provisional; a candidate count is not proof of successful closure. Show blocking reasons and validation warnings. Observations span context slots rather than an atomic snapshot; refresh expired results and recheck before any signing decision.

Empty accounts with a foreign close authority can make `empty` exceed `candidates + protected`. Eligible previews can include an `UNSUPPORTED_CLOSE_AUTHORITY` warning.

Exit status 0 means provisionally eligible. Status 3 means a valid empty or blocked preview; parse and explain it. Status 2 is invalid input, 4 is throttling, and 1 is a failed, stale, or incompatible response. For throttling, wait for server Retry-After (or retry later); do not loop aggressively. Machine consumers use the npm `--silent` flag so stdout is a single JSON document. Compilation errors are on stderr.

Offer the browser workflow at https://reclaim.mwh.app/ when the user wants to continue. Advanced local execution is documented in the repository README and requires its separate signing confirmation. A public preview never authorizes execution. Do not request, read, print, or transmit secret key material. Do not claim the current signer validates a complete instruction/destination/fee policy; expanding unattended signing requires that separate implementation.

No MCP installation is part of this version. MCP packaging waits for a stable contract and evidence of preview adoption.
