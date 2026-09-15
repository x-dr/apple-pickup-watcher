import { targetKey, type Availability, type TargetState } from "./types";

/** Target object identity also distinguishes a deleted and re-added target. */
export function mergeQueryRows(current: TargetState[], snapshot: TargetState[], incoming: TargetState[]): TargetState[] {
  const queried = new Map(snapshot.map((row) => [targetKey(row.target), row.target]));
  const results = new Map(incoming.map((row) => [targetKey(row.target), row]));
  return current.map((row) => {
    const key = targetKey(row.target);
    const result = results.get(key);
    if (queried.get(key) !== row.target || !result) return row;
    const lastConfirmed = result.availability.kind !== "unknown" && result.lastCheckedMs !== null
      ? { kind: result.availability.kind, checkedAt: result.lastCheckedMs }
      : row.lastConfirmed;
    return { ...result, target: row.target, lastConfirmed };
  });
}

export function failedQueryRows(snapshot: TargetState[], availability: Availability): TargetState[] {
  return snapshot.map((row) => ({ ...row, availability, lastCheckedMs: Date.now() }));
}

export function checkDelay(intervalSeconds: number, failures: number, retryAfterSeconds = 0): number {
  return Math.max(intervalSeconds, Math.min(900, intervalSeconds * 2 ** Math.min(5, Math.max(0, failures))), retryAfterSeconds) * 1000;
}
