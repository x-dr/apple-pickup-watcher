const lastRequests = new Map<string, number>();

export function retryAfter(key: string, minimumIntervalMs: number, now = Date.now()): number {
  const previous = lastRequests.get(key) ?? 0;
  const waitMs = previous + minimumIntervalMs - now;
  if (waitMs > 0) return Math.ceil(waitMs / 1000);
  lastRequests.set(key, now);

  if (lastRequests.size > 2_000) {
    const cutoff = now - 60 * 60 * 1000;
    for (const [entryKey, timestamp] of lastRequests) {
      if (timestamp < cutoff) lastRequests.delete(entryKey);
    }
  }
  return 0;
}
