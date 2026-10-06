import type { RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 40,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const ENGINE = () => ({ type: 'engine' as const, ref: 0 })

const USAGE = { startedAt: 0, context: { window: 100, tokens: 85, percent: 85 }, rateLimits: [] }

test('draws the colored line, with a divider on the terminal alone', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ENGINE)
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
  on('ui.render', { component: 'AbovePrompt' }, ENGINE)
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

test('puts the band another plugin drew beneath it on the line under its own', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['집중 25:00'] }))
  await $.session.measure({ context: USAGE.context, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'status-bar', surface, component: 'AbovePrompt', props: PROPS })
    expect(stacks(await ui.drawn(), /^\[Opus 5\.5\]/, /^집중 25:00$/)).toBe(true)
    await ui.unmount()
  }
})

test('ends the line with the directory and the branch git reports, the sha once detached', async ($, on) => {
  const cwd = '/Users/me/claude-plugins'
  let branch = 'main'
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.cwd', () => ({ value: cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    const stdout = e.argv.includes('--show-current') ? `${branch}\n` : '2a265d1\n'
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('ui.render', { component: 'AbovePrompt' }, ENGINE)
  await $.session.measure({ context: USAGE.context, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    branch = 'main'
    await $.session.start({ cwd, surface, isInteractive: true })
    const ui = await $.ui.mount({ plugin: 'status-bar', surface, component: 'AbovePrompt', props: PROPS })
    const status = async () => (await ui.findAll({ type: 'Text' })).find(t => t.text.startsWith('[Opus 5.5]'))?.text
    expect(await status()).toBe('[Opus 5.5] ctx 85% / 5h - / 7d - / turn 0 / 0/0 / cache - / claude-plugins (main)')

    branch = ''
    await $.tool.call({ tool: 'Bash', command: 'git switch --detach' })
    expect(await status()).toBe('[Opus 5.5] ctx 85% / 5h - / 7d - / turn 0 / 0/0 / cache - / claude-plugins (2a265d1)')
    await ui.unmount()
  }
})

test('drops the divider a band beneath it drew, keeping its own', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [
      { type: 'Text', props: { dimColor: true }, children: ['─'.repeat(40)] },
      { type: 'Text', props: {}, children: ['● 집중 1회차 25:00'] },
    ],
  }))
  await $.session.measure({ context: USAGE.context, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'status-bar', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.filter(t => /^─+$/.test(t))).toHaveLength(1)
  expect(texts.findIndex(t => /^─+$/.test(t))).toBeLessThan(texts.findIndex(t => t.startsWith('[Opus 5.5]')))
  expect(texts).toContain('● 집중 1회차 25:00')
  await ui.unmount()
})
