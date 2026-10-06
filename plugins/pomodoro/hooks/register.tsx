import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Timer } from '../types'
import { advance, bar, clock, LABEL, notice, pause, resume, start, view } from './timer'
import type { Durations } from './timer'

const shown = atom({ plugin: 'pomodoro', key: 'view' } as const, null)

const USAGE = '사용법: /pomodoro [start|break|pause|resume|stop]'

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
  const next = view(timer, now, ms)
  await update($, shown, prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
}

const act = async ($: EngineInterface, word: string, ms: Durations) => {
  await tick($, ms)
  const [t, now] = await Promise.all([load($), $.clock.now()])
  const next =
    word === '' || word === 'start'
      ? start('work', now, ms)
      : word === 'break'
        ? start('break', now, ms)
        : word === 'pause'
          ? pause(t, now)
          : word === 'resume'
            ? resume(t, now)
            : word === 'stop'
              ? null
              : undefined
  if (next === undefined) {
    return USAGE
  }
  if (t === null && (word === 'pause' || word === 'resume')) {
    return '진행 중인 타이머가 없어요.'
  }
  await $.store.set('timer', next)
  await tick($, ms)
  if (next === null) {
    return '타이머를 멈췄어요.'
  }
  const v = view(next, now, ms)
  return v === null ? USAGE : `${LABEL[v.phase]} ${clock(v.secondsLeft)} ${next.status === 'paused' ? '일시정지했어요.' : '진행 중이에요.'}`
}

export const register: Register = (on, options) => {
  const ms = { work: Number(options.workMinutes ?? 25) * 60000, break: Number(options.breakMinutes ?? 5) * 60000 }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'pomodoro',
      description: '뽀모도로 타이머를 시작, 일시정지, 재개하거나 멈춰요',
      argumentHint: '[start|break|pause|resume|stop]',
      immediate: true,
    })
    await tick($, ms)
    $.clock.every(1000, () => tick($, ms))
    return started
  })

  on('command.run', { command: 'pomodoro' }, async ($, e) => ({ text: await act($, e.args.trim(), ms) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [below, v] = await Promise.all([next(e), read($, shown)])
    if (e.props.hasSurvey) {
      return below
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const isPaused = v?.status === 'paused'
    const widget =
      v === null ? (
        <Box flexShrink={0}>
          <Button key="start" label="▶ 뽀모도로" hotkey="s" plain dimColor onPress={() => act($, 'start', ms)} />
        </Box>
      ) : (
        <Box flexShrink={0} columnGap={2}>
          <Text>
            <Text color={v.phase === 'work' ? 'error' : 'success'} bold>
              {LABEL[v.phase]}
            </Text>
            <Text dimColor> {bar(v)} </Text>
            <Text color={isPaused ? 'warning' : 'text'}>{clock(v.secondsLeft)}</Text>
          </Text>
          <Button
            key="toggle"
            label={isPaused ? '재개' : '일시정지'}
            hotkey="p"
            plain
            dimColor
            onPress={() => act($, isPaused ? 'resume' : 'pause', ms)}
          />
          <Button key="stop" label="중지" hotkey="x" plain dimColor onPress={() => act($, 'stop', ms)} />
        </Box>
      )
    if (below.type === 'engine') {
      return widget
    }
    return (
      <Box flexDirection="column">
        {below}
        {widget}
      </Box>
    )
  })
}
