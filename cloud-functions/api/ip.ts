import { authorize } from "./_shared/auth";
import {
  errorResponse,
  json,
  requestClientIp,
  RequestError,
  type MakersContext,
} from "./_shared/context";
import { readResponseText, withResponse } from "./_shared/http";
import { retryAfter } from "./_shared/rate-limit";

const IP_API_FIELDS = [
  "status", "message", "continent", "continentCode", "country", "countryCode",
  "region", "regionName", "city", "district", "zip", "lat", "lon", "timezone",
  "offset", "currency", "isp", "org", "as", "asname", "reverse", "mobile",
  "proxy", "hosting", "query",
].join(",");

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-max-age": "86400",
};

interface RuntimeIpInfo {
  status: "success";
  message: string | null;
  continent: string;
  continentCode: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  district: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  offset: number;
  currency: string;
  isp: string;
  org: string;
  as: string;
  asname: string;
  reverse: string;
  mobile: boolean;
  proxy: boolean;
  hosting: boolean;
  query: string;
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function requiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string") throw new RequestError(502, "ip_api_invalid_response", `IP-API 返回的 ${field} 字段无效`);
  return value;
}

function requiredNumber(input: Record<string, unknown>, field: string): number {
  const value = input[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RequestError(502, "ip_api_invalid_response", `IP-API 返回的 ${field} 字段无效`);
  }
  return value;
}

function requiredBoolean(input: Record<string, unknown>, field: string): boolean {
  const value = input[field];
  if (typeof value !== "boolean") throw new RequestError(502, "ip_api_invalid_response", `IP-API 返回的 ${field} 字段无效`);
  return value;
}

function parseRuntimeIpInfo(value: unknown): RuntimeIpInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(502, "ip_api_invalid_response", "IP-API 未返回有效数据");
  }
  const input = value as Record<string, unknown>;
  if (input.status !== "success") {
    const message = typeof input.message === "string" && input.message.trim()
      ? input.message.trim()
      : "IP-API 查询失败";
    throw new RequestError(502, "ip_api_failed", message);
  }
  return {
    status: "success",
    message: typeof input.message === "string" ? input.message : null,
    continent: requiredString(input, "continent"),
    continentCode: requiredString(input, "continentCode"),
    country: requiredString(input, "country"),
    countryCode: requiredString(input, "countryCode"),
    region: requiredString(input, "region"),
    regionName: requiredString(input, "regionName"),
    city: requiredString(input, "city"),
    district: requiredString(input, "district"),
    zip: requiredString(input, "zip"),
    lat: requiredNumber(input, "lat"),
    lon: requiredNumber(input, "lon"),
    timezone: requiredString(input, "timezone"),
    offset: requiredNumber(input, "offset"),
    currency: requiredString(input, "currency"),
    isp: requiredString(input, "isp"),
    org: requiredString(input, "org"),
    as: requiredString(input, "as"),
    asname: requiredString(input, "asname"),
    reverse: requiredString(input, "reverse"),
    mobile: requiredBoolean(input, "mobile"),
    proxy: requiredBoolean(input, "proxy"),
    hosting: requiredBoolean(input, "hosting"),
    query: requiredString(input, "query"),
  };
}

async function lookupRuntimeIp(apiKey: string, signal: AbortSignal): Promise<RuntimeIpInfo> {
  const url = new URL("https://pro.ip-api.com/json/");
  url.searchParams.set("lang", "zh-CN");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("fields", IP_API_FIELDS);

  return withResponse(url, { redirect: "error", signal }, 8_000, async (response, responseSignal) => {
    if (!response.ok) throw new RequestError(502, "ip_api_failed", `IP-API 返回 HTTP ${response.status}`);
    const raw = await readResponseText(response, 32 * 1024, responseSignal);
    let value: unknown;
    try { value = JSON.parse(raw) as unknown; }
    catch { throw new RequestError(502, "ip_api_invalid_response", "IP-API 未返回有效 JSON"); }
    return parseRuntimeIpInfo(value);
  });
}

export async function onRequestGet(context: MakersContext): Promise<Response> {
  const denied = authorize(context);
  if (denied) return cors(denied);

  const apiKey = context.env.APW_IP_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return cors(json({
      error: "ip_api_not_configured",
      message: "服务端未配置 APW_IP_API_KEY",
    }, 503));
  }

  const clientIp = requestClientIp(context);
  const seconds = retryAfter(`ip:${clientIp ?? "unknown"}`, 5_000);
  if (seconds > 0) {
    return cors(json({
      error: "too_many_requests",
      message: `获取 IP 过于频繁，请 ${seconds} 秒后重试`,
    }, 429, { "retry-after": String(seconds) }));
  }

  try {
    const runtimeIp = await lookupRuntimeIp(apiKey, context.request.signal);
    return cors(json({ clientIp, runtimeIp, checkedAt: Date.now() }));
  } catch (error) {
    return cors(errorResponse(error));
  }
}

export function onRequestOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
