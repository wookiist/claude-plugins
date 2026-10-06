export type Phase = 'work' | 'break'

export type Timer = { phase: Phase; endsAt: number }

export type View = { phase: Phase; secondsLeft: number }

declare module 'claude-code' {
  interface PluginState {
    pomodoro: { view: View | null }
  }
}
