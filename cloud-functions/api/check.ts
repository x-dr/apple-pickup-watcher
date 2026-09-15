import { authorize } from "./_shared/auth";
import { checkAppleTargets } from "./_shared/apple";
import {
  errorResponse,
  json,
  readJsonBody,
  RequestError,
  type MakersContext,
} from "./_shared/context";
import { retryAfter } from "./_shared/rate-limit";
import { validateTargets } from "./_shared/targets";

export async function onRequestPost(context: MakersContext): Promise<Response> {
  const denied = authorize(context);
  if (denied) return denied;

  const seconds = retryAfter(`check:${context.clientIp ?? "unknown"}`, 25_000);
  if (seconds > 0) {
    return json(
      { error: "too_many_requests", message: `查询过于频繁，请 ${seconds} 秒后重试` },
      429,
      { "retry-after": String(seconds) },
    );
  }

  try {
    const body = await readJsonBody(context.request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new RequestError(400, "invalid_request", "请求格式不正确");
    }
    const input = body as Record<string, unknown>;
    const targets = validateTargets(input.targets);
    const previousFailures =
      typeof input.previousFailures === "object" && input.previousFailures !== null
        ? (input.previousFailures as Record<string, number>)
        : {};
    return json(await checkAppleTargets(targets, previousFailures, fetch, context.request.signal));
  } catch (error) {
    return errorResponse(error);
  }
}
