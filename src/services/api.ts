import {
  isAvailability,
  targetKey,
  type CheckGroup,
  type CheckRequestV2,
  type CheckResponse,
  type CheckResponseV2,
  type HealthResponse,
  type Target,
  type TargetState,
} from "@/domain/types";

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

function groupTargets(targets: Target[]): CheckGroup[] {
  const groups = new Map<string, CheckGroup>();
  for (const target of targets) {
    const key = `${target.locale}|${target.storeNumber}`;
    const group = groups.get(key) ?? { locale: target.locale, storeNumber: target.storeNumber, items: [] };
    group.items.push({ partNumber: target.partNumber });
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function checkTargets(targets: Target[], token: string, signal?: AbortSignal): Promise<CheckResponse> {
  const request: CheckRequestV2 = { version: 2, groups: groupTargets(targets) };
  const value = await requestJson<CheckResponseV2>("/api/check", token, {
    method: "POST", body: JSON.stringify(request), signal,
  }, 55_000);
  const requestedGroups = new Map<string, Map<string, Target>>();
  for (const target of targets) {
    const groupKey = `${target.locale}|${target.storeNumber}`;
    const items = requestedGroups.get(groupKey) ?? new Map<string, Target>();
    if (items.has(target.partNumber)) throw new ApiError(400, "duplicate_targets", "监控目标中存在重复项");
    items.set(target.partNumber, target);
    requestedGroups.set(groupKey, items);
  }
  if (value.version !== 2 || typeof value.healthy !== "boolean" || !Number.isFinite(value.checkedAt) ||
    !Number.isInteger(value.requestCount) || value.requestCount < 0 || !Number.isFinite(value.retryAfterSeconds) ||
    !Array.isArray(value.groups) || value.groups.length !== requestedGroups.size) {
    throw new ApiError(502, "invalid_response", "库存响应不完整");
  }
  const seenGroups = new Set<string>();
  const seenTargets = new Set<string>();
  const rows: TargetState[] = [];
  for (const rawGroup of value.groups as unknown[]) {
    if (!rawGroup || typeof rawGroup !== "object" || Array.isArray(rawGroup)) {
      throw new ApiError(502, "invalid_response", "库存响应包含无效分组");
    }
    const group = rawGroup as Record<string, unknown>;
    const groupKey = `${group.locale}|${group.storeNumber}`;
    const requested = requestedGroups.get(groupKey);
    if (typeof group.locale !== "string" || typeof group.storeNumber !== "string" ||
      !requested || seenGroups.has(groupKey) || !Array.isArray(group.items)) {
      throw new ApiError(502, "invalid_response", "库存响应包含无效分组");
    }
    seenGroups.add(groupKey);
    for (const rawItem of group.items) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        throw new ApiError(502, "invalid_response", "库存响应包含无效条目");
      }
      const item = rawItem as Record<string, unknown>;
      const target = typeof item.partNumber === "string" ? requested.get(item.partNumber) : undefined;
      const availability = item.availability;
      const key = target ? targetKey(target) : "";
      if (!target || seenTargets.has(key) || !isAvailability(availability) ||
        (availability.kind === "unknown" && availability.reason === "not_yet_checked")) {
        throw new ApiError(502, "invalid_response", "库存响应包含无效条目");
      }
      seenTargets.add(key);
      rows.push({ target, availability, lastCheckedMs: value.checkedAt });
    }
  }
  if (rows.length !== targets.length || value.healthy !== rows.every((row) => row.availability.kind !== "unknown")) {
    throw new ApiError(502, "invalid_response", "库存响应不完整");
  }
  return {
    healthy: value.healthy,
    checkedAt: value.checkedAt,
    requestCount: value.requestCount,
    retryAfterSeconds: Math.max(0, Math.min(3600, value.retryAfterSeconds)),
    rows,
  };
}

export async function sendBark(input: { title: string; body: string; url: string }, token: string, signal?: AbortSignal): Promise<{ ok: true }> {
  const value = await requestJson<{ ok: true }>("/api/notify", token, {
    method: "POST", body: JSON.stringify(input), signal,
  });
  if (value.ok !== true) throw new ApiError(502, "invalid_response", "推送响应不正确");
  return value;
}
