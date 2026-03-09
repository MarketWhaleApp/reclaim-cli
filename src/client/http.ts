import { ApiErrorResponse } from "../types/api.js";

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
  defaultHeaders?: Record<string, string>;
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

  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return this.request<T>(url.toString(), { method: "GET" });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.postWithQuery<T>(path, body);
  }

  async postWithQuery<T>(
    path: string,
    body: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return this.request<T>(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(input: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

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
        const errorMessage =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as ApiErrorResponse).error)
            : `Request failed with status ${response.status}`;

        throw new HttpError(errorMessage, response.status, body);
      }

      return body as T;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`);
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
