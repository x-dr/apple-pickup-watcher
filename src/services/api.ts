import type { CheckResponse, HealthResponse, Target } from "@/domain/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function requestJson<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof payload.error === "string" ? payload.error : "request_failed",
      typeof payload.message === "string" ? payload.message : `请求失败（HTTP ${response.status}）`,
    );
  }
  return payload as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health", "", { cache: "no-store" });
}

export function verifyAccessToken(token: string): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>("/api/verify", token, { cache: "no-store" });
}

export function checkTargets(
  targets: Target[],
  previousFailures: Record<string, number>,
  token: string,
): Promise<CheckResponse> {
  return requestJson<CheckResponse>("/api/check", token, {
    method: "POST",
    body: JSON.stringify({ targets, previousFailures }),
  });
}

export function sendBark(
  input: { title: string; body: string; url: string },
  token: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>("/api/notify", token, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
