export type Tally = {
  turns: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  effort?: string
}

export type SegmentColor = 'text' | 'subtle' | 'claude' | 'suggestion' | 'success' | 'warning' | 'error' | 'ide' | 'remember' | 'merged'

export type Segment = { text: string; color: SegmentColor; bold?: boolean }

declare module 'claude-code' {
  interface PluginState {
    'status-bar': { tally: Tally; line: Segment[] | null }
  }
}
