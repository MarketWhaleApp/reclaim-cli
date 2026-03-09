import {
  ExecuteReclaimRequest,
  ExecuteReclaimResponse,
  PrepareReclaimRequest,
  PrepareReclaimResponse,
  ReclaimSummaryResponse,
} from "../types/api.js";
import { HttpClient } from "./http.js";

export class ReclaimApiClient {
  constructor(private readonly http: HttpClient) {}

  getSummary(publicKey: string): Promise<ReclaimSummaryResponse> {
    return this.http.get<ReclaimSummaryResponse>("/api/reclaim", { publicKey });
  }

  prepareReclaim(payload: PrepareReclaimRequest): Promise<PrepareReclaimResponse> {
    return this.http.post<PrepareReclaimResponse>("/api/reclaim", payload);
  }

  executeReclaim(payload: ExecuteReclaimRequest): Promise<ExecuteReclaimResponse> {
    return this.http.post<ExecuteReclaimResponse>("/api/reclaim/execute", payload);
  }
}
