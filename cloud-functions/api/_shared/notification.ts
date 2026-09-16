import { readResponseText, withResponse } from "./http";
import { RequestError } from "./context";

export type NotificationProvider = "bark" | "notifyhub";

export interface NotificationInput {
  title: string;
  body: string;
  url: URL;
  eventId: string;
  occurredAt: string;
}

export function notificationProvider(env: Record<string, string | undefined>): NotificationProvider | null {
  const barkConfigured = Boolean(env.BARK_URL?.trim());
  const notifyhubConfigured = Boolean(env.NOTIFYHUB_WEBHOOK_URL?.trim() && env.NOTIFYHUB_TOKEN?.trim());
  const notifyhubPartial = Boolean(env.NOTIFYHUB_WEBHOOK_URL?.trim()) !== Boolean(env.NOTIFYHUB_TOKEN?.trim());
  if (notifyhubPartial || barkConfigured === notifyhubConfigured) return null;
  return barkConfigured ? "bark" : "notifyhub";
}

export function configuredNotificationProvider(env: Record<string, string | undefined>): NotificationProvider {
  const provider = notificationProvider(env);
  if (provider) return provider;
  const barkConfigured = Boolean(env.BARK_URL?.trim());
  const notifyhubUrlConfigured = Boolean(env.NOTIFYHUB_WEBHOOK_URL?.trim());
  const notifyhubTokenConfigured = Boolean(env.NOTIFYHUB_TOKEN?.trim());
  if (barkConfigured && notifyhubUrlConfigured && notifyhubTokenConfigured) {
    throw new RequestError(503, "multiple_notification_providers", "Bark 与 NotifyHub 只能配置一个");
  }
  if (notifyhubUrlConfigured !== notifyhubTokenConfigured) {
    throw new RequestError(503, "invalid_notifyhub_config", "NotifyHub Webhook 地址与 Token 必须同时配置");
  }
  throw new RequestError(409, "notification_not_configured", "服务端尚未配置通知渠道");
}

function configuredUrl(value: string | undefined, provider: "Bark" | "NotifyHub"): URL {
  const raw = value?.trim() ?? "";
  if (!raw) throw new RequestError(409, `${provider.toLowerCase()}_not_configured`, `服务端未配置 ${provider}`);
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))) {
      throw new Error("invalid URL");
    }
    return url;
  } catch {
    throw new RequestError(503, `invalid_${provider.toLowerCase()}_config`, `${provider} 地址配置无效`);
  }
}

async function responseJson(response: Response, signal: AbortSignal, provider: NotificationProvider): Promise<Record<string, unknown>> {
  const label = provider === "bark" ? "Bark" : "NotifyHub";
  const code = provider === "bark" ? "bark_failed" : "notifyhub_failed";
  const raw = await readResponseText(response, 16 * 1024, signal);
  try {
    const result: unknown = JSON.parse(raw);
    if (result && typeof result === "object" && !Array.isArray(result)) return result as Record<string, unknown>;
  } catch { /* handled below */ }
  throw new RequestError(502, code, `${label} 未返回有效的推送确认`);
}

async function sendBark(env: Record<string, string | undefined>, input: NotificationInput, signal: AbortSignal): Promise<void> {
  const url = configuredUrl(env.BARK_URL, "Bark");
  await withResponse(url, {
    method: "POST",
    redirect: "error",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      url: input.url.toString(),
      group: "apple-pickup-watcher",
      level: "timeSensitive",
    }),
  }, 10_000, async (response, responseSignal) => {
    if (!response.ok) throw new RequestError(502, "bark_failed", `Bark 返回 HTTP ${response.status}`);
    const result = await responseJson(response, responseSignal, "bark");
    if (result.code !== 200) throw new RequestError(502, "bark_failed", "Bark 未确认推送成功");
  });
}

function notifyhubConfig(env: Record<string, string | undefined>): { url: URL; token: string } {
  const url = configuredUrl(env.NOTIFYHUB_WEBHOOK_URL, "NotifyHub");
  if (!/^\/api\/v1\/hooks\/[0-9A-HJKMNP-TV-Z]{26}\/?$/.test(url.pathname)) {
    throw new RequestError(503, "invalid_notifyhub_config", "NotifyHub Webhook 地址格式无效");
  }
  const token = env.NOTIFYHUB_TOKEN?.trim() ?? "";
  if (!/^[\x21-\x7e]{1,500}$/.test(token)) {
    throw new RequestError(token ? 503 : 409, token ? "invalid_notifyhub_config" : "notifyhub_not_configured",
      token ? "NotifyHub Token 配置无效" : "服务端未配置 NotifyHub");
  }
  return { url, token };
}

async function sendNotifyHub(env: Record<string, string | undefined>, input: NotificationInput, signal: AbortSignal): Promise<void> {
  const { url, token } = notifyhubConfig(env);
  await withResponse(url, {
    method: "POST",
    redirect: "error",
    signal,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
      "x-notifyhub-event-id": input.eventId,
    },
    body: JSON.stringify({
      title: input.title,
      content: input.body,
      level: "warning",
      url: input.url.toString(),
      tags: ["apple", "pickup-watcher"],
      occurredAt: input.occurredAt,
      metadata: { source: "apple-pickup-watcher" },
    }),
  }, 15_000, async (response, responseSignal) => {
    if (response.status !== 202) {
      throw new RequestError(502, "notifyhub_failed", `NotifyHub 返回 HTTP ${response.status}`);
    }
    const result = await responseJson(response, responseSignal, "notifyhub");
    const data = result.data;
    if (result.code !== 0 || !data || typeof data !== "object" || Array.isArray(data) ||
      typeof (data as Record<string, unknown>).eventId !== "string" || !(data as Record<string, unknown>).eventId) {
      throw new RequestError(502, "notifyhub_failed", "NotifyHub 未确认接受事件");
    }
  });
}

export async function sendNotification(
  env: Record<string, string | undefined>,
  input: NotificationInput,
  signal: AbortSignal,
): Promise<NotificationProvider> {
  const provider = configuredNotificationProvider(env);
  if (provider === "bark") await sendBark(env, input, signal);
  else await sendNotifyHub(env, input, signal);
  return provider;
}
