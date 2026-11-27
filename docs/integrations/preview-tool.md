# Public-address preview tool adapter

This checkout includes a framework-neutral TypeScript handler. It is not a published package, framework-specific plugin or MCP server. Node.js 22+. Build with `npm run build`.

```js
import { previewToolDefinition, previewSolanaRent } from './dist/preview/tool.js';

// Register the descriptor using your host framework's tool API.
// Pass the parsed tool arguments to this handler:
const result = await previewSolanaRent({ publicKey: 'PUBLIC_WALLET_ADDRESS' });
if (result.ok) {
  // Includes gross/net lamport strings, deductions, provisional eligibility,
  // reasons, observation/expiry, warnings, and a normal browser continuation URL.
  console.log(JSON.stringify(result.preview));
} else {
  console.log(result.error.code, result.error.retryAfterSeconds);
}
```

Replace PUBLIC_WALLET_ADDRESS with the address the user selected. `previewToolDefinition.inputSchema` allows only that argument. The host, not the model, supplies an optional `baseUrl` for development, e.g. `http://localhost:3104`. Mainnet service deployment is required for the default origin.

`ok: true` means a valid preview, including blocked or empty results. Inspect `eligibility.status` and `reasonCodes`; it does not authorize signing. `ok: false` includes a safe error code/message, retryability and optional retry interval. The handler makes one read-only request, reuses the bounded response parser, and does not retry automatically or fall back to a different endpoint. It does not import dotenv, signer setup, transaction preparation or submission.

The API receives the public address and sends it to its RPC provider. Provider/access-log retention is separate from application logging. Network fees remain unknown, and Token-2022 warnings must be shown. Unknown amounts are never zero. The host should recheck freshness before explaining an actionable quote, and keep later signing as a separate user decision.

## Offline demonstration

```sh
npm run demo:preview
npm test
```

The demonstration injects fixture responses without making network calls. It shows eligible, no_accounts and RATE_LIMITED behavior. Tests also cover invalid/extra arguments, stale responses and blocked results. Do not present the illustrative fixture as a mainnet observation.

## Contribution scope

For a framework maintainer, offer an example that wraps this read-only handler in that framework's current tool interface. Match their dependency policy, license, input schema, tests and contribution guidance before opening a PR. No framework integration has been submitted or accepted. Do not add a wallet provider or execution action just to obtain a public preview.
