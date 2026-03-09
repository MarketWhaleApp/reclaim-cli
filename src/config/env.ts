import { ReclaimRuntimeConfig } from "../types/config.js";

const DEFAULT_API_BASE_URL = "https://reclaim.mwh.app";
const DEFAULT_TIMEOUT_MS = 30_000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ReclaimRuntimeConfig {
  const apiBaseUrl = env.RECLAIM_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
  const privateKey = env.WALLET_PRIVATE_KEY?.trim();

  if (!privateKey) {
    throw new Error("Missing WALLET_PRIVATE_KEY");
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    privateKey,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    loop: {
      enabled: false,
      intervalMs: 60_000,
      maxIterations: 1,
      stopOnError: true,
    },
  };
}
