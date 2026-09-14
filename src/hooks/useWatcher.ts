import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { availabilityDetail, isUntrusted, targetKey, type CatalogPayload, type HealthResponse, type Settings, type Target, type TargetState } from "@/domain/types";
import { loadCatalog } from "@/domain/catalog";
import { ApiError, checkTargets, fetchHealth, sendBark, verifyAccessToken } from "@/services/api";
import { ensureNotificationPermission, playAlertTone, showStockNotification } from "@/services/notifications";
import {
  loadAccessToken,
  loadSettings,
  loadTargetStates,
  saveAccessToken,
  saveSettings,
  saveTargets,
} from "@/services/storage";

const MAX_LOG_LINES = 200;

export interface WatcherModel {
  settings: Settings;
  rows: TargetState[];
  catalog: CatalogPayload | null;
  catalogLoading: boolean;
  catalogError: string | null;
  health: HealthResponse | null;
  healthError: string | null;
  accessToken: string;
  authOpen: boolean;
  authChecking: boolean;
  authError: string | null;
  running: boolean;
  checking: boolean;
  trouble: string | null;
  logs: string[];
  nextCheckAt: number | null;
  setAuthOpen(open: boolean): void;
  submitAccessToken(token: string): Promise<boolean>;
  clearAccessToken(): void;
  updateSettings(patch: Partial<Settings>): void;
  addTarget(target: Target): void;
  removeTarget(key: string): void;
  setRunning(running: boolean): void;
  runCheck(): Promise<void>;
  testNotifications(): Promise<void>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误";
}

