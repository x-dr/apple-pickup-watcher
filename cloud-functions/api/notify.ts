import { authorize } from "./_shared/auth";
import {
  errorResponse,
  json,
  readJsonBody,
  RequestError,
  type MakersContext,
} from "./_shared/context";
import { retryAfter } from "./_shared/rate-limit";
import { sendNotification } from "./_shared/notification";

function shortText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new RequestError(400, "invalid_notification", `${name} 不合法`);
  }
  return value.trim();
}

function eventIdentity(input: Record<string, unknown>): { eventId: string; occurredAt: string } {
  const fallback = {
    eventId: `apple-pickup-${crypto.randomUUID().replaceAll("-", "")}`,
    occurredAt: new Date().toISOString(),
  };
  if (input.eventId === undefined && input.occurredAt === undefined) return fallback;
  if (typeof input.eventId !== "string" || !/^apple-pickup-[a-f0-9]{32}$/.test(input.eventId) ||
    typeof input.occurredAt !== "string" || input.occurredAt.length > 40 || !Number.isFinite(Date.parse(input.occurredAt))) {
    throw new RequestError(400, "invalid_notification", "提醒事件标识或时间不合法");
  }
  return { eventId: input.eventId, occurredAt: input.occurredAt };
}

export async function onRequestPost(context: MakersContext): Promise<Response> {
  const denied = authorize(context);
  if (denied) return denied;

  const seconds = retryAfter(`notify:${context.clientIp ?? "unknown"}`, 3_000);
  if (seconds > 0) {
    return json({ error: "too_many_requests", message: `提醒过于频繁，请 ${seconds} 秒后重试` }, 429, { "retry-after": String(seconds) });
  }

  try {
    const body = await readJsonBody(context.request, 8 * 1024);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new RequestError(400, "invalid_notification", "提醒格式不正确");
    }
    const input = body as Record<string, unknown>;
    const title = shortText(input.title, "title", 80);
    const message = shortText(input.body, "body", 500);
    const targetUrl = shortText(input.url, "url", 300);
    const identity = eventIdentity(input);
    const parsedTarget = new URL(targetUrl);
    const isAppleHost =
      parsedTarget.hostname === "apple.com" ||
      parsedTarget.hostname.endsWith(".apple.com") ||
      parsedTarget.hostname === "apple.com.cn" ||
      parsedTarget.hostname.endsWith(".apple.com.cn");
    if (parsedTarget.protocol !== "https:" || !isAppleHost) {
      throw new RequestError(400, "invalid_notification", "提醒链接必须是 Apple HTTPS 地址");
    }
    const provider = await sendNotification(context.env, {
      title, body: message, url: parsedTarget, ...identity,
    }, context.request.signal);
    return json({ ok: true, provider });
  } catch (error) {
    return errorResponse(error);
  }
}
