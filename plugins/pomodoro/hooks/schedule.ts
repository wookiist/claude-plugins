import type { Kind, Plan, Seen, Status } from '../types'

export const MIN = 60000

export const DEFAULT = { focusMin: 25, breakMin: 5 }

export const LABEL: Record<Kind, string> = { focus: '집중', break: '휴식' }

export type Action =
  | { kind: 'start'; focusMin: number; breakMin: number }
  | { kind: 'stop' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'skip' }

export const minutes = (raw: unknown, fallback: number) => {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const parsePlan = (raw: unknown): Plan | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const r = raw as Record<string, unknown>
  const num = (k: string) => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : null)
  const [startedAt, focusMin, breakMin, pausedMs, skippedMs] = ['startedAt', 'focusMin', 'breakMin', 'pausedMs', 'skippedMs'].map(num)
  if (startedAt == null || focusMin == null || breakMin == null || pausedMs == null || skippedMs == null || focusMin <= 0 || breakMin <= 0) {
    return null
  }
  return { startedAt, focusMin, breakMin, pausedAt: num('pausedAt'), pausedMs, skippedMs }
}

const cycle = (p: Plan) =>
  [1, 2, 3, 4].flatMap(round => [
    { kind: 'focus' as const, round, ms: p.focusMin * MIN },
    { kind: 'break' as const, round, ms: (round === 4 ? 3 : 1) * p.breakMin * MIN },
  ])

export const status = (p: Plan, now: number): Status => {
  const phases = cycle(p)
  const lapMs = phases.reduce((sum, ph) => sum + ph.ms, 0)
  const elapsed = Math.max(0, (p.pausedAt ?? now) - p.startedAt - p.pausedMs + p.skippedMs)
  const lap = Math.floor(elapsed / lapMs)
  let rest = elapsed - lap * lapMs
  let i = 0
  while (i < phases.length - 1 && rest >= phases[i]!.ms) {
    rest -= phases[i]!.ms
    i += 1
  }
  const ph = phases[i]!
  return { kind: ph.kind, round: lap * 4 + ph.round, seq: lap * phases.length + i, leftMs: Math.max(0, ph.ms - rest), isPaused: p.pausedAt !== null }
}

export const apply = (p: Plan | null, a: Action, now: number): Plan | null => {
  switch (a.kind) {
    case 'start':
      return { startedAt: now, focusMin: a.focusMin, breakMin: a.breakMin, pausedAt: null, pausedMs: 0, skippedMs: 0 }
    case 'stop':
      return null
    case 'pause':
      return p && p.pausedAt === null ? { ...p, pausedAt: now } : p
    case 'resume':
      return p && p.pausedAt !== null ? { ...p, pausedAt: null, pausedMs: p.pausedMs + now - p.pausedAt } : p
    case 'skip':
      return p && { ...p, skippedMs: p.skippedMs + status(p, now).leftMs }
  }
}

export const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const describe = (s: Status | null) =>
  s === null ? '타이머 꺼짐' : `${LABEL[s.kind]} ${s.round}회차 ${clock(s.leftMs)} 남음${s.isPaused ? ' (일시정지)' : ''}`

export const toastFor = (prev: Seen | null, p: Plan, s: Status) =>
  prev === null || prev.startedAt !== p.startedAt || s.seq <= prev.seq
    ? undefined
    : s.kind === 'break'
      ? `집중 ${s.round}회 완료. 쉬어요.`
      : '휴식 끝. 다시 집중할 시간이에요.'

export const parseCommand = (args: string): Action => {
  const words = args.trim().split(/\s+/).filter(Boolean)
  if (words[0] === 'stop' || words[0] === '중지') {
    return { kind: 'stop' }
  }
  return { kind: 'start', focusMin: minutes(words[0], DEFAULT.focusMin), breakMin: minutes(words[1], DEFAULT.breakMin) }
}

export const parseToolInput = (input: Record<string, unknown>): Action | null => {
  switch (input.action) {
    case 'start':
      return { kind: 'start', focusMin: minutes(input.focusMin, DEFAULT.focusMin), breakMin: minutes(input.breakMin, DEFAULT.breakMin) }
    case 'stop':
    case 'pause':
    case 'resume':
      return { kind: input.action }
    default:
      return null
  }
}
