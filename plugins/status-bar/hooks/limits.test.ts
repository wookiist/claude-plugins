import { expect, test } from 'claude-code/testing'

import { current, parseLimits, publish, unpublished } from './limits'

const H = '2026-10-07T05:00:00.000Z'
const D = '2026-10-10T00:00:00.000Z'

test('a published reading replaces its kind even when its percent is lower', () => {
  const shared = [{ kind: 'seven_day', percentUsed: 61, resetsAt: D, seenAt: 1 }]
  expect(publish(shared, [{ kind: 'seven_day', percentUsed: 5, resetsAt: D }], 2)).toEqual([
    { kind: 'seven_day', percentUsed: 5, resetsAt: D, seenAt: 2 },
  ])
})

test('publishing keeps kinds only the shared list has', () => {
  const shared = [{ kind: 'seven_day', percentUsed: 30, resetsAt: D, seenAt: 1 }]
  expect(publish(shared, [{ kind: 'five_hour', percentUsed: 10, resetsAt: H }], 2)).toEqual([
    { kind: 'five_hour', percentUsed: 10, resetsAt: H, seenAt: 2 },
    { kind: 'seven_day', percentUsed: 30, resetsAt: D, seenAt: 1 },
  ])
})

test('only readings that differ from what this session last published are unpublished', () => {
  const published = [
    { kind: 'five_hour', percentUsed: 12, resetsAt: H },
    { kind: 'seven_day', percentUsed: 30, resetsAt: D },
  ]
  expect(unpublished(published, published)).toEqual([])
  expect(unpublished([{ kind: 'five_hour', percentUsed: 13, resetsAt: H }, published[1]!], published)).toEqual([
    { kind: 'five_hour', percentUsed: 13, resetsAt: H },
  ])
  expect(unpublished(published, [])).toEqual(published)
})

test('a window whose reset has passed reads as 0%', () => {
  const limits = [
    { kind: 'five_hour', percentUsed: 80, resetsAt: H },
    { kind: 'seven_day', percentUsed: 30, resetsAt: D },
  ]
  expect(current(limits, Date.parse(H)).map(r => r.percentUsed)).toEqual([0, 30])
  expect(current(limits, Date.parse(H) - 1).map(r => r.percentUsed)).toEqual([80, 30])
})

test('parses only well-formed readings out of the store, old ones as never seen', () => {
  expect(parseLimits(undefined)).toEqual([])
  expect(parseLimits({ kind: 'five_hour' })).toEqual([])
  expect(
    parseLimits([
      { kind: 'five_hour', percentUsed: 5, resetsAt: H },
      { kind: 'seven_day', percentUsed: 9, resetsAt: D, seenAt: 7 },
      { kind: 1 },
      null,
    ]),
  ).toEqual([
    { kind: 'five_hour', percentUsed: 5, resetsAt: H, seenAt: 0 },
    { kind: 'seven_day', percentUsed: 9, resetsAt: D, seenAt: 7 },
  ])
})
