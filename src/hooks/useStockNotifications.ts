import { useCallback, useRef, type RefObject } from "react";
import { targetKey, type HealthResponse, type Settings, type Target, type TargetState } from "@/domain/types";
import { sendBark } from "@/services/api";
import { ensureNotificationPermission, playAlertTone, prepareAudio, showStockNotification } from "@/services/notifications";

type Channel = "browser" | "sound" | "link" | "bark";
interface Context { settings: Settings; health: HealthResponse | null; accessToken: string }

export function useStockNotifications(context: RefObject<Context>, pushLog: (text: string) => void) {
  const ledger = useRef(new Map<Target, Set<Channel>>());
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
    for (const target of ledger.current.keys()) if (!currentTargets.has(target)) ledger.current.delete(target);
    for (const row of rows) {
      if (row.availability.kind === "out_of_stock") ledger.current.delete(row.target);
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
        if (!signal.aborted) pushLog(`${channel === "bark" ? "Bark 到货提醒" : "本地提醒"}失败：${error instanceof Error ? error.message : "发送失败"}`);
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
    await attempt("bark", settings.barkEnabled && Boolean(health?.barkConfigured), async (hits) => {
      const first = hits[0]!;
      await sendBark({ title: "Apple 到店取货有货了",
        body: hits.length === 1 ? `${first.target.storeTitle} · ${first.target.productName}` : `${first.target.storeTitle} 等 ${hits.length} 项确认有货`,
        url: first.target.productUrl }, accessToken, signal);
      pushLog("Bark 到货提醒已发出。");
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
    if (settings.barkEnabled) {
      if (!health?.barkConfigured) pushLog("服务端尚未配置 BARK_URL。");
      else {
        try {
          await sendBark({ title: "Apple Pickup Watcher", body: "Bark 测试提醒工作正常。", url: "https://www.apple.com.cn/shop/buy-iphone" }, accessToken);
          pushLog("Bark 测试提醒已发出。");
        } catch (error) { pushLog(`Bark 测试提醒失败：${error instanceof Error ? error.message : "发送失败"}`); }
      }
    }
  }, [context, pushLog]);
  return { notify, forget, prepare, testNotifications };
}
