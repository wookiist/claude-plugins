import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const MIN = 60000

type Engine = Parameters<TestBody>[0]

const begin = async ($: Engine, on: On, below: () => RenderElement = () => ({ type: 'engine', ref: 0 })) => {
  on('session.start', (_, e) => e)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', { component: 'AbovePrompt' }, below)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

const run = async ($: Engine, args: string) =>
  (await $.command.run({ command: 'pomodoro', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }))
    .text

const timerText = /^(집중|휴식)/

test('counts down 25 minutes of focus, then a 5-minute break, toasting each end', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await begin($, on)

  expect(await run($, '')).toBe('집중 25:00 진행 중이에요.')
  const ui = await $.ui.mount({ plugin: 'pomodoro', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ type: 'Text', text: timerText }))?.text).toBe('집중 ▱▱▱▱▱▱▱▱ 25:00')

  await clock.advance(13 * MIN)
  expect((await ui.find({ type: 'Text', text: timerText }))?.text).toBe('집중 ▰▰▰▰▱▱▱▱ 12:00')

  await clock.advance(12 * MIN + 1000)
  expect((await ui.find({ type: 'Text', text: timerText }))?.text).toBe('휴식 ▱▱▱▱▱▱▱▱ 04:59')
  expect(toasts).toEqual(['집중 끝. 5분 쉬어요.'])

  await clock.advance(5 * MIN)
  expect(await ui.find({ type: 'Text', text: timerText })).toBeUndefined()
  expect(await ui.find({ key: 'start' })).toBeDefined()
  expect(toasts).toEqual(['집중 끝. 5분 쉬어요.', '휴식 끝. 다시 시작할 땐 /pomodoro.'])
  await ui.unmount()
})

test('the band buttons start, pause, resume and stop the timer on every surface', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await begin($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pomodoro', surface, component: 'AbovePrompt', props: PROPS })
    await ui.press({ key: 'start' })
    expect((await ui.find({ key: 'toggle' }))?.text).toBe('일시정지')

    await clock.advance(5 * MIN)
    await ui.press({ key: 'toggle' })
    expect((await ui.find({ key: 'toggle' }))?.text).toBe('재개')
    await clock.advance(30 * MIN)
    expect((await ui.find({ type: 'Text', text: timerText }))?.text).toBe('집중 ▰▰▱▱▱▱▱▱ 20:00')

    await ui.press({ key: 'toggle' })
    await clock.advance(MIN)
    expect((await ui.find({ type: 'Text', text: timerText }))?.text).toBe('집중 ▰▰▱▱▱▱▱▱ 19:00')

    await ui.press({ key: 'stop' })
    expect(await ui.find({ type: 'Text', text: timerText })).toBeUndefined()
    expect(await ui.find({ key: 'start' })).toBeDefined()
    await ui.unmount()
  }
})

test('pause and resume by command, and a stored timer resumes on session start', async ($, on) => {
  mock.clock(on, { now: 10 * MIN })
  mock.store(on, { timer: { phase: 'work', status: 'running', endsAt: 20 * MIN } })
  await begin($, on)

  expect(await run($, 'pause')).toBe('집중 10:00 일시정지했어요.')
  expect(await run($, 'resume')).toBe('집중 10:00 진행 중이에요.')
  expect(await run($, 'stop')).toBe('타이머를 멈췄어요.')
  expect(await run($, 'pause')).toBe('진행 중인 타이머가 없어요.')
  expect(await run($, 'later')).toBe('사용법: /pomodoro [start|break|pause|resume|stop]')
})

const kidsOf = (node: unknown): unknown[] =>
  typeof node === 'object' && node !== null && 'children' in node && Array.isArray(node.children) ? node.children : []

const textOf = (node: unknown): string => (typeof node === 'string' ? node : kidsOf(node).map(textOf).join(''))

const textsIn = (node: unknown): string[] => [textOf(node), ...kidsOf(node).flatMap(textsIn)]

const stacks = (el: RenderElement, a: RegExp, b: RegExp): boolean => {
  if (el.type !== 'Box') {
    return false
  }
  const kids = kidsOf(el)
  const at = (re: RegExp) => kids.findIndex(k => textsIn(k).some(t => re.test(t)))
  const [i, j] = [at(a), at(b)]
  const isColumn = el.props?.flexDirection === 'column'
  return (isColumn && i >= 0 && j > i) || kids.some(k => stacks(k as RenderElement, a, b))
}

test('sits on its own line under the band another plugin drew beneath it', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  await begin($, on, () => ({ type: 'Text', props: {}, children: ['status line'] }))
  await run($, 'break')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pomodoro', surface, component: 'AbovePrompt', props: PROPS })
    expect(stacks(await ui.drawn(), /^status line$/, /^휴식 ▱+ 05:00$/)).toBe(true)
    await ui.unmount()
  }
})

test('takes the durations from its options', { options: { workMinutes: 50, breakMinutes: 10 } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  await begin($, on)
  expect(await run($, 'start')).toBe('집중 50:00 진행 중이에요.')
  expect(await run($, 'break')).toBe('휴식 10:00 진행 중이에요.')
})
