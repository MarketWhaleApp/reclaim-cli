import { CheckError, fetchPreview } from "./check.js";

/** Framework-neutral descriptor. The host chooses how to register the tool. */
export const previewToolDefinition = {
  name: "preview_solana_rent",
  description: "Read a public Solana address's candidate rent and estimated deductions. Eligibility is provisional; network fees are unknown. Does not sign or submit transactions.",
  inputSchema: {
    type: "object",
    properties: { publicKey: { type: "string", description: "The public Solana wallet address to preview." } },
    required: ["publicKey"],
    additionalProperties: false,
  },
} as const;

/** The endpoint is host configuration, never an argument controlled by the model. */
export async function previewSolanaRent(input: unknown, options: { baseUrl?: string; fetcher?: typeof fetch } = {}) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new CheckError("INVALID_REQUEST", "Supply an object with a publicKey string.", 2);
    const args = input as Record<string, unknown>;
    if (Object.keys(args).length !== 1 || typeof args.publicKey !== "string") throw new CheckError("INVALID_REQUEST", "Only the publicKey argument is supported.", 2);
    const preview = await fetchPreview(args.publicKey, options.baseUrl, options.fetcher);
    return { ok: true as const, preview };
  } catch (error) {
    if (error instanceof CheckError) return { ok: false as const, error: { code: error.code, message: error.message, retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds } };
    return { ok: false as const, error: { code: "INTERNAL_ERROR", message: "The preview could not be completed.", retryable: false, retryAfterSeconds: null } };
  }
}
