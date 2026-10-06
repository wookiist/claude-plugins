import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Place } from '../types'
import { EMPTY, format } from './format'

const tally = atom({ plugin: 'status-bar', key: 'tally' } as const, EMPTY)
const line = atom({ plugin: 'status-bar', key: 'line' } as const, null)
const place = atom({ plugin: 'status-bar', key: 'place' } as const, null)

const refresh = async ($: EngineInterface) => {
  const [model, usage, t, p] = await Promise.all([$.session.model(), $.session.usage(), read($, tally), read($, place)])
  const next = format(model, usage, t, p)
  await update($, line, prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
}

const git = async ($: EngineInterface, cwd: string, args: string[]) => {
  const ran = await $.process.run(['git', ...args], { cwd }).catch(() => null)
  return ran?.exitCode === 0 ? ran.stdout.trim() : null
}

const readPlace = async ($: EngineInterface): Promise<Place> => {
  const cwd = await $.session.cwd()
  const dir = cwd.split('/').filter(Boolean).pop() ?? cwd
  const branch = await git($, cwd, ['branch', '--show-current'])
  const head = branch === '' ? await git($, cwd, ['rev-parse', '--short', 'HEAD']) : branch
  return { dir, head }
}

const syncPlace = async ($: EngineInterface) => {
  const next = await readPlace($)
  await update($, place, prev => (prev?.dir === next.dir && prev.head === next.head ? prev : next))
  await refresh($)
}

const isDivider = (node: unknown) =>
  typeof node === 'object' &&
  node !== null &&
  (node as RenderElement).type === 'Text' &&
  ((node as { children?: unknown[] }).children ?? []).every(c => typeof c === 'string' && /^─+$/.test(c))

const withoutDivider = (el: RenderElement): RenderElement =>
  el.type === 'Box' && el.props?.flexDirection === 'column' && isDivider(el.children?.[0])
    ? { ...el, children: el.children?.slice(1) }
    : el

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const field = (o: unknown, key: string): unknown =>
  typeof o === 'object' && o !== null ? (o as Record<string, unknown>)[key] : undefined

const syncEffort = async ($: EngineInterface, typed = '') => {
  const word = typed.trim().split(/\s+/)[0] ?? ''
  const [settings, model] = await Promise.all([$.settings.read(), $.session.model()])
  const perModel = field(field(field(settings, 'modelSettings'), model.replace(/\[.*\]$/, '')), 'effortLevel')
  const saved = perModel ?? field(settings, 'effortLevel')
  const effort = EFFORTS.includes(word) ? word : typeof saved === 'string' ? saved : undefined
  if (effort !== undefined) {
    await update($, tally, t => (t.effort === effort ? t : { ...t, effort }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    $.ui.status(undefined)
    await syncPlace($)
    return started
  })

  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    await refresh($)
    return measured
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (e.command === 'effort' || e.command === 'model') {
      await syncEffort($, e.command === 'effort' ? e.args : '')
      await refresh($)
    }
    return ran
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    const switched = await next(e)
    await syncEffort($)
    await refresh($)
    return switched
  })

  on('classic.ConfigChange', async ($, e, next) => {
    const changed = await next(e)
    await syncEffort($)
    await refresh($)
    return changed
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && e.effort !== undefined) {
      const effort = String(e.effort)
      await update($, tally, t => (t.effort === effort ? t : { ...t, effort }))
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId) {
      const u = e.usage
      await update($, tally, t => ({
        ...t,
        turns: t.turns + 1,
        input: t.input + (u?.input_tokens ?? 0),
        output: t.output + (u?.output_tokens ?? 0),
        cacheRead: t.cacheRead + (u?.cache_read_input_tokens ?? 0),
        cacheWrite: t.cacheWrite + (u?.cache_creation_input_tokens ?? 0),
      }))
      await syncPlace($)
    }
    return done
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    await syncPlace($).catch(() => undefined)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [below, segments] = await Promise.all([next(e), read($, line)])
    if (e.props.hasSurvey || segments === null) {
      return below
    }
    const { Box, Text } = $.ui.resolve(e)
    const status = (
      <Text wrap="truncate-end">
        {segments.map(s => (
          <Text color={s.color} bold={s.bold}>
            {s.text}
          </Text>
        ))}
      </Text>
    )
    const rest = below.type === 'engine' ? null : withoutDivider(below)
    if (e.surface !== 'terminal' && rest === null) {
      return status
    }
    return (
      <Box flexDirection="column">
        {e.surface === 'terminal' && <Text dimColor>{'─'.repeat(e.props.bodyColumns)}</Text>}
        {status}
        {rest}
      </Box>
    )
  })
}
