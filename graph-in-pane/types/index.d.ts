export type ToolName = 'dot' | 'ast-grep' | 'tree-sitter' | 'nvim'
/** Absolute paths of the host tools that were found. */
export type Tools = Readonly<Partial<Record<ToolName, string>>>

/** A box the pane can open: `target` is an absolute file path or `${file}#${fn}`. */
export type Openable = { n: number; label: string; target: string }

export type Mode = 'tree' | 'flow' | 'plan' | 'dot'

/** One graph the pane shows, as a breadcrumb entry. */
export type View = {
  mode: Mode
  title: string
  target: string
  png: string | null
  gen: number
  px: { w: number; h: number } | null
  alt: string
  openable: Openable[]
  page: number
  error: string | null
  waiting: boolean
}

/** The breadcrumb: `stack[0]` is the root, the last entry is shown. */
export type Nav = { stack: View[] }

export type PlanState = { active: boolean; source: 'skill' | 'planmode' | null; latest: View | null }

export type Meta = { cwd: string; sessionTag: string; cacheDir: string; gen: number; parserDirs: string[] }

declare module 'claude-code' {
  interface PluginState {
    'graph-in-pane': {
      tools: Shaped<Tools>
      nav: Shaped<Nav>
      plan: Shaped<PlanState>
      meta: Shaped<Meta>
    }
  }
}
