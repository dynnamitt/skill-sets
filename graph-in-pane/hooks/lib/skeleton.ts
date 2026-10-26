export type Lang = 'bash' | 'typescript' | 'tsx' | 'javascript'
type Pos = { line: number; column: number }
export type AstRow = { ruleId: string; text: string; start: Pos; end: Pos }
export type Fn = { name: string; startLine: number; endLine: number }
/** `from` is a function name or `(top)`. */
export type Call = { from: string; to: string; line: number; kind: 'fn' | 'external' }
export type Exit = { from: string; code: number | null; line: number }
/** `resolved` is the absolute path of an own file, else null. */
export type Dep = { from: string; spec: string; resolved: string | null; line: number }
export type FileSkeleton = { file: string; lang: Lang; fns: Fn[]; calls: Call[]; exits: Exit[]; deps: Dep[] }
export type Skeleton = { root: string; files: FileSkeleton[]; omitted: number }

export const TOP = '(top)'

const EXT_LANG: Readonly<Record<string, Lang>> = {
  sh: 'bash',
  bash: 'bash',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
}

/** The language of a path by its extension; shebang detection is extract's. */
export const langOf = (path: string): Lang | null => {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? (EXT_LANG[name.slice(dot + 1)] ?? null) : null
}

type JsonRow = { ruleId: string; text: string; range: { start: Pos; end: Pos } }

/** ast-grep `--json=stream` output (or recorded rows) as AstRows. */
export const toRows = (input: string | readonly JsonRow[]): AstRow[] =>
  (typeof input === 'string'
    ? input
        .split('\n')
        .filter(line => line.trim() !== '')
        .flatMap(line => {
          try {
            return [JSON.parse(line) as JsonRow]
          } catch {
            return []
          }
        })
    : input
  ).map(row => ({ ruleId: row.ruleId, text: row.text, start: row.range.start, end: row.range.end }))

const BASH_BUILTINS: ReadonlySet<string> = new Set([
  'echo', 'printf', 'local', 'read', 'set', 'shift', 'return', 'exit', 'continue', 'break', 'test', '[',
  '[[', 'declare', 'export', 'unset', 'trap', 'eval', 'exec', 'source', '.', 'command', 'mapfile', 'cd',
  'true', 'false', 'wait', 'let', 'readonly', 'typeset',
])

const WORD = /^[A-Za-z0-9_.+-]+$/

const fnName = (lang: Lang, text: string): string =>
  lang === 'bash'
    ? text.replace(/^function\s+/, '').split(/[\s(]/)[0] ?? ''
    : (text.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/)?.[1] ?? text.split(/[\s=:]/)[0] ?? '')

/** The innermost function whose lines hold `line`, else TOP. */
const owner = (fns: readonly Fn[], line: number): string =>
  fns
    .filter(fn => fn.startLine <= line && line <= fn.endLine)
    .reduce<Fn | null>((inner, fn) => (inner === null || fn.startLine >= inner.startLine ? fn : inner), null)
    ?.name ?? TOP

const quoted = (text: string): string | null => text.match(/['"]([^'"]+)['"]\s*;?\s*$/)?.[1] ?? null

const unquoted = (text: string): string => text.replace(/^(['"])(.*)\1$/, '$2')

const specOf = (lang: Lang, row: AstRow): string | null =>
  lang === 'bash' ? unquoted(row.text.split(/\s+/)[1] ?? '') || null : quoted(row.text)

const depRows = (rows: readonly AstRow[], lang: Lang): AstRow[] =>
  rows.filter(row => row.ruleId === (lang === 'bash' ? 'source' : 'import'))

/** The dependency specs of a file, in order, for resolving before fileSkeleton. */
export const specsOf = (rows: readonly AstRow[], lang: Lang): string[] =>
  depRows(rows, lang)
    .map(row => specOf(lang, row))
    .filter((spec): spec is string => spec !== null)

/** The local names an import statement binds. */
const importedNames = (text: string): string[] => {
  const clause = text.replace(/^import\s+(type\s+)?/, '').split(/\s+from\s+/)[0] ?? ''
  const named = clause.match(/\{([^}]*)\}/)?.[1] ?? ''
  const outside = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+/, '')
  return [...outside.split(','), ...named.split(',').map(part => part.split(/\s+as\s+/).pop() ?? '')]
    .map(name => name.trim())
    .filter(name => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))
}

