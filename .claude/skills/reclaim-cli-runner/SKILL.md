---
name: reclaim-cli-runner
description: Use when helping a reclaim.mwh.app user run reclaim-cli to preview and reclaim SOL rent from closable empty Solana token accounts using local transaction signing.
---

# Run reclaim-cli For A User

Use this skill to help a `reclaim.mwh.app` user safely run the existing `reclaim-cli`.

The CLI is for users who have many closable empty Solana token accounts and want to reclaim the SOL rent locked in those accounts without manually approving a large number of transactions. The CLI keeps the wallet private key local, signs prepared transactions locally, and submits the signed batches through the Reclaim service with bounded concurrency.

This skill is an operator workflow only. It does not replace the CLI, modify the CLI, or add new transaction logic.

This workflow is only for closing empty token accounts and reclaiming rent. Do not use it to transfer tokens, move wallet balances, send arbitrary transactions, or modify the CLI to sign unrelated transactions.

The reclaim transaction may include the Reclaim service fee as part of the transaction being signed. This is expected behavior. The wallet-check preview shows the net amount the user can receive; do not claim the CLI logs an itemized fee unless it actually does.

## Safe Flow

Always follow the project README and existing package scripts.

1. Set up the repo.
2. Ask the user to add their private key locally to `.env`.
3. Run the wallet check first.
4. Summarize the reclaim preview.
5. Ask for explicit confirmation.
6. Only then run reclaim execution.

## Setup

Use the existing project commands:

```bash
npm install
npm run build
```

If `.env` does not exist, create it from `.env.example`:

```bash
cp .env.example .env
```

If `.env` already exists, do not overwrite it.

Ask the user to open `.env` themselves and add:

```env
WALLET_PRIVATE_KEY=...
```

Pause until the user confirms this is done.

## Secret Handling

Never ask the user to paste their private key into chat.

Never read, print, diff, screenshot, summarize, or display `.env`.

Do not run `cat .env`, `printenv`, or commands that expose environment variables.

Let the CLI validate whether `.env` is configured correctly.

Do not put private keys into logs, screenshots, support messages, websites, or remote services.

## Run Order

Always run the wallet preview first:

```bash
npm run wallet:check
```

The wallet check is mandatory. It does not sign or execute transactions.

If the user only wants to preview a public key, use:

```bash
npm run wallet:check -- <publicKey>
```

That public-key preview does not require `WALLET_PRIVATE_KEY`, but it is not approval for execution. Reclaim execution always uses the wallet from `.env` and requires `WALLET_PRIVATE_KEY`.

After the wallet check, summarize the output in plain language:

- wallet address
- accounts that can be closed
- how much SOL can be received after any service fee reflected by the Reclaim service
- current wallet balance
- wallet balance after reclaim

Before asking for confirmation, explain that reclaiming empty token accounts returns SOL rent to the wallet, and that the prepared reclaim transaction may include the Reclaim service fee. Tell the user that the preview amount is the net amount they can receive, and they should continue only if the wallet address, net reclaim amount, and projected balance look correct.

Then ask the user to reply exactly:

```text
Confirm: run reclaim
```

Do not run execution for vague confirmations such as "ok", "yes", or "sure".

Only after the exact confirmation, run the existing execution script:

```bash
npm run reclaim
```

`npm run start` is also valid, but prefer `npm run reclaim` when giving user-facing instructions because it is clearer.

## After Execution

Tell the user:

- whether execution completed
- how many batches were submitted
- any transaction ids returned
- whether any batch failed

If execution fails, explain the failure simply and do not expose secrets.

## Optional Automation

Only suggest cron after one successful manual run.

Before suggesting cron, make sure the user understands that the machine will keep local access to `.env` and therefore retain local signing capability.

For safer automation, include the preview before execution:

```bash
0 9 * * * cd /path/to/reclaim-cli && npm run wallet:check && npm run reclaim >> reclaim-cli.log 2>&1
```

Explain that this runs a wallet preview first, then runs one reclaim pass at 9:00 each day and writes output to a local log file.
