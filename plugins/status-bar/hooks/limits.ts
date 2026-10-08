import type { SessionRateLimit } from 'claude-code'

export type SharedLimit = SessionRateLimit & { seenAt: number }

const resetMs = (r: SessionRateLimit) => (r.resetsAt === undefined ? -Infinity : Date.parse(r.resetsAt))

export const parseLimits = (raw: unknown): SharedLimit[] =>
  Array.isArray(raw)
    ? raw
        .filter(
          (r): r is SessionRateLimit & { seenAt?: unknown } =>
            typeof r === 'object' &&
            r !== null &&
            typeof r.kind === 'string' &&
            typeof r.percentUsed === 'number' &&
            (r.resetsAt === undefined || typeof r.resetsAt === 'string'),
        )
        .map(r => ({ ...r, seenAt: typeof r.seenAt === 'number' ? r.seenAt : 0 }))
    : []

const same = (a: SessionRateLimit, b: SessionRateLimit) =>
  a.kind === b.kind && a.percentUsed === b.percentUsed && a.resetsAt === b.resetsAt

export const unpublished = (local: readonly SessionRateLimit[], published: readonly SessionRateLimit[]) =>
  local.filter(r => !published.some(p => same(p, r)))

export const publish = (shared: readonly SharedLimit[], fresh: readonly SessionRateLimit[], now: number): SharedLimit[] => {
  const byKind = new Map(shared.map(r => [r.kind, r]))
  for (const { kind, percentUsed, resetsAt } of fresh) {
    byKind.set(kind, { kind, percentUsed, resetsAt, seenAt: now })
  }
  return [...byKind.values()].sort((a, b) => a.kind.localeCompare(b.kind))
}

export const current = (limits: readonly SessionRateLimit[], now: number): SessionRateLimit[] =>
  limits.map(r => (resetMs(r) <= now ? { ...r, percentUsed: 0 } : r))
