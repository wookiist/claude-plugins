import type { Phase, Timer, View } from '../types'

export type Durations = { work: number; break: number }

export const LABEL: Record<Phase, string> = { work: '집중', break: '휴식' }

export const start = (phase: Phase, now: number, ms: Durations): Timer => ({ phase, status: 'running', endsAt: now + ms[phase] })

export const pause = (t: Timer | null, now: number): Timer | null =>
  t?.status === 'running' ? { phase: t.phase, status: 'paused', leftMs: Math.max(0, t.endsAt - now) } : t

export const resume = (t: Timer | null, now: number): Timer | null =>
  t?.status === 'paused' ? { phase: t.phase, status: 'running', endsAt: now + t.leftMs } : t

export const advance = (timer: Timer | null, now: number, ms: Durations): { timer: Timer | null; ended: Phase[] } => {
  const ended: Phase[] = []
  let t = timer
  while (t?.status === 'running' && now >= t.endsAt) {
    ended.push(t.phase)
    t = t.phase === 'work' ? { phase: 'break', status: 'running', endsAt: t.endsAt + ms.break } : null
  }
  return { timer: t, ended }
}

export const view = (t: Timer | null, now: number, ms: Durations): View | null =>
  t === null
    ? null
    : {
        phase: t.phase,
        status: t.status,
        secondsLeft: Math.max(0, Math.ceil((t.status === 'running' ? t.endsAt - now : t.leftMs) / 1000)),
        totalSeconds: ms[t.phase] / 1000,
      }

export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

export const bar = (v: View, cells = 8) => {
  const done = Math.min(cells, Math.max(0, Math.round((1 - v.secondsLeft / v.totalSeconds) * cells)))
  return '▰'.repeat(done) + '▱'.repeat(cells - done)
}

export const notice = (ended: Phase[], next: Timer | null, ms: Durations) =>
  next?.phase === 'break' ? `집중 끝. ${ms.break / 60000}분 쉬어요.` : ended.length > 0 ? '휴식 끝. 다시 시작할 땐 /pomodoro.' : undefined
