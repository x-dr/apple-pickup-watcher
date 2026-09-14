import { authorize } from "./_shared/auth";
import {
  errorResponse,
  json,
  readJsonBody,
  RequestError,
  type MakersContext,
} from "./_shared/context";
import { retryAfter } from "./_shared/rate-limit";

function shortText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new RequestError(400, "invalid_notification", `${name} 不合法`);
  }
  return value.trim();
}

export async function onRequestPost(context: MakersContext): Promise<Response> {
  const denied = authorize(context);
  if (denied) return denied;
  const barkValue = context.env.BARK_URL?.trim() ?? "";
  if (!barkValue) {
    return json({ error: "bark_not_configured", message: "服务端未配置 BARK_URL" }, 409);
  }

  const seconds = retryAfter(`notify:${context.clientIp ?? "unknown"}`, 3_000);
  if (seconds > 0) {
    return json({ error: "too_many_requests", message: `提醒过于频繁，请 ${seconds} 秒后重试` }, 429);
  }

  try {
    const barkUrl = new URL(barkValue);
    if (barkUrl.protocol !== "https:" && barkUrl.hostname !== "localhost") {
      throw new RequestError(503, "invalid_bark_config", "BARK_URL 必须使用 HTTPS");
    }
    const body = await readJsonBody(context.request, 8 * 1024);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new RequestError(400, "invalid_notification", "提醒格式不正确");
    }
    const input = body as Record<string, unknown>;
    const title = shortText(input.title, "title", 80);
    const message = shortText(input.body, "body", 500);
    const targetUrl = shortText(input.url, "url", 300);
    const parsedTarget = new URL(targetUrl);
    const isAppleHost =
      parsedTarget.hostname === "apple.com" ||
      parsedTarget.hostname.endsWith(".apple.com") ||
      parsedTarget.hostname === "apple.com.cn" ||
      parsedTarget.hostname.endsWith(".apple.com.cn");
    if (parsedTarget.protocol !== "https:" || !isAppleHost) {
      throw new RequestError(400, "invalid_notification", "提醒链接必须是 Apple HTTPS 地址");
    }
    const response = await fetch(barkUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        body: message,
        url: parsedTarget.toString(),
        group: "apple-pickup-watcher",
        level: "timeSensitive",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new RequestError(502, "bark_failed", `Bark 返回 HTTP ${response.status}`);
    }
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
