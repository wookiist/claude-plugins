export type Plan = {
  startedAt: number
  focusMin: number
  breakMin: number
  pausedAt: number | null
  pausedMs: number
  skippedMs: number
}

export type Kind = 'focus' | 'break'

export type Status = { kind: Kind; round: number; seq: number; leftMs: number; isPaused: boolean }

export type Seen = { startedAt: number; seq: number }

declare module 'claude-code' {
  interface PluginState {
    pomodoro: { view: Status | null; seen: Seen | null }
  }
}
