import { expect, test } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 40,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const USAGE = { startedAt: 0, context: { window: 100, tokens: 85, percent: 85 }, rateLimits: [] }

test('draws the colored line, with a divider on the terminal alone', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({ context: USAGE.context, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'status-bar', surface, component: 'AbovePrompt', props: PROPS })
    const texts = await ui.findAll({ type: 'Text' })
    const line = texts.find(t => t.text.startsWith('[Opus 5.5]'))
    expect(line?.text).toBe('[Opus 5.5] ctx 85% / 5h - / 7d - / turn 0 / 0/0 / cache -')
    expect(line?.children).toContainEqual(expect.objectContaining({ props: { color: 'error' }, children: ['85%'] }))
    expect(texts.some(t => t.text === '─'.repeat(40))).toBe(surface === 'terminal')
    await ui.unmount()
  }
})

test('redraws at once when /model or /effort changes them', async ($, on) => {
  let model = 'claude-opus-5-5'
  let saved: Record<string, string> = { 'claude-opus-5-5': 'high', 'claude-fable-5-1': 'medium' }
  on('session.model', () => ({ value: model }))
  on('session.usage', () => ({ value: USAGE }))
  on('settings.read', () => ({
    value: { effortLevel: 'max', modelSettings: Object.fromEntries(Object.entries(saved).map(([id, effortLevel]) => [id, { effortLevel }])) },
  }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('command.run', () => ({ text: '' }))
  await $.session.measure({ context: USAGE.context, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'status-bar', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const typed = (command: string, args: string) =>
    $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const head = async () => (await ui.findAll({ type: 'Text' })).find(t => t.text.startsWith('['))?.text.split(']')[0]

  await typed('effort', 'max')
  expect(await head()).toBe('[Opus 5.5 (max)')

  saved = { ...saved, 'claude-opus-5-5': 'low' }
  await typed('effort', '')
  expect(await head()).toBe('[Opus 5.5 (low)')

  model = 'claude-fable-5-1'
  await typed('model', 'fable')
  expect(await head()).toBe('[Fable 5.1 (medium)')
  await ui.unmount()
})
