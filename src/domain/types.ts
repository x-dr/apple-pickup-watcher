export type Category = "iphone" | "ipad" | "mac" | "watch";

export type UnknownReason =
  | { reason: "not_yet_checked" }
  | { reason: "blocked"; detail: string }
  | { reason: "rate_limited"; detail?: string }
  | { reason: "schema_drift"; field: string; raw: string }
  | { reason: "apple_error"; message: string }
  | { reason: "transport"; detail: string };

export type Availability =
  | { kind: "in_stock" }
  | { kind: "out_of_stock" }
  | ({ kind: "unknown" } & UnknownReason);

export interface Region {
  locale: string;
  title: string;
  baseUrl: string;
}

export interface Store {
  number: string;
  name: string;
  title: string;
}

export interface Product {
  partNumber: string;
  category: Category;
  family: string;
  capacity: string;
  color: string;
  title: string;
  companionPart?: string;
}

export interface CatalogPayload {
  locale: string;
  generatedAt: string;
  sourceCommit: string;
  stores: Store[];
  products: Product[];
}

export interface Target {
  locale: string;
  storeNumber: string;
  storeTitle: string;
  partNumber: string;
  productName: string;
  productUrl: string;
  companionPart?: string;
}

export interface TargetState {
  target: Target;
  availability: Availability;
  lastCheckedMs: number | null;
  consecutiveFailures: number;
  lastConfirmed?: { kind: "in_stock" | "out_of_stock"; checkedAt: number };
}

export interface Settings {
  locale: string;
  intervalSeconds: number;
  browserNotifications: boolean;
  soundEnabled: boolean;
  barkEnabled: boolean;
  openProductOnHit: boolean;
}

export interface CheckResponse {
  healthy: boolean;
  checkedAt: number;
  requestCount: number;
  rows: TargetState[];
  retryAfterSeconds?: number;
}

export interface HealthResponse {
  ok: true;
  authConfigured: boolean;
  barkConfigured: boolean;
  runtime: string;
}

export const REGIONS: Region[] = [
  { title: "中国大陆", locale: "zh_CN", baseUrl: "https://www.apple.com.cn" },
  { title: "中国香港", locale: "zh_HK", baseUrl: "https://www.apple.com/hk-zh" },
  { title: "中国台湾", locale: "zh_TW", baseUrl: "https://www.apple.com/tw" },
  { title: "日本", locale: "ja_JP", baseUrl: "https://www.apple.com/jp" },
  { title: "Singapore", locale: "en_SG", baseUrl: "https://www.apple.com/sg" },
  { title: "Australia", locale: "en_AU", baseUrl: "https://www.apple.com/au" },
  { title: "Malaysia", locale: "en_MY", baseUrl: "https://www.apple.com/my" },
];

export const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
  { value: "iphone", label: "iPhone" },
  { value: "ipad", label: "iPad" },
  { value: "mac", label: "Mac" },
  { value: "watch", label: "Apple Watch" },
];

export const QUERY_INTERVAL_OPTIONS = [5, 10, 15, 30, 60] as const;

export const PENDING_AVAILABILITY: Availability = {
  kind: "unknown",
  reason: "not_yet_checked",
};

export function targetKey(target: Target): string {
  return `${target.locale}|${target.storeNumber}|${target.partNumber}`;
}

export function isUntrusted(availability: Availability): boolean {
  return availability.kind === "unknown" && availability.reason !== "not_yet_checked";
}

export function isAvailability(value: unknown): value is Availability {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (item.kind === "in_stock" || item.kind === "out_of_stock") return true;
  if (item.kind !== "unknown") return false;
  switch (item.reason) {
    case "not_yet_checked": return true;
    case "blocked": case "transport": return typeof item.detail === "string";
    case "rate_limited": return item.detail === undefined || typeof item.detail === "string";
    case "schema_drift": return typeof item.field === "string" && typeof item.raw === "string";
    case "apple_error": return typeof item.message === "string";
    default: return false;
  }
}

export function availabilityLabel(availability: Availability): string {
  if (availability.kind === "in_stock") return "有货";
  if (availability.kind === "out_of_stock") return "无货";
  return availability.reason === "not_yet_checked" ? "待查询" : "未知";
}

export function availabilityDetail(availability: Availability): string | null {
  if (availability.kind !== "unknown") return null;
  switch (availability.reason) {
    case "not_yet_checked":
      return "尚未完成首次查询";
    case "blocked":
      return `请求被 Apple 拦截：${availability.detail}`;
    case "rate_limited":
      return availability.detail ?? "查询过于频繁，正在退避";
    case "schema_drift":
      return `接口结构与预期不符：${availability.field} = ${availability.raw}`;
    case "apple_error":
      return `Apple 返回错误：${availability.message}`;
    case "transport":
      return `网络请求失败：${availability.detail}`;
  }
}

export function formatCheckedTime(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function pathPart(partNumber: string): string {
  return partNumber.trim().split("/").map(encodeURIComponent).join("/");
}

export function productUrl(locale: string, partNumber: string, companionPart?: string): string {
  const region = REGIONS.find((item) => item.locale === locale) ?? REGIONS[0]!;
  if (companionPart) {
    const url = new URL(`${region.baseUrl}/shop/buy-watch`);
    url.searchParams.set("option.watch_cases", partNumber.trim());
    url.searchParams.set("option.watch_bands", companionPart.trim());
    return url.toString();
  }
  return `${region.baseUrl}/shop/product/${pathPart(partNumber)}`;
}
