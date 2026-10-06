export type Phase = 'work' | 'break'

export type Timer =
  | { phase: Phase; status: 'running'; endsAt: number }
  | { phase: Phase; status: 'paused'; leftMs: number }

export type View = { phase: Phase; status: Timer['status']; secondsLeft: number; totalSeconds: number }

declare module 'claude-code' {
  interface PluginState {
    pomodoro: { view: View | null }
  }
}
