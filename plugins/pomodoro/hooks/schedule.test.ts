import { expect, test } from 'claude-code/testing'

import type { Plan } from '../types'
import { apply, describe, minutes, MIN, parseCommand, parseToolInput, status, toastFor } from './schedule'

const plan = (over: Partial<Plan> = {}): Plan => ({
  startedAt: 0,
  focusMin: 25,
  breakMin: 5,
  pausedAt: null,
  pausedMs: 0,
  skippedMs: 0,
  ...over,
})

const at = (p: Plan, ms: number) => {
  const s = status(p, ms)
  return `${describe(s)} #${s.seq}`
}

test('alternates focus and break, and every fourth break is three times as long', () => {
  const p = plan()
  expect(at(p, 0)).toBe('집중 1회차 25:00 남음 #0')
  expect(at(p, 25 * MIN)).toBe('휴식 1회차 05:00 남음 #1')
  expect(at(p, 30 * MIN)).toBe('집중 2회차 25:00 남음 #2')
  expect(at(p, 3 * 30 * MIN + 25 * MIN)).toBe('휴식 4회차 15:00 남음 #7')
  expect(at(p, 3 * 30 * MIN + 25 * MIN + 14 * MIN)).toBe('휴식 4회차 01:00 남음 #7')
  expect(at(p, 4 * 25 * MIN + 6 * 5 * MIN)).toBe('집중 5회차 25:00 남음 #8')
  expect(at(p, 4 * 25 * MIN + 6 * 5 * MIN + 25 * MIN)).toBe('휴식 5회차 05:00 남음 #9')
})

test('pause freezes the clock and resume continues from where it stopped', () => {
  const paused = apply(plan(), { kind: 'pause' }, 10 * MIN)!
  expect(at(paused, 40 * MIN)).toBe('집중 1회차 15:00 남음 (일시정지) #0')
  expect(apply(paused, { kind: 'pause' }, 20 * MIN)).toEqual(paused)

  const resumed = apply(paused, { kind: 'resume' }, 40 * MIN)!
  expect(resumed.pausedAt).toBeNull()
  expect(at(resumed, 40 * MIN)).toBe('집중 1회차 15:00 남음 #0')
  expect(at(resumed, 55 * MIN)).toBe('휴식 1회차 05:00 남음 #1')
})

test('skip ends the current phase and starts the next one, paused or not', () => {
  const skipped = apply(plan(), { kind: 'skip' }, 10 * MIN)!
  expect(at(skipped, 10 * MIN)).toBe('휴식 1회차 05:00 남음 #1')

  const pausedThenSkipped = apply(apply(plan(), { kind: 'pause' }, 10 * MIN), { kind: 'skip' }, 12 * MIN)!
  expect(at(pausedThenSkipped, 30 * MIN)).toBe('휴식 1회차 05:00 남음 (일시정지) #1')
})

test('minutes fall back to the default unless they are positive numbers', () => {
  expect(minutes('50', 25)).toBe(50)
  expect(minutes(10, 5)).toBe(10)
  for (const bad of ['abc', '0', '-3', '', undefined, null, 0, -1, NaN]) {
    expect(minutes(bad, 25)).toBe(25)
  }
})

test('parses the command and the tool input', () => {
  expect(parseCommand('')).toEqual({ kind: 'start', focusMin: 25, breakMin: 5 })
  expect(parseCommand('50 10')).toEqual({ kind: 'start', focusMin: 50, breakMin: 10 })
  expect(parseCommand('abc -1')).toEqual({ kind: 'start', focusMin: 25, breakMin: 5 })
  expect(parseCommand('stop')).toEqual({ kind: 'stop' })
  expect(parseCommand('중지')).toEqual({ kind: 'stop' })
  expect(parseToolInput({ action: 'start', focusMin: 40 })).toEqual({ kind: 'start', focusMin: 40, breakMin: 5 })
  expect(parseToolInput({ action: 'pause', focusMin: 40 })).toEqual({ kind: 'pause' })
  expect(parseToolInput({ action: 'skip' })).toBeNull()
})

test('toasts only when the same timer moves to a later phase', () => {
  const p = plan({ startedAt: 1 })
  const s = status(p, 1 + 25 * MIN)
  expect(toastFor(null, p, s)).toBeUndefined()
  expect(toastFor({ startedAt: 1, seq: 1 }, p, s)).toBeUndefined()
  expect(toastFor({ startedAt: 2, seq: 0 }, p, s)).toBeUndefined()
  expect(toastFor({ startedAt: 1, seq: 0 }, p, s)).toBe('집중 1회 완료. 쉬어요.')
  expect(toastFor({ startedAt: 1, seq: 1 }, p, status(p, 1 + 30 * MIN))).toBe('휴식 끝. 다시 집중할 시간이에요.')
})
