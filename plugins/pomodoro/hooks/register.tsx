import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Plan } from '../types'
import { apply, clock, describe, LABEL, parseCommand, parsePlan, parseToolInput, status, toastFor } from './schedule'
import type { Action } from './schedule'

const view = atom({ plugin: 'pomodoro', key: 'view' } as const, null)
const seen = atom({ plugin: 'pomodoro', key: 'seen' } as const, null)

const TOOL = 'mcp__pomodoro__pomodoro'

const DONE: Record<Action['kind'], string> = {
  start: '시작했어요.',
  stop: '멈췄어요.',
  pause: '일시정지했어요.',
  resume: '재개했어요.',
  skip: '다음 단계로 넘어갔어요.',
}

const loadPlan = async ($: EngineInterface) => parsePlan(await $.store.get('plan'))

const savePlan = async ($: EngineInterface, p: Plan | null) => (p === null ? $.store.delete('plan') : $.store.set('plan', p))

const tick = async ($: EngineInterface) => {
  const [p, now, prev] = await Promise.all([loadPlan($), $.clock.now(), read($, seen)])
  const s = p === null ? null : status(p, now)
  const text = p !== null && s !== null ? toastFor(prev, p, s) : undefined
  if (text !== undefined) {
    $.ui.toast(text)
  }
  const nextSeen = p !== null && s !== null ? { startedAt: p.startedAt, seq: s.seq } : null
  await update($, seen, old => (JSON.stringify(old) === JSON.stringify(nextSeen) ? old : nextSeen))
  await update($, view, old => (JSON.stringify(old) === JSON.stringify(s) ? old : s))
  return s
}

const act = async ($: EngineInterface, a: Action) => {
  await tick($)
  const [p, now] = await Promise.all([loadPlan($), $.clock.now()])
  if (p === null && a.kind !== 'start' && a.kind !== 'stop') {
    return `진행 중인 타이머가 없어요. 현재 ${describe(null)}`
  }
  await savePlan($, apply(p, a, now))
  return `${DONE[a.kind]} 현재 ${describe(await tick($))}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'pomodoro',
      description: '뽀모도로 타이머를 시작하거나 멈춰요',
      argumentHint: '[집중분] [휴식분] | stop',
      immediate: true,
    })
    await $.tool.register({
      name: 'pomodoro',
      description:
        '뽀모도로 타이머를 조작해요. action은 start, stop, pause, resume 중 하나예요. start일 때만 focusMin(집중 분)과 breakMin(휴식 분)을 받고, 빠지면 25분과 5분을 써요.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'stop', 'pause', 'resume'] },
          focusMin: { type: 'number', description: '집중 분, start일 때만' },
          breakMin: { type: 'number', description: '휴식 분, start일 때만' },
        },
        required: ['action'],
      },
    })
    await tick($)
    $.clock.every(1000, () => tick($))
    return started
  })

  on('command.run', { command: 'pomodoro' }, async ($, e) => ({ text: await act($, parseCommand(e.args)) }))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const a = parseToolInput(e as Record<string, unknown>)
    const text = a === null ? `action은 start, stop, pause, resume 중 하나여야 해요. 현재 ${describe(await tick($))}` : await act($, a)
    return { result: { content: [{ type: 'text', text }], isError: a === null } }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [below, s] = await Promise.all([next(e), read($, view)])
    if (e.props.hasSurvey || s === null) {
      return below
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const line = (
      <Box>
        <Text>
          <Text color="subtle">[</Text>
          <Text color={s.kind === 'focus' ? 'error' : 'success'} bold>
            {LABEL[s.kind]}
          </Text>
          <Text color="subtle">] </Text>
          <Text color="ide">{s.round}</Text>
          <Text color="text">회차</Text>
          <Text color="subtle"> / </Text>
          <Text color={s.isPaused ? 'subtle' : 'suggestion'}>{clock(s.leftMs)}</Text>
          {s.isPaused ? <Text color="warning"> 일시정지</Text> : ''}
        </Text>
        <Text color="subtle"> / </Text>
        <Button key="toggle" label={s.isPaused ? '재개' : '일시정지'} plain dimColor onPress={() => act($, { kind: s.isPaused ? 'resume' : 'pause' })} />
        <Text color="subtle"> · </Text>
        <Button key="skip" label="건너뛰기" plain dimColor onPress={() => act($, { kind: 'skip' })} />
        <Text color="subtle"> · </Text>
        <Button key="stop" label="중지" plain dimColor onPress={() => act($, { kind: 'stop' })} />
      </Box>
    )
    if (below.type !== 'engine') {
      return (
        <Box flexDirection="column">
          {below}
          {line}
        </Box>
      )
    }
    if (e.surface !== 'terminal') {
      return line
    }
    return (
      <Box flexDirection="column">
        <Text dimColor>{'─'.repeat(e.props.bodyColumns)}</Text>
        {line}
      </Box>
    )
  })
}
