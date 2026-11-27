import { ApiErrorResponse } from "../types/api.js";

const SAFE_TOKEN = /^[A-Za-z0-9_]{1,64}$/;

function safeToken(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : undefined;
}

/** A non-2xx response. Only sanitized, structured fields are kept for display. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly code?: string;
  readonly category?: string;
  readonly retryable: boolean;
  readonly nextAction?: string;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;

    const fields: ApiErrorResponse = typeof body === "object" && body !== null ? (body as ApiErrorResponse) : {};
    this.code = safeToken(fields.code);
    this.category = safeToken(fields.category);
    this.retryable = fields.retryable === true || fields.retriable === true;
    this.nextAction = safeToken(fields.nextAction);
  }
}

/** The request was sent but no response arrived in time; the outcome is unknown. */
export class RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  timeoutMs?: number;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, options.timeoutMs ?? this.timeoutMs);
  }

  private async request<T>(input: string, init: RequestInit, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        headers: {
          ...this.defaultHeaders,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const body = text ? tryParseJson(text) : null;

      if (!response.ok) {
        throw new HttpError(`Request failed with status ${response.status}`, response.status, body);
      }

      return body as T;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new RequestTimeoutError(timeoutMs);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function tryParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}
