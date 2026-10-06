import type { Phase, Timer, View } from '../types'

export type Durations = { work: number; break: number }

export const LABEL: Record<Phase, string> = { work: '집중', break: '휴식' }

export const start = (phase: Phase, now: number, ms: Durations): Timer => ({ phase, endsAt: now + ms[phase] })

export const advance = (timer: Timer | null, now: number, ms: Durations): { timer: Timer | null; ended: Phase[] } => {
  const ended: Phase[] = []
  let t = timer
  while (t !== null && now >= t.endsAt) {
    ended.push(t.phase)
    t = t.phase === 'work' ? { phase: 'break', endsAt: t.endsAt + ms.break } : null
  }
  return { timer: t, ended }
}

export const view = (timer: Timer | null, now: number): View | null =>
  timer === null ? null : { phase: timer.phase, secondsLeft: Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) }

export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

export const notice = (ended: Phase[], next: Timer | null, ms: Durations) =>
  next?.phase === 'break' ? `집중 끝. ${ms.break / 60000}분 쉬어요.` : ended.length > 0 ? '휴식 끝. /pomodoro 로 다시 시작해요.' : undefined
