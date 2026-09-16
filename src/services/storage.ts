import { PENDING_AVAILABILITY, QUERY_INTERVAL_OPTIONS, REGIONS, productUrl, targetKey, type Settings, type Target, type TargetState } from "@/domain/types";

const SETTINGS_KEY = "apw:web:settings:v1";
const TARGETS_KEY = "apw:web:targets:v1";
const TOKEN_KEY = "apw:web:access-token";
const RUNNING_KEY = "apw:web:running";

export const DEFAULT_SETTINGS: Settings = {
  locale: "zh_CN", intervalSeconds: 60, browserNotifications: true,
  soundEnabled: true, notificationEnabled: false, openProductOnHit: false,
};

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as unknown; }
  catch { return null; }
}

export function normalizeSettings(value: unknown): Settings {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const seconds = saved.intervalSeconds;
  const result = { ...DEFAULT_SETTINGS };
  if (REGIONS.some((region) => region.locale === saved.locale)) result.locale = saved.locale as string;
  if (typeof seconds === "number" && QUERY_INTERVAL_OPTIONS.some((option) => option === seconds)) {
    result.intervalSeconds = seconds;
  }
  for (const key of ["browserNotifications", "soundEnabled", "notificationEnabled", "openProductOnHit"] as const) {
    if (typeof saved[key] === "boolean") result[key] = saved[key];
  }
  if (typeof saved.notificationEnabled !== "boolean" && saved.barkEnabled === true) result.notificationEnabled = true;
  return result;
}

export function loadSettings(): Settings { return normalizeSettings(readJson(SETTINGS_KEY)); }

function saveJson(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
export function saveSettings(settings: Settings): boolean { return saveJson(SETTINGS_KEY, settings); }

export function loadTargetStates(): TargetState[] {
  const saved = readJson(TARGETS_KEY);
  if (!Array.isArray(saved)) return [];
  const targets: Target[] = [];
  const keys = new Set<string>();
  const stores = new Set<string>();
  for (const raw of saved) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (!REGIONS.some((region) => region.locale === item.locale) ||
      typeof item.storeNumber !== "string" || !/^R[0-9]{3,4}$/.test(item.storeNumber) ||
      typeof item.partNumber !== "string" || !/^[A-Z0-9]{1,28}\/[A-Z0-9]{1,3}$/.test(item.partNumber) ||
      typeof item.storeTitle !== "string" || !item.storeTitle.trim() || item.storeTitle.length > 120 ||
      typeof item.productName !== "string" || !item.productName.trim() || item.productName.length > 240 ||
      item.companionPart !== undefined) continue;
    const target: Target = {
      locale: item.locale as string, storeNumber: item.storeNumber, storeTitle: item.storeTitle,
      partNumber: item.partNumber, productName: item.productName,
      productUrl: productUrl(item.locale as string, item.partNumber),
    };
    const storeKey = `${target.locale}|${target.storeNumber}`;
    if (keys.has(targetKey(target)) || (!stores.has(storeKey) && stores.size >= 6)) continue;
    keys.add(targetKey(target)); stores.add(storeKey); targets.push(target);
    if (targets.length === 24) break;
  }
  return targets.map((target) => ({ target, availability: PENDING_AVAILABILITY, lastCheckedMs: null }));
}

export function saveTargets(targets: Target[]): boolean { return saveJson(TARGETS_KEY, targets); }
export function loadRunning(): boolean {
  try { return sessionStorage.getItem(RUNNING_KEY) === "1"; } catch { return false; }
}
export function saveRunning(running: boolean): boolean {
  try {
    if (running) sessionStorage.setItem(RUNNING_KEY, "1");
    else sessionStorage.removeItem(RUNNING_KEY);
    return true;
  } catch { return false; }
}
export function loadAccessToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
}
export function saveAccessToken(token: string): boolean {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
    return true;
  } catch { return false; }
}
