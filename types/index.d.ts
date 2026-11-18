export type Recent = string[]

declare module 'claude-code' {
  interface PluginState {
    'pinned-replies': { recent: Shaped<Recent>; isHidden: boolean; isCollapsed: boolean; isOlderHidden: boolean; isStale: boolean; expanded: string | null }
  }
}
