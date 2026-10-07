import type { SessionUsage } from 'claude-code'

import type { Place, Segment, Tally } from '../types'

export const EMPTY: Tally = { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export const prettyModel = (id: string) => {
  const [family = id, ...version] = id
    .replace(/^claude-/, '')
    .replace(/\[.*\]$/, '')
    .replace(/-\d{8}$/, '')
    .split('-')
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return version.length ? `${name} ${version.join('.')}` : name
}

const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`

const used = (n: number | undefined): Segment =>
  n === undefined
    ? { text: '-', color: 'subtle' }
    : { text: `${Math.round(n)}%`, color: n >= 80 ? 'error' : n >= 50 ? 'warning' : 'success' }

const hit = (n: number | undefined): Segment =>
  n === undefined
    ? { text: '-', color: 'subtle' }
    : { text: `${Math.round(n)}%`, color: n >= 80 ? 'success' : n >= 50 ? 'warning' : 'error' }

const punct = (text: string): Segment => ({ text, color: 'subtle' })

const label = (text: string): Segment => ({ text, color: 'text' })

const SEP = punct(' / ')

export const format = (
  model: string,
  usage: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>,
  t: Tally,
  place: Place | null,
): Segment[] => {
  const limit = (kind: string) => usage.rateLimits.find(r => r.kind === kind)?.percentUsed
  const read = t.input + t.cacheRead + t.cacheWrite

  return [
    punct('['),
    { text: prettyModel(model), color: 'claude', bold: true },
    ...(t.effort ? [punct(' ('), { text: t.effort, color: 'suggestion' } as const, punct(')')] : []),
    punct('] '),
    label('ctx '),
    used(usage.context.percent),
    SEP,
    label('5h '),
    used(limit('five_hour')),
    SEP,
    label('7d '),
    used(limit('seven_day')),
    SEP,
    label('turn '),
    { text: `${t.turns}`, color: 'ide' },
    SEP,
    { text: tokens(t.cacheRead), color: 'remember' },
    punct('/'),
    { text: tokens(t.cacheWrite), color: 'merged' },
    SEP,
    label('cache '),
    hit(read === 0 ? undefined : (t.cacheRead / read) * 100),
    SEP,
    label('cost '),
    usage.cost === undefined ? { text: '-', color: 'subtle' } : { text: `$${usage.cost.usd.toFixed(2)}`, color: 'warning' },
    ...(place ? [SEP, label(place.dir)] : []),
    ...(place?.head ? [punct(' ('), { text: place.head, color: 'success' } as const, punct(')')] : []),
  ]
}
