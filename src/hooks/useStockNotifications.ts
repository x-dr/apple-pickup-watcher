import { useCallback, useRef, type RefObject } from "react";
import { targetKey, type HealthResponse, type NotificationProvider, type Settings, type Target, type TargetState } from "@/domain/types";
import { sendNotification } from "@/services/api";
import { ensureNotificationPermission, playAlertTone, prepareAudio, showStockNotification } from "@/services/notifications";

type Channel = "browser" | "sound" | "link" | NotificationProvider;
interface Context { settings: Settings; health: HealthResponse | null; accessToken: string }
interface PendingServerNotification {
  fingerprint: string;
  targetKeys: string[];
  eventId: string;
  occurredAt: string;
}

export function useStockNotifications(context: RefObject<Context>, pushLog: (text: string) => void) {
  const ledger = useRef(new Map<Target, Set<Channel>>());
  const pendingServerNotification = useRef<PendingServerNotification | null>(null);
  const forget = useCallback((key: string) => {
    for (const target of ledger.current.keys()) if (targetKey(target) === key) ledger.current.delete(target);
  }, []);

  const prepare = useCallback(() => {
    if (context.current.settings.browserNotifications) {
      void ensureNotificationPermission().then((permission) => {
        if (permission !== "granted") pushLog("浏览器通知未获授权，请检查站点权限。");
      }).catch(() => pushLog("无法获取浏览器通知权限。"));
    }
    if (context.current.settings.soundEnabled) void prepareAudio().catch(() => pushLog("提示音未能启用，请点击测试提醒重试。"));
  }, [context, pushLog]);

  const notify = useCallback(async (rows: TargetState[], signal: AbortSignal) => {
    const currentTargets = new Set(rows.map((row) => row.target));
    const currentTargetKeys = new Set(rows.map((row) => targetKey(row.target)));
    for (const target of ledger.current.keys()) if (!currentTargets.has(target)) ledger.current.delete(target);
    if (pendingServerNotification.current?.targetKeys.some((key) => !currentTargetKeys.has(key))) {
      pendingServerNotification.current = null;
    }
    for (const row of rows) {
      if (row.availability.kind === "out_of_stock") {
        ledger.current.delete(row.target);
        if (pendingServerNotification.current?.targetKeys.includes(targetKey(row.target))) {
          pendingServerNotification.current = null;
        }
      }
      if (row.availability.kind === "in_stock" && !ledger.current.has(row.target)) {
        ledger.current.set(row.target, new Set());
        pushLog(`有货：${row.target.storeTitle} · ${row.target.productName}`);
      }
    }
    const attempt = async (channel: Channel, enabled: boolean, send: (hits: TargetState[]) => Promise<boolean> | boolean) => {
      if (!enabled || signal.aborted) return;
      const hits = rows.filter((row) => row.availability.kind === "in_stock" && ledger.current.has(row.target) && !ledger.current.get(row.target)!.has(channel));
      if (!hits.length) return;
      try {
        if (await send(hits)) for (const hit of hits) ledger.current.get(hit.target)?.add(channel);
      } catch (error) {
        const label = channel === "bark" ? "Bark 到货提醒" : channel === "notifyhub" ? "NotifyHub 到货提醒" : "本地提醒";
        if (!signal.aborted) pushLog(`${label}失败：${error instanceof Error ? error.message : "发送失败"}`);
      }
    };
    const { settings, health, accessToken } = context.current;
    // Channel failures are isolated; retries only include unsent targets.
    await attempt("browser", settings.browserNotifications, showStockNotification);
    await attempt("sound", settings.soundEnabled, () => playAlertTone());
    await attempt("link", settings.openProductOnHit, (hits) => {
      window.open(hits[0]!.target.productUrl, "_blank", "noopener,noreferrer");
      // A noopener window can return null even when opened. Attempt only once.
      pushLog("已尝试打开 Apple 页面；若被拦截，请点击条目中的 Apple 链接。");
      return true;
    });
    const provider = health?.notificationProvider;
    if (provider) await attempt(provider, settings.notificationEnabled, async (hits) => {
      const first = hits[0]!;
      const title = "Apple 到店取货有货了";
      const body = hits.length === 1 ? `${first.target.storeTitle} · ${first.target.productName}` : `${first.target.storeTitle} 等 ${hits.length} 项确认有货`;
      const targetKeys = hits.map((hit) => targetKey(hit.target)).sort();
      const fingerprint = JSON.stringify([provider, title, body, first.target.productUrl, targetKeys]);
      let pending = pendingServerNotification.current;
      if (!pending || pending.fingerprint !== fingerprint) {
        pending = {
          fingerprint,
          targetKeys,
          eventId: `apple-pickup-${crypto.randomUUID().replaceAll("-", "")}`,
          occurredAt: new Date().toISOString(),
        };
        pendingServerNotification.current = pending;
      }
      await sendNotification({ title, body, url: first.target.productUrl,
        eventId: pending.eventId, occurredAt: pending.occurredAt }, accessToken, signal);
      if (pendingServerNotification.current === pending) pendingServerNotification.current = null;
      pushLog(`${provider === "bark" ? "Bark" : "NotifyHub"} 到货提醒已发出。`);
      return true;
    });
  }, [context, pushLog]);

  const testNotifications = useCallback(async () => {
    const { settings, health, accessToken } = context.current;
    // Unlock audio during the original click, before awaiting permission.
    const audioReady = settings.soundEnabled ? prepareAudio().catch(() => false) : Promise.resolve(false);
    if (settings.browserNotifications) {
      try {
        if (await ensureNotificationPermission() === "granted") {
          new Notification("Apple Pickup Watcher", { body: "浏览器提醒工作正常。" });
          pushLog("浏览器测试提醒已发出。");
        } else pushLog("浏览器通知未获授权，请检查站点权限。");
      } catch { pushLog("浏览器测试提醒失败。"); }
    }
    if (await audioReady) await playAlertTone().catch(() => false);
    if (settings.notificationEnabled) {
      const provider = health?.notificationProvider;
      const configured = Boolean(provider);
      const name = provider === "bark" ? "Bark" : "NotifyHub";
      if (!configured) pushLog("服务端通知未配置，或 Bark / NotifyHub 配置冲突。");
      else {
        try {
          await sendNotification({ title: "Apple Pickup Watcher", body: `${name} 测试提醒工作正常。`, url: "https://www.apple.com.cn/shop/buy-iphone" }, accessToken);
          pushLog(`${name} 测试提醒已发出。`);
        } catch (error) { pushLog(`${name} 测试提醒失败：${error instanceof Error ? error.message : "发送失败"}`); }
      }
    }
  }, [context, pushLog]);
  return { notify, forget, prepare, testNotifications };
}
