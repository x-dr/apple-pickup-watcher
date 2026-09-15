import { readResponseText, retryAfterSeconds, withResponse } from "./http";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const SESSION_TTL_MS = 20 * 60 * 1000;
const BLOCK_COOLDOWN_MS = 5 * 60 * 1000;

export type UnknownAvailability =
  | { kind: "unknown"; reason: "blocked"; detail: string }
  | { kind: "unknown"; reason: "rate_limited"; detail: string }
  | { kind: "unknown"; reason: "schema_drift"; field: string; raw: string }
  | { kind: "unknown"; reason: "apple_error"; message: string }
  | { kind: "unknown"; reason: "transport"; detail: string };

export type Availability =
  | { kind: "in_stock" }
  | { kind: "out_of_stock" }
  | UnknownAvailability;

export interface QueryTarget {
  locale: string;
  storeNumber: string;
  partNumber: string;
}

export interface QueryRow {
  locale: string;
  storeNumber: string;
  partNumber: string;
  availability: Availability;
}

interface RegionProfile {
  baseUrl: string;
  language: string;
  referer: string;
}

const regions: Record<string, RegionProfile> = {
  zh_CN: { baseUrl: "https://www.apple.com.cn", language: "zh-CN,zh;q=0.9", referer: "/shop/buy-iphone/iphone-18-pro" },
  zh_HK: { baseUrl: "https://www.apple.com/hk-zh", language: "zh-HK,zh;q=0.9", referer: "/shop/buy-iphone/iphone-18-pro" },
  zh_TW: { baseUrl: "https://www.apple.com/tw", language: "zh-TW,zh;q=0.9", referer: "/shop/buy-iphone/iphone-18-pro" },
  ja_JP: { baseUrl: "https://www.apple.com/jp", language: "ja-JP,ja;q=0.9", referer: "/shop/buy-iphone/iphone-18-pro" },
  en_SG: { baseUrl: "https://www.apple.com/sg", language: "en-US,en;q=0.9", referer: "/shop/buy-iphone/iphone-18-pro" },
  en_AU: { baseUrl: "https://www.apple.com/au", language: "en-US,en;q=0.9", referer: "/shop/buy-iphone/iphone-18-pro" },
  en_MY: { baseUrl: "https://www.apple.com/my", language: "en-US,en;q=0.9", referer: "/shop/buy-iphone/iphone-18-pro" },
};

const sessions = new Map<string, { cookie: string; expiresAt: number }>();
const cooldowns = new Map<string, { until: number; reason: "blocked" | "rate_limited"; attempts: number }>();

const chromeHeaders = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

function unknown(
  reason: UnknownAvailability["reason"],
  detail: string,
  field?: string,
  raw?: string,
): UnknownAvailability {
  if (reason === "schema_drift") {
    return { kind: "unknown", reason, field: field ?? "response", raw: raw ?? detail };
  }
  if (reason === "apple_error") return { kind: "unknown", reason, message: detail };
  return { kind: "unknown", reason, detail };
}

