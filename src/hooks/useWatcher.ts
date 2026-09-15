import { useCallback, useEffect, useRef, useState } from "react";
import { availabilityDetail, isUntrusted, targetKey, type HealthResponse, type Settings, type Target, type TargetState } from "@/domain/types";
import { checkDelay, failedQueryRows, mergeQueryRows } from "@/domain/watch-state";
import { ApiError, checkTargets, fetchHealth, verifyAccessToken } from "@/services/api";
import { loadAccessToken, loadSettings, loadTargetStates, normalizeSettings, saveAccessToken, saveSettings, saveTargets } from "@/services/storage";
import { useCatalog } from "./useCatalog";
import { useStockNotifications } from "./useStockNotifications";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误";
}

export function useWatcher() {
  const [settings, setSettings] = useState(loadSettings);
  const [rows, setRows] = useState(loadTargetStates);
  const catalog = useCatalog(settings.locale);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthAttempt, setHealthAttempt] = useState(0);
  const [accessToken, setAccessToken] = useState(loadAccessToken);
  const [authOpen, setAuthOpen] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [running, setRunningState] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notificationTesting, setNotificationTesting] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);

  const rowsRef = useRef(rows);
  const contextRef = useRef({ settings, accessToken, health });
  contextRef.current = { settings, accessToken, health };
  const runningRef = useRef(false);
  const mounted = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const notBefore = useRef(0);
  const runCheckRef = useRef<() => Promise<void>>(async () => {});
  const testingRef = useRef(false);
  const authCheckingRef = useRef(false);

  const pushLog = useCallback((message: string) => {
    if (!mounted.current) return;
    const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(Date.now());
    setLogs((current) => [...current, `[${time}] ${message}`].slice(-200));
  }, []);
  const { notify, forget, prepare, testNotifications: testChannels } = useStockNotifications(contextRef, pushLog);
  const replaceRows = useCallback((next: TargetState[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);
  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const schedule = useCallback((delayMs: number) => {
    clearTimer();
    if (!runningRef.current || !mounted.current) return;
    const delay = Math.max(delayMs, notBefore.current - Date.now(), 0);
    setNextCheckAt(Date.now() + delay);
    timer.current = setTimeout(() => { timer.current = null; void runCheckRef.current(); }, delay);
  }, [clearTimer]);
  const cancelCheck = useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    clearTimer();
    setChecking(false);
    setNextCheckAt(null);
  }, [clearTimer]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runningRef.current = false;
      activeRequest.current?.abort();
      activeRequest.current = null;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    const controller = new AbortController();
    setHealthError(null);
    fetchHealth(controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setHealth(value);
      if (value.authConfigured && !contextRef.current.accessToken) setAuthOpen(true);
    }).catch((error: unknown) => { if (!controller.signal.aborted) setHealthError(describeError(error)); });
    return () => controller.abort();
  }, [healthAttempt]);
  const retryHealth = useCallback(() => setHealthAttempt((value) => value + 1), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = normalizeSettings({ ...contextRef.current.settings, ...patch });
    contextRef.current.settings = next;
    setSettings(next);
    if (!saveSettings(next)) pushLog("浏览器无法保存设置，本次修改仅在当前页面有效。");
    if (patch.browserNotifications === true || patch.soundEnabled === true) prepare();
  }, [prepare, pushLog]);

  const setRunning = useCallback((value: boolean) => {
    if (value && rowsRef.current.length === 0) return;
    runningRef.current = value;
    setRunningState(value);
    if (value) { prepare(); void runCheckRef.current(); }
    else cancelCheck();
  }, [cancelCheck, prepare]);

  const addTarget = useCallback((target: Target) => {
    const current = rowsRef.current;
    const key = targetKey(target);
    const groups = new Set(current.map((row) => `${row.target.locale}|${row.target.storeNumber}`));
    if (current.length >= 24 || current.some((row) => targetKey(row.target) === key) ||
      (groups.size >= 6 && !groups.has(`${target.locale}|${target.storeNumber}`))) return;
    const next = [...current, { target: { ...target }, availability: { kind: "unknown", reason: "not_yet_checked" } as const, lastCheckedMs: null, consecutiveFailures: 0 }];
    replaceRows(next);
    if (!saveTargets(next.map((row) => row.target))) pushLog("浏览器无法保存监控目标，刷新后本次修改可能丢失。");
    pushLog(`已添加：${target.storeTitle} · ${target.productName}`);
  }, [pushLog, replaceRows]);

  const removeTarget = useCallback((key: string) => {
    const next = rowsRef.current.filter((row) => targetKey(row.target) !== key);
    replaceRows(next);
    forget(key);
    if (!saveTargets(next.map((row) => row.target))) pushLog("浏览器无法保存监控目标，刷新后本次修改可能丢失。");
    if (next.length === 0) setRunning(false);
  }, [forget, pushLog, replaceRows, setRunning]);

  const runCheck = useCallback(async () => {
    if (activeRequest.current || rowsRef.current.length === 0 || !mounted.current) return;
    if (notBefore.current > Date.now()) {
      setTrouble(`查询冷却中，约 ${Math.ceil((notBefore.current - Date.now()) / 1000)} 秒后重试`);
      schedule(notBefore.current - Date.now());
      return;
    }
    clearTimer();
    setNextCheckAt(null);
    const controller = new AbortController();
    activeRequest.current = controller;
    setChecking(true);
    const snapshot = rowsRef.current;
    let retrySeconds = 0;
    try {
      const response = await checkTargets(snapshot.map((row) => row.target), Object.fromEntries(snapshot.map((row) => [targetKey(row.target), row.consecutiveFailures])), contextRef.current.accessToken, controller.signal);
      if (controller.signal.aborted || activeRequest.current !== controller || !mounted.current) return;
      const next = mergeQueryRows(rowsRef.current, snapshot, response.rows);
      replaceRows(next);
      const unknownRows = next.filter((row) => isUntrusted(row.availability));
      failures.current = unknownRows.length ? failures.current + 1 : 0;
      retrySeconds = response.retryAfterSeconds ?? 0;
      setTrouble(unknownRows.length ? availabilityDetail(unknownRows[0]!.availability) : null);
      pushLog(unknownRows.length ? `本轮有 ${unknownRows.length} 项状态未知，不能当作无货。` : `查询完成：${response.rows.length} 项，${response.requestCount} 次 Apple 请求。`);
      await notify(next, controller.signal);
    } catch (error) {
      if (controller.signal.aborted || activeRequest.current !== controller || !mounted.current) return;
      const message = describeError(error);
      failures.current += 1;
      retrySeconds = error instanceof ApiError ? error.retryAfterSeconds : 0;
      const availability = error instanceof ApiError && error.status === 429
        ? { kind: "unknown", reason: "rate_limited", detail: message } as const
        : { kind: "unknown", reason: "transport", detail: message } as const;
      replaceRows(mergeQueryRows(rowsRef.current, snapshot, failedQueryRows(snapshot, availability)));
      setTrouble(message);
      pushLog(`查询失败：${message}`);
      if (error instanceof ApiError && (error.status === 401 || error.code === "auth_not_configured")) {
        runningRef.current = false;
        setRunningState(false);
        if (error.status === 401) setAuthOpen(true);
      }
    } finally {
      if (activeRequest.current === controller && mounted.current) {
        activeRequest.current = null;
        setChecking(false);
        notBefore.current = Date.now() + retrySeconds * 1000;
        schedule(checkDelay(contextRef.current.settings.intervalSeconds, failures.current, retrySeconds));
      }
    }
  }, [clearTimer, notify, pushLog, replaceRows, schedule]);
  runCheckRef.current = runCheck;

  useEffect(() => {
    if (runningRef.current && !activeRequest.current) schedule(checkDelay(settings.intervalSeconds, failures.current));
  }, [schedule, settings.intervalSeconds]);

  const submitAccessToken = useCallback(async (token: string) => {
    if (authCheckingRef.current) return false;
    authCheckingRef.current = true;
    setAuthChecking(true); setAuthError(null);
    try {
      await verifyAccessToken(token.trim());
      if (!mounted.current) return false;
      if (!saveAccessToken(token.trim())) pushLog("浏览器无法保存访问口令，本次连接仅在当前页面有效。");
      contextRef.current.accessToken = token.trim();
      setAccessToken(token.trim()); setAuthOpen(false);
      pushLog("访问口令验证成功。");
      return true;
    } catch (error) {
      if (mounted.current) setAuthError(describeError(error));
      return false;
    } finally {
      authCheckingRef.current = false;
      if (mounted.current) setAuthChecking(false);
    }
  }, [pushLog]);
  const clearAccessToken = useCallback(() => {
    saveAccessToken("");
    contextRef.current.accessToken = "";
    setAccessToken(""); setAuthOpen(true); setRunning(false);
  }, [setRunning]);
  const testNotifications = useCallback(async () => {
    if (testingRef.current) return;
    testingRef.current = true; setNotificationTesting(true);
    try { await testChannels(); }
    finally { testingRef.current = false; if (mounted.current) setNotificationTesting(false); }
  }, [testChannels]);

  return {
    settings, rows, ...catalog, health, healthError, retryHealth, accessToken, authOpen, authChecking, authError,
    running, checking, notificationTesting, trouble, logs, nextCheckAt, setAuthOpen, submitAccessToken,
    clearAccessToken, updateSettings, addTarget, removeTarget, setRunning, runCheck, testNotifications,
  };
}

export type WatcherModel = ReturnType<typeof useWatcher>;
