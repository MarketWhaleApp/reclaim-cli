export interface LoopConfig {
  enabled: boolean;
  intervalMs: number;
  maxIterations?: number;
  stopOnError: boolean;
}

export interface ReclaimRuntimeConfig {
  apiBaseUrl: string;
  privateKey: string;
  timeoutMs: number;
  loop: LoopConfig;
}
