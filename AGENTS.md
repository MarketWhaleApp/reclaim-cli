# Run reclaim-cli For A User

Use this repo to help a `reclaim.mwh.app` user safely reclaim SOL rent from closable empty Solana token accounts.

This tool is for users who have many empty Solana token accounts and do not want to manually approve a large number of close-account transactions. The CLI keeps the private key local, signs prepared transactions locally, and submits signed transactions through the Reclaim service.

This workflow is only for closing empty token accounts and reclaiming rent. Do not use it to transfer tokens, move wallet balances, send arbitrary transactions, or modify the CLI to sign unrelated transactions.

The reclaim transaction may include the Reclaim service fee as part of the transaction being signed. This is expected behavior. The wallet-check preview shows the net amount the user can receive; do not claim the CLI logs an itemized fee unless it actually does.

The safe flow is:
- set up the repo
- ask the user to add their private key locally to `.env` only when needed
- run the wallet check first
- summarize the reclaim preview
- ask for explicit confirmation
- only then run reclaim execution

Repo URL: `https://github.com/MarketWhaleApp/reclaim-cli.git`

## Setup

Clone the repo first:

```bash
git clone https://github.com/MarketWhaleApp/reclaim-cli.git
cd reclaim-cli
```

Then follow the project README.

Run:

```bash
npm install
npm run build
```

If `.env` does not exist, create it from `.env.example`:

```bash
cp .env.example .env
```

If `.env` already exists, do not overwrite it.

Then ask the user to open `.env` and enter their wallet private key themselves.

The user should add:

```env
WALLET_PRIVATE_KEY=...
```

Do not ask the user to send the private key to the agent.
Pause and continue only after the user confirms this step is done.

## Run Order

Always run commands in this order:

```bash
npm run wallet:check
npm run reclaim
```

`wallet:check` is the safe preview step.

It tells the user:
- which wallet is being checked
- how many accounts can be closed
- how much SOL they can receive after any service fee reflected by the Reclaim service
- current wallet balance
- wallet balance after reclaim

If the user only wants to preview a public key, `npm run wallet:check -- <publicKey>` can be used without `.env`. Do not treat that as approval for execution.

`reclaim` is the real execution step. `npm run start` is equivalent.

It signs prepared transactions locally and submits the signed batches to the live Reclaim service with bounded concurrency.

## Rules

ALWAYS:

- Follow the README instead of inventing a custom flow
- Ask the user to edit `.env` locally and add their private key themselves only when required
- Treat `wallet:check` as mandatory before execution
- Show the result of `wallet:check` to the user
- Explain before execution that the signed transaction may include a Reclaim service fee, and the preview amount is the net amount the user can receive
- Ask the user to reply with `Confirm: run reclaim` before running `npm run reclaim` or `npm run start`
- Keep the private key local only
- Use the existing package manager and project scripts

NEVER:

- Skip the wallet check step
- Print, echo, or restate the private key back to the user
- Ask the user to paste the private key into the chat
- Send the private key to any remote service
- Put the private key into logs, screenshots, or error messages
- Tell the user to paste the private key into a website
- Read, print, diff, screenshot, summarize, or display `.env`
- Run `cat .env`, `printenv`, or commands that expose environment variables
- Add extra setup steps that are not needed

## Verify Before Responding

1. Was `.env` created from `.env.example`?
2. Did user confirm they added `WALLET_PRIVATE_KEY` locally?
3. Was `npm install` run?
4. Was `npm run build` run?
5. Was `npm run wallet:check` run before execution?
6. Did the user confirm before `npm run reclaim` or `npm run start`?

If any answer is no, fix that first.

## After Wallet Check

Show the user the wallet check result in plain language:
- wallet address
- accounts that can be closed
- how much SOL they can receive after any service fee reflected by the Reclaim service
- current balance
- balance after reclaim

Explain that reclaiming empty token accounts returns SOL rent to the wallet, and that the prepared reclaim transaction may include the Reclaim service fee. Tell the user that the preview amount is the net amount they can receive, and they should continue only if the wallet address, net reclaim amount, and projected balance look correct.

Then ask whether they want to continue with reclaim execution.

Do not run `npm run reclaim` or `npm run start` until the user replies exactly:

```text
Confirm: run reclaim
```

## After Execution

Tell the user:
- whether execution completed
- how many batches were submitted
- any transaction ids returned
- whether any batch failed

If execution fails, explain the failure simply and do not expose secrets.

## Optional Automation

After the user has successfully run the CLI manually, you may suggest setting it up as a daily cron job.

Only suggest this after:
- the user has completed one successful manual run
- the user understands that the machine will need to keep local access to `.env`

Example cron entry:

```bash
0 9 * * * cd /path/to/reclaim-cli && npm run wallet:check && npm run reclaim >> reclaim-cli.log 2>&1
```

Explain that this runs a wallet preview first, then runs the reclaim client once per day at 9:00 and writes output to a local log file.

Do not suggest cron for wallets holding large balances unless the user understands that the machine will retain local signing capability through `.env`.
