import { backoffMs } from "./retryPolicy";

// Integration Engine (Sprint 2A) — API Client abstraction. A thin,
// dependency-free wrapper over fetch() that gives every future integration
// (Sprint 2B+, e.g. a specific government registry) a consistent shape for
// auth, timeouts, and bounded retries, instead of each integration
// reimplementing its own fetch plumbing. No external API is called by this
// sprint — this is scaffolding only, exercised in tests with an injected
// fetch implementation.

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "api_key"; header: string; key: string }
  | { type: "basic"; username: string; password: string };

export interface ApiClientConfig {
  baseUrl: string;
  auth?: AuthConfig;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number; // retries on network error or 5xx; 4xx never retries
  fetchImpl?: typeof fetch; // injectable for tests
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
  headers: Headers;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

function buildAuthHeaders(auth: AuthConfig | undefined): Record<string, string> {
  if (!auth || auth.type === "none") return {};
  switch (auth.type) {
    case "bearer":
      return { Authorization: `Bearer ${auth.token}` };
    case "api_key":
      return { [auth.header]: auth.key };
    case "basic":
      return { Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}` };
  }
}

function buildUrl(baseUrl: string, path: string, query?: ApiRequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  async request<T = unknown>(opts: ApiRequestOptions): Promise<ApiResponse<T>> {
    const fetchFn = this.config.fetchImpl ?? fetch;
    const url = buildUrl(this.config.baseUrl, opts.path, opts.query);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.config.defaultHeaders,
      ...buildAuthHeaders(this.config.auth),
      ...opts.headers,
    };
    const maxRetries = this.config.maxRetries ?? 0;
    const timeoutMs = this.config.timeoutMs ?? 10_000;

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchFn(url, {
          method: opts.method ?? "GET",
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status >= 500 && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, backoffMs(attempt + 1)));
          continue;
        }

        const contentType = res.headers.get("content-type") ?? "";
        const data = (contentType.includes("application/json") ? await res.json() : await res.text()) as T;
        return { status: res.status, ok: res.ok, data, headers: res.headers };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, backoffMs(attempt + 1)));
          continue;
        }
      }
    }
    const message = lastError instanceof Error ? lastError.message : "Unknown API client error";
    throw new ApiClientError(`Request to ${url} failed: ${message}`);
  }
}
