import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 40,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const MIN = 60000

type Engine = Parameters<TestBody>[0]

const begin = async ($: Engine, on: On) => {
  on('session.start', (_, e) => e)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

const ENGINE = () => ({ type: 'engine' as const, ref: 0 })

const run = ($: Engine, args: string) =>
  $.command.run({ command: 'pomodoro', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

test('counts down 25 minutes of focus, then a 5-minute break, toasting each end', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('ui.render', { component: 'AbovePrompt' }, ENGINE)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await begin($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pomodoro', surface, component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /집중|휴식/ })).toBeUndefined()
    await ui.unmount()
  }

  expect((await run($, '')).text).toBe('집중 25:00 시작했어요.')
  const ui = await $.ui.mount({ plugin: 'pomodoro', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ type: 'Text', text: /^집중/ }))?.text).toBe('집중 25:00')

  await clock.advance(MIN + 1000)
  expect((await ui.find({ type: 'Text', text: /^집중/ }))?.text).toBe('집중 23:59')

  await clock.advance(24 * MIN)
  expect((await ui.find({ type: 'Text', text: /^휴식/ }))?.text).toBe('휴식 04:59')
  expect(toasts).toEqual(['집중 끝. 5분 쉬어요.'])

  await clock.advance(5 * MIN)
  expect(await ui.find({ type: 'Text', text: /집중|휴식/ })).toBeUndefined()
  expect(toasts).toEqual(['집중 끝. 5분 쉬어요.', '휴식 끝. /pomodoro 로 다시 시작해요.'])
  await ui.unmount()
})

test('stop clears the timer and a stored timer resumes on session start', async ($, on) => {
  mock.clock(on, { now: 10 * MIN })
  mock.store(on, { timer: { phase: 'work', endsAt: 20 * MIN } })
  on('ui.render', { component: 'AbovePrompt' }, ENGINE)
  await begin($, on)

  const ui = await $.ui.mount({ plugin: 'pomodoro', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ type: 'Text', text: /^집중/ }))?.text).toBe('집중 10:00')

  expect((await run($, 'stop')).text).toBe('타이머를 멈췄어요.')
  expect(await ui.find({ type: 'Text', text: /집중|휴식/ })).toBeUndefined()
  await ui.unmount()
})

test('keeps the band another plugin drew beneath it', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['status line'] }))
  await begin($, on)
  await run($, 'break')

  const ui = await $.ui.mount({ plugin: 'pomodoro', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('status line')
  expect(texts).toContain('휴식 05:00')
  await ui.unmount()
})

test('takes the durations from its options', { options: { workMinutes: 50, breakMinutes: 10 } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  await begin($, on)
  expect((await run($, 'start')).text).toBe('집중 50:00 시작했어요.')
  expect((await run($, 'break')).text).toBe('휴식 10:00 시작했어요.')
})