export function useWatcher(): WatcherModel {
  const [settings, setSettings] = useState(loadSettings);
  const [rows, setRows] = useState(loadTargetStates);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState(loadAccessToken);
  const [authOpen, setAuthOpen] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);

  const rowsRef = useRef(rows);
  const settingsRef = useRef(settings);
  const accessTokenRef = useRef(accessToken);
  const checkingRef = useRef(false);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const pushLog = useCallback((message: string) => {
    const time = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(Date.now());
    setLogs((current) => [...current, `[${time}] ${message}`].slice(-MAX_LOG_LINES));
  }, []);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError(null);
    loadCatalog(settings.locale)
      .then((payload) => {
        if (active) setCatalog(payload);
      })
      .catch((error: unknown) => {
        if (active) setCatalogError(describeError(error));
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [settings.locale]);

  useEffect(() => {
    fetchHealth()
      .then((payload) => {
        setHealth(payload);
        if (payload.authConfigured && !accessTokenRef.current) setAuthOpen(true);
      })
      .catch((error: unknown) => setHealthError(describeError(error)));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const addTarget = useCallback((target: Target) => {
    const key = targetKey(target);
    setRows((current) => {
      if (current.some((row) => targetKey(row.target) === key)) return current;
      const next = [
        ...current,
        {
          target,
          availability: { kind: "unknown", reason: "not_yet_checked" } as const,
          lastCheckedMs: null,
          consecutiveFailures: 0,
        },
      ];
      saveTargets(next.map((row) => row.target));
      return next;
    });
    pushLog(`已添加：${target.storeTitle} · ${target.productName}`);
  }, [pushLog]);

  const removeTarget = useCallback((key: string) => {
    setRows((current) => {
      const next = current.filter((row) => targetKey(row.target) !== key);
      saveTargets(next.map((row) => row.target));
      return next;
    });
  }, []);

  const notifyHits = useCallback(async (hits: TargetState[]) => {
    if (hits.length === 0) return;
    const currentSettings = settingsRef.current;
    if (currentSettings.browserNotifications) showStockNotification(hits);
    if (currentSettings.soundEnabled) void playAlertTone();
    if (currentSettings.openProductOnHit) {
      const opened = window.open(hits[0]!.target.productUrl, "_blank", "noopener,noreferrer");
      if (!opened) pushLog("浏览器拦截了自动打开，请从有货条目点击“前往 Apple”。");
    }
    if (currentSettings.barkEnabled && health?.barkConfigured) {
      const first = hits[0]!;
      const body = hits.length === 1
        ? `${first.target.storeTitle} · ${first.target.productName}`
        : `${first.target.storeTitle} 等 ${hits.length} 项确认有货`;
      try {
        await sendBark(
          { title: "Apple 到店取货有货了", body, url: first.target.productUrl },
          accessTokenRef.current,
        );
        pushLog("Bark 到货提醒已发出。");
      } catch (error) {
        pushLog(`Bark 到货提醒失败：${describeError(error)}`);
      }
    }
  }, [health?.barkConfigured, pushLog]);

  const runCheck = useCallback(async () => {
    if (checkingRef.current || rowsRef.current.length === 0) return;
    checkingRef.current = true;
    setChecking(true);
    setTrouble(null);
    try {
      const currentRows = rowsRef.current;
      const previousByKey = new Map(currentRows.map((row) => [targetKey(row.target), row]));
      const previousFailures = Object.fromEntries(
        currentRows.map((row) => [targetKey(row.target), row.consecutiveFailures]),
      );
      const response = await checkTargets(
        currentRows.map((row) => row.target),
        previousFailures,
        accessTokenRef.current,
      );
      const hits = response.rows.filter((row) => {
        const previous = previousByKey.get(targetKey(row.target));
        return row.availability.kind === "in_stock" && previous?.availability.kind !== "in_stock";
      });
      rowsRef.current = response.rows;
      setRows(response.rows);
      const failures = response.rows.filter((row) => isUntrusted(row.availability));
      if (failures.length > 0) {
        setTrouble(availabilityDetail(failures[0]!.availability));
        pushLog(`本轮有 ${failures.length} 项状态未知，不能当作无货。`);
      } else {
        pushLog(`查询完成：${response.rows.length} 项，${response.requestCount} 次 Apple 请求。`);
      }
      for (const row of hits) pushLog(`有货：${row.target.storeTitle} · ${row.target.productName}`);
      await notifyHits(hits);
    } catch (error) {
      const message = describeError(error);
      setTrouble(message);
      pushLog(`查询失败：${message}`);
      if (error instanceof ApiError && error.status === 401) setAuthOpen(true);
    } finally {
      checkingRef.current = false;
      setChecking(false);
      if (running) setNextCheckAt(Date.now() + settingsRef.current.intervalSeconds * 1000);
    }
  }, [notifyHits, pushLog, running]);

  useEffect(() => {
    if (!running) {
      setNextCheckAt(null);
      return;
    }
    void runCheck();
    const timer = window.setInterval(() => void runCheck(), settings.intervalSeconds * 1000);
    setNextCheckAt(Date.now() + settings.intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [runCheck, running, settings.intervalSeconds]);

  const submitAccessToken = useCallback(async (token: string) => {
    setAuthChecking(true);
    setAuthError(null);
    try {
      await verifyAccessToken(token.trim());
      saveAccessToken(token.trim());
      setAccessToken(token.trim());
      setAuthOpen(false);
      pushLog("访问口令验证成功。");
      return true;
    } catch (error) {
      setAuthError(describeError(error));
      return false;
    } finally {
      setAuthChecking(false);
    }
  }, [pushLog]);

  const clearAccessToken = useCallback(() => {
    saveAccessToken("");
    setAccessToken("");
    setAuthOpen(true);
    setRunning(false);
  }, []);

  const testNotifications = useCallback(async () => {
    const current = settingsRef.current;
    if (current.browserNotifications) {
      const permission = await ensureNotificationPermission();
      if (permission === "granted") {
        new Notification("Apple Pickup Watcher", { body: "浏览器提醒工作正常。" });
        pushLog("浏览器测试提醒已发出。");
      } else {
        pushLog("浏览器通知未获授权，请检查站点权限。");
      }
    }
    if (current.soundEnabled) await playAlertTone();
    if (current.barkEnabled) {
      if (!health?.barkConfigured) {
        pushLog("服务端尚未配置 BARK_URL。");
      } else {
        try {
          await sendBark(
            {
              title: "Apple Pickup Watcher",
              body: "Bark 测试提醒工作正常。",
              url: "https://www.apple.com.cn/shop/buy-iphone",
            },
            accessTokenRef.current,
          );
          pushLog("Bark 测试提醒已发出。");
        } catch (error) {
          pushLog(`Bark 测试提醒失败：${describeError(error)}`);
        }
      }
    }
  }, [health?.barkConfigured, pushLog]);

  return useMemo(() => ({
    settings,
    rows,
    catalog,
    catalogLoading,
    catalogError,
    health,
    healthError,
    accessToken,
    authOpen,
    authChecking,
    authError,
    running,
    checking,
    trouble,
    logs,
    nextCheckAt,
    setAuthOpen,
    submitAccessToken,
    clearAccessToken,
    updateSettings,
    addTarget,
    removeTarget,
    setRunning,
    runCheck,
    testNotifications,
  }), [
    accessToken, authChecking, authError, authOpen, catalog, catalogError, catalogLoading,
    checking, clearAccessToken, health, healthError, logs, nextCheckAt, removeTarget,
    rows, runCheck, running, settings, submitAccessToken, testNotifications, trouble,
    updateSettings, addTarget,
  ]);
}