function cookieHeader(headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = typeof getSetCookie === "function"
    ? getSetCookie.call(headers)
    : [headers.get("set-cookie") ?? ""];
  const pairs = values
    .flatMap((value) => value.split(/,(?=\s*[!#$%&'*+.^_`|~0-9A-Za-z-]+=)/))
    .map((value) => value.split(";", 1)[0]?.trim() ?? "")
    .filter(Boolean);
  return [...new Set(pairs)].join("; ");
}

async function warmSession(locale: string, profile: RegionProfile, fetchImpl: typeof fetch, signal: AbortSignal): Promise<string> {
  const cached = sessions.get(locale);
  if (cached && cached.expiresAt > Date.now()) return cached.cookie;
  try {
    return await withResponse(
      `${profile.baseUrl}/shop/bag`,
      {
        signal,
        redirect: "follow",
        headers: {
          ...chromeHeaders,
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-language": profile.language,
        },
      },
      8_000,
      async (response) => {
        const cookie = response.ok ? cookieHeader(response.headers) : "";
        if (cookie) sessions.set(locale, { cookie, expiresAt: Date.now() + SESSION_TTL_MS });
        return cookie;
      },
      fetchImpl,
    );
  } catch {
    signal.throwIfAborted();
    return "";
  }
}

function coolDown(locale: string, failure: UnknownAvailability, retrySeconds = 0): void {
  if (failure.reason !== "blocked" && failure.reason !== "rate_limited") return;
  const attempts = Math.min(5, (cooldowns.get(locale)?.attempts ?? 0) + 1);
  const delay = failure.reason === "blocked" ? BLOCK_COOLDOWN_MS : Math.min(900_000, 60_000 * 2 ** (attempts - 1));
  cooldowns.set(locale, { until: Date.now() + Math.max(delay, retrySeconds * 1000), reason: failure.reason, attempts });
  if (failure.reason === "blocked") sessions.delete(locale);
}

function classifyHttp(response: Response): UnknownAvailability | null {
  if (response.status === 200) return null;
  if (response.status === 403 || response.status === 541) {
    return unknown("blocked", `HTTP ${response.status}`);
  }
  if (response.status === 429 || response.status >= 500) {
    return unknown("rate_limited", `Apple 返回 HTTP ${response.status}`);
  }
  return unknown("transport", `Apple 返回 HTTP ${response.status}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseEnvelope(raw: string): { stores?: unknown[]; error?: UnknownAvailability } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { error: unknown("blocked", "HTTP 200 但响应不是 JSON") };
  }
  const root = asRecord(parsed);
  const head = asRecord(root?.head);
  const body = asRecord(root?.body);
  if (!root || !body) {
    return { error: unknown("schema_drift", "响应缺少 body", "body", "missing") };
  }
  const errorMessage = body.errorMessage;
  if (typeof errorMessage === "string" && errorMessage.trim()) {
    return { error: unknown("apple_error", errorMessage.trim()) };
  }
  const status = head?.status;
  if (status !== undefined && status !== null && status !== "200" && status !== 200) {
    return { error: unknown("schema_drift", "head.status 不是 200", "head.status", JSON.stringify(status)) };
  }
  const direct = Array.isArray(body.stores) ? body.stores : [];
  const content = asRecord(body.content);
  const pickupMessage = asRecord(content?.pickupMessage);
  const fallback = Array.isArray(pickupMessage?.stores) ? pickupMessage.stores : [];
  const stores = direct.length > 0 ? direct : fallback;
  if (stores.length === 0) {
    return {
      error: unknown(
        "apple_error",
        "Apple 没有返回任何门店；所选型号可能已停售、尚未开售或当前无法购买",
      ),
    };
  }
  return { stores };
}

function availabilityFrom(value: unknown): Availability {
  const display = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (display === "available") return { kind: "in_stock" };
  if (display === "unavailable" || display === "ineligible") return { kind: "out_of_stock" };
  return unknown("schema_drift", "无法识别 pickupDisplay", "pickupDisplay", display || "missing");
}

function parseStoreRows(targets: QueryTarget[], stores: unknown[]): Map<string, Availability> {
  const result = new Map<string, Availability>();
  const wantedStore = targets[0]?.storeNumber ?? "";
  const store = stores
    .map(asRecord)
    .find((item) => item?.storeNumber === wantedStore);
  if (!store) {
    const failure = unknown(
      "schema_drift",
      "响应中缺少目标门店",
      "body.stores[].storeNumber",
      wantedStore,
    );
    for (const target of targets) result.set(target.partNumber, failure);
    return result;
  }
  const parts = asRecord(store.partsAvailability);
  if (!parts || Object.keys(parts).length === 0) {
    const failure = unknown(
      "schema_drift",
      "目标门店没有返回型号状态",
      "body.stores[].partsAvailability",
      "empty",
    );
    for (const target of targets) result.set(target.partNumber, failure);
    return result;
  }
  const partAvailability = (part: string): Availability => {
    const entry = asRecord(parts[part]);
    if (!entry) return unknown("schema_drift", "响应缺少目标型号", `partsAvailability.${part}`, "missing");
    if (typeof entry.partNumber === "string" && entry.partNumber.trim() && entry.partNumber.trim() !== part) {
      return unknown("schema_drift", "型号键与响应内容不一致", `partsAvailability.${part}.partNumber`, entry.partNumber);
    }
    return availabilityFrom(entry.pickupDisplay);
  };
  for (const target of targets) {
    result.set(target.partNumber, partAvailability(target.partNumber));
  }
  return result;
}

async function queryStore(
  targets: QueryTarget[],
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Map<string, Availability>> {
  const first = targets[0]!;
  const profile = regions[first.locale]!;
  signal.throwIfAborted();
  const cooldown = cooldowns.get(first.locale);
  if (cooldown && cooldown.until > Date.now()) {
    const seconds = Math.ceil((cooldown.until - Date.now()) / 1000);
    throw unknown(cooldown.reason, `冷却中，约 ${seconds} 秒后可重试`);
  }
  const parts = new Set<string>();
  for (const target of targets) {
    parts.add(target.partNumber);
  }
  const params = new URLSearchParams({ pl: "true", "mts.0": "regular", store: first.storeNumber });
  [...parts].forEach((part, index) => params.set(`parts.${index}`, part));
  const cookie = await warmSession(first.locale, profile, fetchImpl, signal);
  return withResponse(
    `${profile.baseUrl}/shop/retail/pickup-message?${params}`,
    {
      signal,
      redirect: "manual",
      headers: {
        ...chromeHeaders,
        accept: "*/*",
        "accept-language": profile.language,
        referer: `${profile.baseUrl}${profile.referer}`,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        ...(cookie ? { cookie } : {}),
      },
    },
    12_000,
    async (response, readSignal) => {
      const httpFailure = classifyHttp(response);
      if (httpFailure) {
        coolDown(first.locale, httpFailure, retryAfterSeconds(response.headers.get("retry-after")));
        throw httpFailure;
      }
      const envelope = parseEnvelope(await readResponseText(response, MAX_RESPONSE_BYTES, readSignal));
      if (envelope.error) {
        coolDown(first.locale, envelope.error);
        throw envelope.error;
      }
      cooldowns.delete(first.locale);
      return parseStoreRows(targets, envelope.stores ?? []);
    },
    fetchImpl,
  );
}

function isAvailability(value: unknown): value is UnknownAvailability {
  return asRecord(value)?.kind === "unknown";
}

export async function checkAppleTargets(
  targets: QueryTarget[],
  fetchImpl: typeof fetch = fetch,
  requestSignal?: AbortSignal,
): Promise<{ healthy: boolean; checkedAt: number; requestCount: number; retryAfterSeconds: number; rows: QueryRow[] }> {
  const groups = new Map<string, QueryTarget[]>();
  for (const target of targets) {
    const key = `${target.locale}|${target.storeNumber}`;
    groups.set(key, [...(groups.get(key) ?? []), target]);
  }

  const deadline = AbortSignal.timeout(45_000);
  const signal = requestSignal ? AbortSignal.any([requestSignal, deadline]) : deadline;
  let requestCount = 0;
  const countedFetch: typeof fetch = (input, init) => { requestCount += 1; return fetchImpl(input, init); };
  const rows: QueryRow[] = [];
  const storeGroups = [...groups.values()];
  for (const [index, group] of storeGroups.entries()) {
    let statuses: Map<string, Availability>;
    try {
      statuses = await queryStore(group, countedFetch, signal);
    } catch (error) {
      const failure = isAvailability(error)
        ? error
        : unknown("transport", error instanceof Error ? error.message : "请求失败");
      statuses = new Map(group.map((target) => [target.partNumber, failure]));
    }
    for (const target of group) {
      const availability = statuses.get(target.partNumber) ?? unknown(
        "schema_drift",
        "查询结果缺少目标型号",
        `partsAvailability.${target.partNumber}`,
        "missing",
      );
      rows.push({
        locale: target.locale,
        storeNumber: target.storeNumber,
        partNumber: target.partNumber,
        availability,
      });
    }
    if (index < storeGroups.length - 1 && !signal.aborted) await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return {
    healthy: rows.every((row) => row.availability.kind !== "unknown"),
    checkedAt: Date.now(),
    requestCount,
    retryAfterSeconds: Math.max(0, ...targets.map((target) => Math.ceil(((cooldowns.get(target.locale)?.until ?? 0) - Date.now()) / 1000))),
    rows,
  };
}

export function knownLocale(locale: string): boolean {
  return Object.hasOwn(regions, locale);
}
