import {
  PENDING_AVAILABILITY,
  productUrl,
  type Settings,
  type Target,
  type TargetState,
} from "@/domain/types";

const SETTINGS_KEY = "apw:web:settings:v1";
const TARGETS_KEY = "apw:web:targets:v1";
const TOKEN_KEY = "apw:web:access-token";

export const DEFAULT_SETTINGS: Settings = {
  locale: "zh_CN",
  intervalSeconds: 60,
  browserNotifications: true,
  soundEnabled: true,
  barkEnabled: false,
  openProductOnHit: false,
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings(): Settings {
  const saved = readJson<Partial<Settings>>(SETTINGS_KEY, {});
  const seconds = Number(saved.intervalSeconds);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    intervalSeconds:
      Number.isFinite(seconds) && seconds >= 30 && seconds <= 3600 ? seconds : 60,
  };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadTargetStates(): TargetState[] {
  const targets = readJson<Target[]>(TARGETS_KEY, []);
  if (!Array.isArray(targets)) return [];
  return targets.slice(0, 24).map((target) => ({
    target: {
      ...target,
      productUrl: productUrl(target.locale, target.partNumber, target.companionPart),
    },
    availability: PENDING_AVAILABILITY,
    lastCheckedMs: null,
    consecutiveFailures: 0,
  }));
}

export function saveTargets(targets: Target[]): void {
  localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
}

export function loadAccessToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function saveAccessToken(token: string): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}
