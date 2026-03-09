# Run reclaim-cli For A User

Use this repo to help a user automate reclaim execution for `reclaim.mwh.app`.

This tool exists to avoid manually signing a very large number of reclaim transactions. The safe flow is:
- set up the repo
- ask the user for their private key only when needed
- run the wallet check first
- show the result
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
cp .env.example .env
npm run build
```

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
npm run start
```

`wallet:check` is the safe preview step.

It tells the user:
- which wallet is being checked
- how many accounts can be closed
- how much SOL they can receive
- current wallet balance
- wallet balance after reclaim

`start` is the real execution step.

It signs prepared transactions locally and submits them to the live Reclaim service.

## Rules

ALWAYS:

- Follow the README instead of inventing a custom flow
- Ask for the private key only when it is required
- Ask the user to enter the private key into `.env` themselves
- Treat `wallet:check` as mandatory before execution
- Show the result of `wallet:check` to the user
- Ask the user to confirm before running `npm run start`
- Keep the private key local only
- Use the existing package manager and project scripts

NEVER:

- Skip the wallet check step
- Print, echo, or restate the private key back to the user
- Ask the user to paste the private key into the chat
- Send the private key to any remote service
- Put the private key into logs, screenshots, or error messages
- Tell the user to paste the private key into a website
- Add extra setup steps that are not needed

## Verify Before Responding

1. Was `.env` created from `.env.example`?
2. Was `WALLET_PRIVATE_KEY` added locally?
3. Was `npm install` run?
4. Was `npm run build` run?
5. Was `npm run wallet:check` run before execution?
6. Did the user confirm before `npm run start`?

If any answer is no, fix that first.

## After Wallet Check

Show the user the wallet check result in plain language:
- wallet address
- accounts that can be closed
- how much SOL they can receive
- current balance
- balance after reclaim

Then ask whether they want to continue with reclaim execution.

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
0 9 * * * cd /path/to/reclaim-cli && npm run start >> reclaim-cli.log 2>&1
```

Explain that this runs the reclaim client once per day at 9:00 and writes output to a local log file.
