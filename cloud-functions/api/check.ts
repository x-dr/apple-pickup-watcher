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
import { validateGroups } from "./_shared/targets";

type AppleCheckResult = Awaited<ReturnType<typeof checkAppleTargets>>;
type ResultAvailability = AppleCheckResult["rows"][number]["availability"];
interface ResultGroup {
  locale: string;
  storeNumber: string;
  items: Array<{ partNumber: string; availability: ResultAvailability }>;
}

function v2Response(result: AppleCheckResult) {
  const groups = new Map<string, ResultGroup>();
  for (const row of result.rows) {
    const key = `${row.locale}|${row.storeNumber}`;
    const group = groups.get(key) ?? { locale: row.locale, storeNumber: row.storeNumber, items: [] };
    group.items.push({ partNumber: row.partNumber, availability: row.availability });
    groups.set(key, group);
  }
  return {
    version: 2 as const,
    healthy: result.healthy,
    checkedAt: result.checkedAt,
    requestCount: result.requestCount,
    retryAfterSeconds: result.retryAfterSeconds,
    groups: [...groups.values()],
  };
}

export async function onRequestPost(context: MakersContext): Promise<Response> {
  const denied = authorize(context);
  if (denied) return denied;

  const seconds = retryAfter(`check:${context.clientIp ?? "unknown"}`, 5_000);
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
    if (input.version !== 2) {
      throw new RequestError(400, "unsupported_version", "库存查询接口仅支持 v2 协议");
    }
    const targets = validateGroups(input.groups);
    return json(v2Response(await checkAppleTargets(targets, fetch, context.request.signal)));
  } catch (error) {
    return errorResponse(error);
  }
}
