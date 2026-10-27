declare module 'claude-code' {
  interface PluginState {
    'context-meter': { percent: number | null; band: number; isHidden: boolean; tick: number }
  }
}
