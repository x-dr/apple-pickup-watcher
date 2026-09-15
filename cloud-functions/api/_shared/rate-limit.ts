// Best-effort protection within one warm instance, not a distributed rate limit.
const nextAllowedAt = new Map<string, number>();

export function retryAfter(key: string, minimumIntervalMs: number, now = Date.now()): number {
  const waitMs = (nextAllowedAt.get(key) ?? 0) - now;
  if (waitMs > 0) return Math.ceil(waitMs / 1000);
  if (nextAllowedAt.size >= 2_000) {
    for (const [entryKey, timestamp] of nextAllowedAt) {
      if (timestamp <= now) nextAllowedAt.delete(entryKey);
    }
    if (nextAllowedAt.size >= 2_000) return Math.max(1, Math.ceil((Math.min(...nextAllowedAt.values()) - now) / 1000));
  }
  nextAllowedAt.set(key, now + minimumIntervalMs);
  return 0;
}
