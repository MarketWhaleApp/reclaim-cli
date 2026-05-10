# reclaim-cli

`reclaim-cli` is a small automation tool for people using `reclaim.mwh.app` who want to reclaim SOL rent from closable empty Solana token accounts without manually signing a huge number of transactions.

The main problem it solves is simple: if your wallet has many empty Solana token accounts with reclaimable rent, potentially over 1 SOL total, the website flow can trigger hundreds or thousands of close-account transaction approvals. This CLI automates that process by talking to the live Reclaim service, signing each prepared transaction locally, and submitting the signed transactions through the Reclaim platform.

## What Reclaiming SOL Means

On Solana, many token accounts hold a small rent deposit. If those token accounts are empty, they can often be closed and the locked SOL can be returned to your wallet.

That is what "reclaiming SOL" means in this project:
- find empty token accounts in your wallet
- close them
- return the reclaimable SOL back to your wallet balance

`reclaim-cli` helps automate that process when there are too many transactions to sign comfortably by hand.

This tool is only for closing empty token accounts and reclaiming rent. Do not use it to transfer tokens, move wallet balances, send arbitrary transactions, or modify the CLI to sign unrelated transactions.

## Service Fee

The reclaim transaction may include the Reclaim service fee as part of the transaction being signed. This is expected behavior.

Before execution, review the wallet-check preview carefully:
- reclaiming empty token accounts returns SOL rent to your wallet
- the transaction may include a service fee
- `wallet:check` shows the net amount you can receive and projected wallet balance
- only continue if the wallet address, net reclaim amount, and projected balance look correct

## What It Does

The CLI connects to `https://reclaim.mwh.app` and:

1. checks your wallet for reclaimable accounts
2. requests prepared reclaim transactions
3. signs those transactions locally on your machine
4. submits signed batches automatically with bounded concurrency
5. prints progress and transaction ids

## Why Use It

Use it when:
- you already use `reclaim.mwh.app`
- your wallet has many reclaimable accounts
- you want to avoid repetitive wallet popups and manual approvals

## Security

- Your private key stays local
- The private key is never sent to the Reclaim service
- Only signed transactions are submitted
- Do not paste your private key into chat, websites, screenshots, logs, or support messages
- Do not print, inspect, diff, or display `.env`

## Requirements

- Node.js `20+`
- `npm`
- your Solana wallet private key

You do not need any global CLI tools or Solana CLI installation.

## Install

```bash
cd reclaim-cli
npm install
```

## Configure

Create `.env` only if it does not already exist:

```bash
cd reclaim-cli
cp .env.example .env
```

If `.env` already exists, do not overwrite it.

Open `.env` locally and set your private key:

```env
WALLET_PRIVATE_KEY=your_private_key_here
```

`WALLET_PRIVATE_KEY` supports:
- base58 secret key
- JSON array secret key such as `[12,34,...]`

## How To Use It

Build the project:

```bash
cd reclaim-cli
npm run build
```

Step 1. Check your wallet first

This lets you see how many accounts can be closed and how much SOL you can receive before executing anything.

Use the wallet from `.env`:

```bash
cd reclaim-cli
npm run wallet:check
```

Or check a specific wallet manually:

```bash
cd reclaim-cli
npm run wallet:check -- <publicKey>
```

Example:

```bash
npm run wallet:check -- 9xQeWvG816bUx9EPfEZ5P4ccqL3fX2CqLkM1Vg5bR6Yh
```

This script only checks the wallet and prints:
- wallet address
- how many accounts can be closed
- how much SOL you can receive after any service fee reflected by the Reclaim service
- current wallet balance
- wallet balance after reclaim

It does not sign or execute any transactions.

When you pass a public key manually, `wallet:check` does not need `WALLET_PRIVATE_KEY`. Reclaim execution always uses the wallet from `.env` and requires `WALLET_PRIVATE_KEY`.

Step 2. Start reclaim execution

After checking the wallet, start the reclaim flow:

```bash
cd reclaim-cli
npm run reclaim
```

`npm run start` works too, but `npm run reclaim` is the clearer command name for this tool.

Alternative:

```bash
cd reclaim-cli
npm run start
```

This starts the actual reclaim execution, signs prepared transactions locally, and submits the signed batches with bounded concurrency.

## Typical Flow

```bash
cd reclaim-cli
npm install
# If .env does not already exist:
cp .env.example .env
# Then open .env locally and add WALLET_PRIVATE_KEY.
npm run build
npm run wallet:check
npm run reclaim
```

## Output

The CLI prints:
- wallet summary
- each submitted batch
- each returned transaction id
- batch failures
- final summary

## Service Used

By default the CLI uses the live production service:

- `https://reclaim.mwh.app/api/reclaim`
- `https://reclaim.mwh.app/api/reclaim/execute`

## Notes

- Batches are submitted with at most 5 requests in flight and a short stagger; results are reported in the original batch order
- The current implementation signs legacy Solana `Transaction` payloads to match the existing service output
- The CLI is intentionally simple and runs a single reclaim pass per execution

## Optional Automation

After one successful manual run, you can choose to automate the CLI locally. Only do this if you understand that the machine will retain local signing capability through `.env`, especially if the wallet holds large balances.

Example daily cron entry:

```bash
0 9 * * * cd /path/to/reclaim-cli && npm run wallet:check && npm run reclaim >> reclaim-cli.log 2>&1
```

This runs a wallet preview first, then starts one reclaim pass at 9:00 each day and writes output to a local log file.
