import {
  ExecuteReclaimRequest,
  ExecuteReclaimResponse,
  PrepareReclaimRequest,
  PrepareReclaimResponse,
} from "../types/api.js";
import { HttpClient } from "./http.js";

/**
 * The service sends and confirms each batch before it answers execute, so the
 * execute call needs far longer than the default request timeout.
 */
export const EXECUTE_TIMEOUT_MS = 120_000;

export interface ReclaimApi {
  prepareNextBatch(payload: PrepareReclaimRequest): Promise<PrepareReclaimResponse>;
  executeBatch(payload: ExecuteReclaimRequest): Promise<ExecuteReclaimResponse>;
}

export class ReclaimApiClient implements ReclaimApi {
  constructor(
    private readonly http: HttpClient,
    private readonly executeTimeoutMs: number = EXECUTE_TIMEOUT_MS,
  ) {}

  prepareNextBatch(payload: PrepareReclaimRequest): Promise<PrepareReclaimResponse> {
    return this.http.post<PrepareReclaimResponse>("/api/reclaim", payload);
  }

  executeBatch(payload: ExecuteReclaimRequest): Promise<ExecuteReclaimResponse> {
    return this.http.post<ExecuteReclaimResponse>("/api/reclaim/execute", payload, {
      timeoutMs: this.executeTimeoutMs,
    });
  }
}