const bashCalls = (rows: readonly AstRow[], fns: readonly Fn[]): Call[] => {
  const defined = new Set(fns.map(fn => fn.name))
  return rows
    .filter(row => row.ruleId === 'cmd' && WORD.test(row.text) && !BASH_BUILTINS.has(row.text))
    .map(row => ({
      from: owner(fns, row.start.line),
      to: row.text,
      line: row.start.line,
      kind: defined.has(row.text) ? ('fn' as const) : ('external' as const),
    }))
}

const scriptCalls = (rows: readonly AstRow[], fns: readonly Fn[]): Call[] => {
  const defined = new Set(fns.map(fn => fn.name))
  const imported = new Set(rows.filter(row => row.ruleId === 'import').flatMap(row => importedNames(row.text)))
  return rows
    .filter(row => row.ruleId === 'call')
    .map(row => ({ row, to: row.text.split('(')[0]?.trim() ?? '' }))
    .filter(({ to }) => defined.has(to) || imported.has(to))
    .map(({ row, to }) => ({
      from: owner(fns, row.start.line),
      to,
      line: row.start.line,
      kind: defined.has(to) ? ('fn' as const) : ('external' as const),
    }))
}

/** The skeleton of one file from its ast-grep rows; `resolve` maps a spec to an own file. */
export const fileSkeleton = (
  file: string,
  lang: Lang,
  rows: readonly AstRow[],
  resolve: (spec: string) => string | null,
): FileSkeleton => {
  const fns = rows
    .filter(row => row.ruleId === 'fn')
    .map(row => ({ name: fnName(lang, row.text), startLine: row.start.line, endLine: row.end.line }))
    .filter(fn => fn.name !== '')
  const exits = rows
    .filter(row => row.ruleId === 'exit')
    .map(row => {
      const code = row.text.split(/\s+/)[1]
      return {
        from: owner(fns, row.start.line),
        code: code !== undefined && /^\d+$/.test(code) ? Number(code) : null,
        line: row.start.line,
      }
    })
  const deps = depRows(rows, lang)
    .map(row => ({ row, spec: specOf(lang, row) }))
    .filter((dep): dep is { row: AstRow; spec: string } => dep.spec !== null)
    .map(({ row, spec }) => ({ from: owner(fns, row.start.line), spec, resolved: resolve(spec), line: row.start.line }))
  const calls = lang === 'bash' ? bashCalls(rows, fns) : scriptCalls(rows, fns)
  return { file, lang, fns, calls, exits, deps }
}

/** The skeleton narrowed to one function of one file: what it calls, exits and sources. */
export const narrow = (sk: Skeleton, file: string, fn: string): Skeleton => ({
  ...sk,
  files: sk.files
    .filter(f => f.file === file)
    .map(f => ({
      ...f,
      fns: f.fns.filter(x => x.name === fn),
      calls: f.calls.filter(call => call.from === fn),
      exits: f.exits.filter(exit => exit.from === fn),
      deps: f.deps.filter(dep => dep.from === fn),
    })),
})

export type FileSummary = { file: string; lang: Lang; fns: string[]; ownDeps: string[]; externals: number; exits: (number | null)[] }

/** A dir's skeleton cut down to one line per file, so a big dir stays small for the model. */
export const summarize = (sk: Skeleton): { root: string; summary: true; omitted: number; files: FileSummary[] } => ({
  root: sk.root,
  summary: true,
  omitted: sk.omitted,
  files: sk.files.map(f => ({
    file: f.file,
    lang: f.lang,
    fns: f.fns.map(fn => fn.name),
    ownDeps: [...new Set(f.deps.flatMap(dep => (dep.resolved === null ? [] : [dep.resolved])))],
    externals: new Set(f.calls.filter(call => call.kind === 'external').map(call => call.to)).size,
    exits: [...new Set(f.exits.map(exit => exit.code))],
  })),
})
