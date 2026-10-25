export type ToolName = 'dot' | 'ast-grep' | 'tree-sitter' | 'nvim'
/** Absolute paths of the host tools that were found. */
export type Tools = Readonly<Partial<Record<ToolName, string>>>

declare module 'claude-code' {
  interface PluginState {
    'graph-in-pane': { tools: Shaped<Tools> }
  }
}
