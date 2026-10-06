import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 30,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const MIN = 60000
const T0 = 1_000_000
const TOOL = 'mcp__pomodoro__pomodoro'

type Engine = Parameters<TestBody>[0]

const engineBand = (): RenderElement => ({ type: 'engine', ref: 0 })

const boot = async ($: Engine, on: On, below: () => RenderElement = engineBand) => {
  const clock = mock.clock(on, { now: T0 })
  const store: Record<string, unknown> = {}
  const toasts: string[] = []
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete store[e.key]
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => e)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__pomodoro__${e.name}` } }))
  on('ui.render', { component: 'AbovePrompt' }, below)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return { clock, store, toasts }
}

const run = async ($: Engine, args: string) =>
  (await $.command.run({ command: 'pomodoro', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }))
    .text

const timer = /^● /

test('the command starts with defaults or given minutes, and stop or 중지 ends it', async ($, on) => {
  const { store } = await boot($, on)

  expect(await run($, '')).toBe('시작했어요. 현재 집중 1회차 25:00 남음')
  expect(store.plan).toEqual({ startedAt: T0, focusMin: 25, breakMin: 5, pausedAt: null, pausedMs: 0, skippedMs: 0 })
  expect(await run($, '50 10')).toBe('시작했어요. 현재 집중 1회차 50:00 남음')
  expect(await run($, 'abc 0')).toBe('시작했어요. 현재 집중 1회차 25:00 남음')
  expect(await run($, 'stop')).toBe('멈췄어요. 현재 타이머 꺼짐')
  expect(store.plan).toBeUndefined()
  await run($, '')
  expect(await run($, '중지')).toBe('멈췄어요. 현재 타이머 꺼짐')
})

test('draws nothing while stopped or while a survey holds the band', async ($, on) => {
  await boot($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pomodoro', surface, component: 'AbovePrompt', props: PROPS })
    expect(await ui.drawn()).toEqual(engineBand())
    await ui.unmount()
  }
  await run($, '')
  const survey = await $.ui.mount({ plugin: 'pomodoro', surface: 'terminal', component: 'AbovePrompt', props: { ...PROPS, hasSurvey: true } })
  expect(await survey.drawn()).toEqual(engineBand())
  await survey.unmount()
})

test('the buttons pause, resume, skip and stop on every surface, dimming a paused clock', async ($, on) => {
  const { clock } = await boot($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    await run($, '')
    const ui = await $.ui.mount({ plugin: 'pomodoro', surface, component: 'AbovePrompt', props: PROPS })
    expect((await ui.find({ type: 'Text', text: timer }))?.text).toBe('● 집중 1회차 25:00')
    expect((await ui.find({ type: 'Text', text: timer }))?.children).toContainEqual({ type: 'Text', props: { color: 'error' }, children: ['●'] })
    expect((await ui.findAll({ type: 'Button' })).map(b => b.text)).toEqual(['일시정지', '건너뛰기', '중지'])

    await clock.advance(MIN)
    await ui.press({ key: 'toggle' })
    await clock.advance(10 * MIN)
    expect((await ui.find({ type: 'Text', text: timer }))?.text).toBe('● 집중 1회차 24:00 일시정지')
    expect((await ui.find({ type: 'Text', text: timer }))?.children).toContainEqual({ type: 'Text', props: { dimColor: true }, children: ['24:00'] })
    expect((await ui.find({ key: 'toggle' }))?.text).toBe('재개')

    await ui.press({ key: 'toggle' })
    await clock.advance(MIN)
    expect((await ui.find({ type: 'Text', text: timer }))?.text).toBe('● 집중 1회차 23:00')

    await ui.press({ key: 'skip' })
    expect((await ui.find({ type: 'Text', text: timer }))?.text).toBe('● 휴식 1회차 05:00')
    expect((await ui.find({ type: 'Text', text: timer }))?.children).toContainEqual({ type: 'Text', props: { color: 'success' }, children: ['●'] })

    await ui.press({ key: 'stop' })
    expect(await ui.find({ type: 'Text', text: timer })).toBeUndefined()
    await ui.unmount()
  }
})

test('toasts when a phase ends or is skipped, never on start, pause or stop', async ($, on) => {
  const { clock, toasts } = await boot($, on)
  await run($, '1 1')
  const ui = await $.ui.mount({ plugin: 'pomodoro', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  await ui.press({ key: 'toggle' })
  await ui.press({ key: 'toggle' })
  expect(toasts).toEqual([])

  await clock.advance(MIN)
  expect(toasts).toEqual(['집중 1회 완료. 쉬어요.'])
  await ui.press({ key: 'skip' })
  expect(toasts).toEqual(['집중 1회 완료. 쉬어요.', '휴식 끝. 다시 집중할 시간이에요.'])

  await run($, '')
  await ui.press({ key: 'stop' })
  expect(toasts).toHaveLength(2)
  await ui.unmount()
})

test('picks up a plan another session wrote within a second', async ($, on) => {
  const { clock, store, toasts } = await boot($, on)
  const ui = await $.ui.mount({ plugin: 'pomodoro', surface: 'desktop', component: 'AbovePrompt', props: PROPS })

  store.plan = { startedAt: T0 - 20 * MIN, focusMin: 25, breakMin: 5, pausedAt: null, pausedMs: 0, skippedMs: 0 }
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: timer }))?.text).toBe('● 집중 1회차 04:59')

  store.plan = { ...(store.plan as object), pausedAt: T0 + 1000 }
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: timer }))?.text).toBe('● 집중 1회차 04:59 일시정지')

  store.plan = { ...(store.plan as object), skippedMs: 5 * MIN - 1000 }
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: timer }))?.text).toBe('● 휴식 1회차 05:00 일시정지')
  expect(toasts).toEqual(['집중 1회 완료. 쉬어요.'])

  delete store.plan
  await clock.advance(1000)
  expect(await ui.find({ type: 'Text', text: timer })).toBeUndefined()
  await ui.unmount()
})

test('draws a dim divider on the terminal alone, and none under another plugin band', async ($, on) => {
  await boot($, on)
  await run($, '')
  const term = await $.ui.mount({ plugin: 'pomodoro', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await term.find({ type: 'Text', text: '─'.repeat(30) })).toMatchObject({ props: { dimColor: true } })
  await term.unmount()
  const desk = await $.ui.mount({ plugin: 'pomodoro', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await desk.find({ type: 'Text', text: /^─+$/ })).toBeUndefined()
  await desk.unmount()
})

test('keeps another plugin band above the timer, without a divider', async ($, on) => {
  await boot($, on, () => ({ type: 'Text', props: {}, children: ['status line'] }))
  await run($, '')
  const ui = await $.ui.mount({ plugin: 'pomodoro', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.indexOf('status line')).toBeGreaterThanOrEqual(0)
  expect(texts.indexOf('status line')).toBeLessThan(texts.findIndex(t => timer.test(t)))
  expect(texts.some(t => /^─+$/.test(t))).toBe(false)
  await ui.unmount()
})

test('the model tool starts, pauses, resumes and stops, ending with the current state', async ($, on) => {
  await boot($, on)
  const call = async (input: Record<string, unknown>) => {
    const r = await $.tool.call({ tool: TOOL, ...input })
    const content = (r.result as { content: { text: string }[] }).content
    return content.map(c => c.text).join('')
  }
  expect(await call({ action: 'start', focusMin: 40, breakMin: 8 })).toBe('시작했어요. 현재 집중 1회차 40:00 남음')
  expect(await call({ action: 'pause' })).toBe('일시정지했어요. 현재 집중 1회차 40:00 남음 (일시정지)')
  expect(await call({ action: 'resume' })).toBe('재개했어요. 현재 집중 1회차 40:00 남음')
  expect(await call({ action: 'stop' })).toBe('멈췄어요. 현재 타이머 꺼짐')
  expect(await call({ action: 'pause' })).toBe('진행 중인 타이머가 없어요. 현재 타이머 꺼짐')
  expect(await call({ action: 'jump' })).toBe('action은 start, stop, pause, resume 중 하나여야 해요. 현재 타이머 꺼짐')
})
