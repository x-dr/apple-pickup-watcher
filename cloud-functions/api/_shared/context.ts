export interface MakersContext {
  request: Request;
  env: Record<string, string | undefined>;
  clientIp?: string;
  uuid?: string;
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export async function readJsonBody(request: Request, limit = 48 * 1024): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new RequestError(413, "payload_too_large", "请求内容过大");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) {
    throw new RequestError(413, "payload_too_large", "请求内容过大");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestError(400, "invalid_json", "请求不是有效的 JSON");
  }
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof RequestError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  return json({ error: "internal_error", message: "服务暂时不可用，请稍后重试" }, 500);
}
