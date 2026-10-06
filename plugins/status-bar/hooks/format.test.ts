import { expect, test } from 'claude-code/testing'

import { EMPTY, format, prettyModel } from './format'

const plain = (segments: ReturnType<typeof format>) => segments.map(s => s.text).join('')
const colorOf = (segments: ReturnType<typeof format>, text: string) => segments.find(s => s.text === text)?.color

const usage = {
  context: { window: 1_000_000, tokens: 420_000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 12.4 },
    { kind: 'seven_day', percentUsed: 30 },
  ],
}

test('draws every field in order', () => {
  const line = plain(format('claude-opus-5-5[1m]', usage, {
    turns: 7,
    input: 10_000,
    output: 34_000,
    cacheRead: 1_200_000,
    cacheWrite: 40_000,
    effort: 'high',
  }, null))
  expect(line).toBe('[Opus 5.5 (high)] ctx 42% / 5h 12% / 7d 30% / turn 7 / 1.2M/40k / cache 96%')
})

test('shows dashes before any reading', () => {
  const line = plain(format('claude-sonnet-5-5', { context: { window: 200_000 }, rateLimits: [] }, EMPTY, null))
  expect(line).toBe('[Sonnet 5.5] ctx - / 5h - / 7d - / turn 0 / 0/0 / cache -')
})

test('spells model ids as names', () => {
  expect(prettyModel('claude-fable-5')).toBe('Fable 5')
  expect(prettyModel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(prettyModel('opus')).toBe('Opus')
})

test('colors usage by how full it is and cache by how often it hits', () => {
  const segments = format(
    'claude-opus-5-5',
    { context: { window: 1, percent: 85 }, rateLimits: [{ kind: 'five_hour', percentUsed: 55 }, { kind: 'seven_day', percentUsed: 10 }] },
    { ...EMPTY, input: 70, cacheRead: 30 },
    null,
  )
  expect(colorOf(segments, '85%')).toBe('error')
  expect(colorOf(segments, '55%')).toBe('warning')
  expect(colorOf(segments, '10%')).toBe('success')
  expect(colorOf(segments, '30%')).toBe('error')
})

test('gives turn and cache tokens their own colors', () => {
  const segments = format('claude-opus-5-5', usage, { ...EMPTY, turns: 3, cacheRead: 5_000, cacheWrite: 2_000 }, null)
  expect(colorOf(segments, '3')).toBe('ide')
  expect(colorOf(segments, '5k')).toBe('remember')
  expect(colorOf(segments, '2k')).toBe('merged')
})

test('draws labels in the plain text color, punctuation dim', () => {
  const segments = format('claude-opus-5-5', usage, EMPTY, null)
  for (const name of ['ctx ', '5h ', '7d ', 'turn ', 'cache ']) {
    expect(colorOf(segments, name)).toBe('text')
  }
  expect(colorOf(segments, ' / ')).toBe('subtle')
})

test('ends with the directory and its branch, or the short sha when detached', () => {
  const line = (place: Parameters<typeof format>[3]) => plain(format('claude-opus-5-5', usage, EMPTY, place))
  const head = '[Opus 5.5] ctx 42% / 5h 12% / 7d 30% / turn 0 / 0/0 / cache -'
  expect(line({ dir: 'claude-plugins', head: 'main' })).toBe(`${head} / claude-plugins (main)`)
  expect(line({ dir: 'claude-plugins', head: '2a265d1' })).toBe(`${head} / claude-plugins (2a265d1)`)
  expect(line({ dir: 'scratchpad', head: null })).toBe(`${head} / scratchpad`)
  expect(line(null)).toBe(head)
})

test('colors the branch apart from the directory', () => {
  const segments = format('claude-opus-5-5', usage, EMPTY, { dir: 'claude-plugins', head: 'main' })
  expect(colorOf(segments, 'claude-plugins')).toBe('text')
  expect(colorOf(segments, 'main')).toBe('success')
  expect(colorOf(segments, ' (')).toBe('subtle')
})
