import { expect, test } from 'claude-code/testing'

import { current, mergeLimits, parseLimits } from './limits'

const H = '2026-10-07T05:00:00.000Z'
const LATER = '2026-10-07T10:00:00.000Z'
const D = '2026-10-10T00:00:00.000Z'

test('a lower reading of the same window never replaces a higher one', () => {
  const shared = [{ kind: 'five_hour', percentUsed: 40, resetsAt: H }]
  const stale = [{ kind: 'five_hour', percentUsed: 12, resetsAt: H }]
  expect(mergeLimits(shared, stale)).toEqual(shared)
  expect(mergeLimits(stale, shared)).toEqual(shared)
})

test('a reading of a later window wins even when its percent is lower', () => {
  const old = [{ kind: 'five_hour', percentUsed: 90, resetsAt: H }]
  const fresh = [{ kind: 'five_hour', percentUsed: 3, resetsAt: LATER }]
  expect(mergeLimits(old, fresh)).toEqual(fresh)
  expect(mergeLimits(fresh, old)).toEqual(fresh)
})

test('merges windows by kind and keeps ones only one side has', () => {
  const merged = mergeLimits(
    [{ kind: 'seven_day', percentUsed: 30, resetsAt: D }],
    [{ kind: 'five_hour', percentUsed: 10, resetsAt: H }],
  )
  expect(merged.map(r => r.kind)).toEqual(['five_hour', 'seven_day'])
  expect(mergeLimits(merged, [])).toEqual(merged)
})

test('a window whose reset has passed reads as 0%', () => {
  const limits = [
    { kind: 'five_hour', percentUsed: 80, resetsAt: H },
    { kind: 'seven_day', percentUsed: 30, resetsAt: D },
  ]
  expect(current(limits, Date.parse(H)).map(r => r.percentUsed)).toEqual([0, 30])
  expect(current(limits, Date.parse(H) - 1).map(r => r.percentUsed)).toEqual([80, 30])
})

test('parses only well-formed readings out of the store', () => {
  expect(parseLimits(undefined)).toEqual([])
  expect(parseLimits({ kind: 'five_hour' })).toEqual([])
  expect(parseLimits([{ kind: 'five_hour', percentUsed: 5, resetsAt: H }, { kind: 1 }, null])).toEqual([
    { kind: 'five_hour', percentUsed: 5, resetsAt: H },
  ])
})
