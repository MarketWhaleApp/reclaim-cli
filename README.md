# reclaim-cli

Check candidate Solana token-account rent using a public address, with itemized deductions, provisional eligibility and JSON output for agents. No wallet connection or private key is needed for an explicit public-address preview.

Reclaim deducts 6% service + 4% referral from recovered account lamports; without an external referral both go to the service. Low-balance subsidy/account-rent charges can apply. Estimated net excludes unknown network fees. See the [fees and eligibility reference](https://reclaim.mwh.app/learn/reclaim-solana-rent-tool#fees). Browser signing and advanced local execution are separate choices.

The preview-v1 integration in this source checkout requires the matching `/api/v1/preview` service deployment. It is not a newly published npm package or tagged release. For the API contract, limits, and data handling, see [Developer API](https://reclaim.mwh.app/developers).

## Public-address preview — no private key

Requirements: Node.js 20+ and npm.

```sh
git clone https://github.com/MarketWhaleApp/reclaim-cli.git
cd reclaim-cli
npm install
npm run wallet:check -- PUBLIC_WALLET_ADDRESS
```

Replace `PUBLIC_WALLET_ADDRESS`. Use a checkout containing the preview-v1 source. This operation does not read `.env`, load a signer, create a referral, or sign/submit transactions. It sends the public address to the Reclaim preview service and its Solana RPC provider. Provider/access-log retention is described in the developer reference.

For machine-readable output:

```sh
npm --silent run wallet:check -- PUBLIC_WALLET_ADDRESS --json
```

The npm `--silent` flag suppresses npm's command banner; compiler diagnostics go to stderr. After a successful build, stdout contains one versioned JSON document on both preview success and handled errors. JSON mode requires an explicit public address and never falls back to a signer. A compilation failure can produce no JSON; check stderr and the exit status.

The [example JSON](docs/preview-v1-example.json) is illustrative, not a live observation. Lamport amounts are decimal strings. Use `BigInt` for exact arithmetic. The response separates gross rent, base service, referral portion, subsidy, and service account-rent charges. `networkFeeLamports: null` means unknown, not zero; estimated net excludes network fees. Candidate accounts and eligibility are provisional, not a transaction simulation. Token-2022 extensions and close authorities can prevent closure.

Empty accounts with a foreign close authority can make `empty` exceed `candidates + protected`. Eligible previews can include an `UNSUPPORTED_CLOSE_AUTHORITY` warning.

Observations include the minimum/maximum RPC context slots and a 30-second freshness window. The reads are not an atomic snapshot. Recheck before signing, even within that window.

| Exit | Meaning |
| --- | --- |
| 0 | Valid, provisionally eligible preview |
| 3 | Valid empty or blocked preview; explain the reason codes |
| 2 | Invalid public address or command arguments |
| 4 | Throttled; retry after the server's Retry-After interval |
| 1 | Network, service, stale, incompatible-response, or build failure |

Text mode shows itemized deductions and warnings. The preview does not guarantee a final balance. No external referral input is accepted by v1; the referral portion goes to the service.

A dependency-free example is also included:

```sh
node scripts/preview-wallet.mjs PUBLIC_WALLET_ADDRESS
```

For an explicitly selected development instance, set `RECLAIM_API_BASE_URL=http://localhost:3104` for the CLI, or pass that URL as the example script's second argument. Production overrides must use HTTPS. Public preview errors do not fall back to the old endpoint, because that would silently change the contract.

Agent integration: [version 1.0 agent guide](docs/agents/preview-v1.md). OpenAPI: [preview-v1.json](https://reclaim.mwh.app/openapi/preview-v1.json). MCP packaging is deferred until the contract is stable and preview adoption is demonstrated.

## Example result and integration

Illustrative funded-wallet example, not a live quote:

```text
2 candidate accounts; provisional eligibility: eligible
Gross rent: 0.004078560 SOL
Service: 0.000244713 SOL; referral portion: 0.000163142 SOL
Subsidy and service-account rent: 0 SOL
Estimated net before unknown network fees: 0.003670705 SOL
No transactions signed or submitted.
```

Run the offline demonstration (eligible, empty and throttled responses):

```sh
npm run demo:preview
```

It uses clearly labeled fixtures and makes no network requests. For a host-controlled tool handler that validates schema, identity, freshness and amount arithmetic, see [the framework-neutral adapter](docs/integrations/preview-tool.md). This is a local integration example, not an accepted upstream plugin or published MCP server.

The [dated wallet study](https://reclaim.mwh.app/learn/i-scanned-1000-solana-wallets-free-sol#results) covers 85 attempted addresses from an archived leaderboard cohort: 75 completed previews and ten failures. Its amounts are historical estimates, not a prediction for your wallet. The updated article requires the matching web deployment.

## Browser signing

For most users, continue at [Reclaim](https://reclaim.mwh.app/) and review transaction details in your connected wallet. Several batches can require several approvals. Rejecting a transaction is a valid choice. No private key is required by the website.

## Advanced local execution

Execution is a separate action from preview. It requires `WALLET_PRIVATE_KEY` on your own machine and automatically signs service-prepared batches. The current signer does not independently enforce a complete instruction/destination/fee policy. Do not treat a preview as permission for unattended execution.

If you choose local execution, create `.env` from `.env.example` only if it does not already exist. Open it yourself and configure `WALLET_PRIVATE_KEY` (base58 secret key or JSON byte array). Do not overwrite existing configuration. Never paste the private key into chat, a website, screenshots, logs, or support messages.

```sh
npm run build
npm run wallet:check
```

Without a public-address argument, the text preview derives the wallet from your local signer. Confirm that this is the intended wallet; an earlier public-address preview does not select the execution wallet. Review estimated proceeds, deductions, and limitations. When working with an agent, the repository workflow requires `Confirm: run reclaim` before execution.

```sh
npm run reclaim
```

`npm run start` is equivalent. These commands request transactions, sign locally, and submit signed batches through the Reclaim service. They begin execution without another per-batch browser confirmation. The private key is not sent to the service.

Review transaction IDs and failures. Some batches can confirm while others fail. Re-scan before retrying. The current CLI performs one pass with bounded submission concurrency; it is intended for empty-account rent recovery, not arbitrary token transfers or transactions.

## Development checks

```sh
npm test
```

Tests include preview JSON validation, zero-result and failure cases, and local mock-server checks of the actual CLI process and dependency-free example. No tests submit a live Solana transaction.
