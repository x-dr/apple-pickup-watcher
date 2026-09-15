/** Keep the deadline active until the response has been consumed or cancelled. */
export async function withResponse<T>(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response, signal: AbortSignal) => Promise<T>,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("请求超时", "TimeoutError")), timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  let response: Response | undefined;
  try {
    signal.throwIfAborted();
    response = await fetchImpl(input, { ...init, signal });
    return await consume(response, signal);
  } finally {
    clearTimeout(timeout);
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}

export async function readResponseText(response: Response, limit: number, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  if (!response.body) return "";
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("响应内容超过大小上限");
      chunks.push(value);
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(result);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number {
  if (!value?.trim()) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds : (Date.parse(value) - now) / 1000;
  return Number.isFinite(delay) ? Math.max(0, Math.min(3600, Math.ceil(delay))) : 0;
}
