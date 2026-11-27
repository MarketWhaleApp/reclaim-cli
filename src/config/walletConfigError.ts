const messages = {
  missingKey: "Missing WALLET_PRIVATE_KEY",
  invalidJson: "WALLET_PRIVATE_KEY is not a valid JSON byte array",
  invalidArray: "WALLET_PRIVATE_KEY array value must be an array",
  invalidByte: "WALLET_PRIVATE_KEY array values must be integers between 0 and 255",
  invalidBase58: "WALLET_PRIVATE_KEY is not valid base58",
  invalidSecretKey: "WALLET_PRIVATE_KEY is not a valid Solana secret key",
};

export class WalletConfigError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
  }

  get safeMessage(): string {
    return messages[this.code];
  }
}
