# reclaim-cli

`reclaim-cli` is a small automation tool for people using `reclaim.mwh.app` who do not want to manually sign a huge number of transactions.

The main problem it solves is simple: if your wallet has many reclaimable token accounts, the website flow can trigger dozens or even 100+ wallet signature prompts. This CLI automates that process by talking to the live Reclaim service, signing each prepared transaction locally, and submitting them one by one for you.

## What It Does

The CLI connects to `https://reclaim.mwh.app` and:

1. checks your wallet for reclaimable accounts
2. requests prepared reclaim transactions
3. signs those transactions locally on your machine
4. submits them automatically in sequence
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

Create `.env`:

```bash
cd reclaim-cli
cp .env.example .env
```

Set your private key:

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
- how much SOL you can receive
- current wallet balance
- wallet balance after reclaim

It does not sign or execute any transactions.

Step 2. Start reclaim execution

After checking the wallet, start the reclaim flow:

```bash
cd reclaim-cli
npm run start
```

This starts the actual reclaim execution, signs prepared transactions locally, and submits them in sequence.

## Typical Flow

```bash
cd reclaim-cli
npm install
cp .env.example .env
npm run build
npm run wallet:check
npm run start
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

- Transactions are executed sequentially and keep the original batch order
- The current implementation signs legacy Solana `Transaction` payloads to match the existing service output
- The CLI is intentionally simple and runs a single reclaim pass per execution
