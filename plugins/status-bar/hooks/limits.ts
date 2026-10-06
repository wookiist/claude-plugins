import type { SessionRateLimit } from 'claude-code'

const resetMs = (r: SessionRateLimit) => (r.resetsAt === undefined ? -Infinity : Date.parse(r.resetsAt))

const newer = (a: SessionRateLimit, b: SessionRateLimit) =>
  resetMs(a) !== resetMs(b) ? (resetMs(a) > resetMs(b) ? a : b) : a.percentUsed >= b.percentUsed ? a : b

export const parseLimits = (raw: unknown): SessionRateLimit[] =>
  Array.isArray(raw)
    ? raw.filter(
        (r): r is SessionRateLimit =>
          typeof r === 'object' &&
          r !== null &&
          typeof r.kind === 'string' &&
          typeof r.percentUsed === 'number' &&
          (r.resetsAt === undefined || typeof r.resetsAt === 'string'),
      )
    : []

export const mergeLimits = (shared: readonly SessionRateLimit[], local: readonly SessionRateLimit[]): SessionRateLimit[] => {
  const byKind = new Map<string, SessionRateLimit>()
  for (const r of [...shared, ...local]) {
    const seen = byKind.get(r.kind)
    byKind.set(r.kind, seen === undefined ? r : newer(seen, r))
  }
  return [...byKind.values()].sort((a, b) => a.kind.localeCompare(b.kind))
}

export const current = (limits: readonly SessionRateLimit[], now: number): SessionRateLimit[] =>
  limits.map(r => (resetMs(r) <= now ? { ...r, percentUsed: 0 } : r))
