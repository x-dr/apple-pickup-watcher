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
import { validateGroups, validateTargets, type LegacyTarget } from "./_shared/targets";

type AppleCheckResult = Awaited<ReturnType<typeof checkAppleTargets>>;
type ResultAvailability = AppleCheckResult["rows"][number]["availability"];
interface ResultGroup {
  locale: string;
  storeNumber: string;
  items: Array<{ partNumber: string; availability: ResultAvailability }>;
}

function keyOf(target: { locale: string; storeNumber: string; partNumber: string }): string {
  return `${target.locale}|${target.storeNumber}|${target.partNumber}`;
}

function v1Response(
  result: AppleCheckResult,
  targets: LegacyTarget[],
  previousFailures: Record<string, number>,
) {
  const metadata = new Map(targets.map((target) => [keyOf(target), target]));
  return {
    ...result,
    rows: result.rows.map((row) => {
      const target = metadata.get(keyOf(row))!;
      const previous = previousFailures[keyOf(row)];
      const previousCount = typeof previous === "number" && Number.isFinite(previous) ? previous : 0;
      return {
        target,
        availability: row.availability,
        lastCheckedMs: result.checkedAt,
        consecutiveFailures: row.availability.kind === "unknown"
          ? Math.min(10_000, Math.max(0, previousCount)) + 1
          : 0,
      };
    }),
  };
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
    if (Object.hasOwn(input, "version")) {
      if (input.version !== 2) {
        throw new RequestError(400, "unsupported_version", "不支持的库存查询协议版本");
      }
      const targets = validateGroups(input.groups);
      return json(v2Response(await checkAppleTargets(targets, fetch, context.request.signal)));
    }
    const targets = validateTargets(input.targets);
    const previousFailures =
      typeof input.previousFailures === "object" && input.previousFailures !== null
        ? (input.previousFailures as Record<string, number>)
        : {};
    return json(v1Response(
      await checkAppleTargets(targets, fetch, context.request.signal),
      targets,
      previousFailures,
    ));
  } catch (error) {
    return errorResponse(error);
  }
}
