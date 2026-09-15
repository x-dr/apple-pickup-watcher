import { isAvailability, targetKey, type CheckResponse, type HealthResponse, type Target } from "@/domain/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds = 0,
  ) { super(message); }
}

async function requestJson<T>(path: string, token: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("请求超时，请稍后重试", "TimeoutError")), timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  try {
    const response = await fetch(path, {
      ...init,
      signal,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    let payload: Record<string, unknown> = {};
    try {
      const value: unknown = await response.json();
      if (value && typeof value === "object" && !Array.isArray(value)) payload = value as Record<string, unknown>;
    } catch { signal.throwIfAborted(); }
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const seconds = retry && !Number.isFinite(Number(retry)) ? (Date.parse(retry) - Date.now()) / 1000 : Number(retry);
      throw new ApiError(response.status,
        typeof payload.error === "string" ? payload.error : "request_failed",
        typeof payload.message === "string" ? payload.message : `请求失败（HTTP ${response.status}）`,
        Number.isFinite(seconds) ? Math.max(0, Math.min(3600, Math.ceil(seconds))) : 0,
      );
    }
    if (Object.keys(payload).length === 0) throw new ApiError(502, "invalid_response", "服务返回了无效数据");
    return payload as T;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error;
  } finally { clearTimeout(timer); }
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const value = await requestJson<HealthResponse>("/api/health", "", { cache: "no-store", signal });
  if (value.ok !== true || typeof value.authConfigured !== "boolean" || typeof value.barkConfigured !== "boolean") {
    throw new ApiError(502, "invalid_response", "服务状态响应不正确");
  }
  return value;
}

export async function verifyAccessToken(token: string): Promise<{ ok: true }> {
  const value = await requestJson<{ ok: true }>("/api/verify", token, { cache: "no-store" });
  if (value.ok !== true) throw new ApiError(502, "invalid_response", "口令验证响应不正确");
  return value;
}

export async function checkTargets(targets: Target[], previousFailures: Record<string, number>, token: string, signal?: AbortSignal): Promise<CheckResponse> {
  const value = await requestJson<CheckResponse>("/api/check", token, {
    method: "POST", body: JSON.stringify({ targets, previousFailures }), signal,
  }, 55_000);
  const requested = new Map(targets.map((target) => [targetKey(target), target]));
  const seen = new Set<string>();
  if (!Array.isArray(value.rows) || value.rows.length !== targets.length || !Number.isFinite(value.requestCount)) {
    throw new ApiError(502, "invalid_response", "库存响应不完整");
  }
  for (const row of value.rows) {
    const key = row?.target ? targetKey(row.target) : "";
    if (!requested.has(key) || seen.has(key) || !isAvailability(row.availability) ||
      !Number.isFinite(row.lastCheckedMs) || !Number.isInteger(row.consecutiveFailures) || row.consecutiveFailures < 0) {
      throw new ApiError(502, "invalid_response", "库存响应包含无效条目");
    }
    seen.add(key);
    row.target = requested.get(key)!;
  }
  value.retryAfterSeconds = Number.isFinite(value.retryAfterSeconds)
    ? Math.max(0, Math.min(3600, value.retryAfterSeconds!)) : 0;
  return value;
}

export async function sendBark(input: { title: string; body: string; url: string }, token: string, signal?: AbortSignal): Promise<{ ok: true }> {
  const value = await requestJson<{ ok: true }>("/api/notify", token, {
    method: "POST", body: JSON.stringify(input), signal,
  });
  if (value.ok !== true) throw new ApiError(502, "invalid_response", "推送响应不正确");
  return value;
}
