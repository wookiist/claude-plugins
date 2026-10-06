import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase, Timer } from '../types'
import { advance, clock, LABEL, notice, start, view } from './timer'
import type { Durations } from './timer'

const shown = atom({ plugin: 'pomodoro', key: 'view' } as const, null)

const load = async ($: EngineInterface) => ((await $.store.get('timer')) ?? null) as Timer | null

const tick = async ($: EngineInterface, ms: Durations) => {
  const [stored, now] = await Promise.all([load($), $.clock.now()])
  const { timer, ended } = advance(stored, now, ms)
  if (ended.length > 0) {
    await $.store.set('timer', timer)
    const text = notice(ended, timer, ms)
    if (text !== undefined) {
      $.ui.toast(text)
    }
  }
  const next = view(timer, now)
  await update($, shown, prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
}

const begin = async ($: EngineInterface, phase: Phase, ms: Durations) => {
  const timer = start(phase, await $.clock.now(), ms)
  await $.store.set('timer', timer)
  await tick($, ms)
  return `${LABEL[phase]} ${clock(ms[phase] / 1000)} 시작했어요.`
}

export const register: Register = (on, options) => {
  const ms = { work: Number(options.workMinutes ?? 25) * 60000, break: Number(options.breakMinutes ?? 5) * 60000 }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'pomodoro',
      description: '뽀모도로 타이머를 시작하거나 멈춰요',
      argumentHint: '[start|break|stop]',
      immediate: true,
    })
    await tick($, ms)
    $.clock.every(1000, () => tick($, ms))
    return started
  })

  on('command.run', { command: 'pomodoro' }, async ($, e) => {
    const word = e.args.trim()
    if (word === 'stop') {
      await $.store.set('timer', null)
      await tick($, ms)
      return { text: '타이머를 멈췄어요.' }
    }
    if (word === '' || word === 'start' || word === 'break') {
      return { text: await begin($, word === 'break' ? 'break' : 'work', ms) }
    }
    return { text: '사용법: /pomodoro [start|break|stop]' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [below, v] = await Promise.all([next(e), read($, shown)])
    if (e.props.hasSurvey || v === null) {
      return below
    }
    const { Box, Text } = $.ui.resolve(e)
    const line = (
      <Text wrap="truncate-end">
        <Text color={v.phase === 'work' ? 'error' : 'success'} bold>
          {LABEL[v.phase]}
        </Text>
        <Text> {clock(v.secondsLeft)}</Text>
      </Text>
    )
    return below.type === 'engine' ? (
      line
    ) : (
      <Box flexDirection="column">
        {below}
        {line}
      </Box>
    )
  })
}
