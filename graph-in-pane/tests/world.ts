import { mock, type TestBody } from 'claude-code/testing'

import { ROWS as PAIR } from './fixtures/pair.rows'

export type Engine = Parameters<TestBody>[0]
export type On = Parameters<TestBody>[1]
export type FakeFile = { kind: 'file' | 'dir'; text?: string; mtimeMs?: number }

// A PNG signature and IHDR for a 600x400 picture.
export const PNG_600x400 = btoa(
  String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 88, 0, 0, 1, 144),
)

const ok = (stdout = '', exitCode = 0, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

export type World = {
  files: Record<string, FakeFile>
  dotInputs: string[]
  dotFails: { stderr: string } | null
  state: Record<string, { value: unknown; version: number }>
  writes: { key: string; value: unknown }[]
  submitted: string[]
  status: (string | undefined)[]
  placed: boolean
  clock: ReturnType<typeof mock.clock>
  /** Dirs whose listing fails with EACCES. */
  denied: string[]
  /** Leave dot off PATH. */
  noDot: boolean
  /** dot's run rejects, as a timeout does. */
  dotRejects: boolean
  /** dot exits 0 but writes no png. */
  noPng: boolean
  /** Every argv the plugin ran. */
  runs: string[][]
  /** Runs once inside the next dot run, then clears itself. */
  beforeDot: (() => Promise<void>) | null
  /** What `git ls-files` prints; null fails it, as outside a repo. */
  gitFiles: string | null
  /** Texts proposed as the prompt box's dim suggestion. */
  suggested: string[]
  /** Texts shown as toasts. */
  toasts: string[]
}

/** Answers every host call the plugin makes from memory: files, ast-grep, dot, state, ui. */
export const world = (on: On, files: Record<string, FakeFile>): World => {
  const clock = mock.clock(on, { now: 1000 })
  const w: World = {
    files, dotInputs: [], dotFails: null, state: {}, writes: [], submitted: [], status: [], placed: true, clock,
    denied: [], noDot: false, dotRejects: false, noPng: false, runs: [], beforeDot: null, gitFiles: null, suggested: [], toasts: [],
  }
  mock.env(on, { HOME: '/h' })
  on('fs.exists', (_, e) => ({ value: e.path in w.files }))
  on('fs.stat', (_, e) => {
    const file = w.files[e.path]
    if (file === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: { kind: file.kind, size: (file.text ?? '').length, mtimeMs: file.mtimeMs ?? 0, isLink: false } }
  })
  on('fs.list', (_, e) => {
    if (w.denied.includes(e.path)) throw new Error(`EACCES: ${e.path}`)
    return { value: Object.entries(w.files)
      .filter(([path]) => path.startsWith(`${e.path}/`) && !path.slice(e.path.length + 1).includes('/'))
      .map(([path, file]) => ({ name: path.slice(e.path.length + 1), kind: file.kind, size: 1, mtimeMs: file.mtimeMs ?? 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    if (e.as === 'bytes') {
      if (w.noPng) throw new Error(`ENOENT: ${e.path}`)
      return { value: { base64: PNG_600x400 } }
    }
    const file = w.files[e.path]
    if (file === undefined || file.kind === 'dir') throw new Error(`EISDIR or ENOENT: ${e.path}`)
    return { value: file.text ?? '' }
  })
  on('process.run', async (_, e) => {
    const [cmd, ...rest] = e.argv
    w.runs.push([...e.argv])
    if (cmd === 'sh') {
      const found: Record<string, string> = { 'ast-grep': '/bin/ast-grep', unflatten: '/bin/unflatten', ...(w.noDot ? {} : { dot: '/bin/dot' }) }
      const name = (rest[1] ?? '').replace('command -v ', '')
      return name in found ? ok(`${found[name]}\n`) : ok('', 1)
    }
    if (cmd === '/bin/ast-grep') {
      const file = rest[rest.length - 1] ?? ''
      if (file.endsWith('big.sh')) return { value: { exitCode: 0, stdout: '{"ruleId":"fn","text":"a() {', stderr: '', isStdoutTruncated: true, isStderrTruncated: false } }
      return ok(file.endsWith('pair.sh') ? PAIR.map(row => JSON.stringify(row)).join('\n') : '')
    }
    if (cmd === 'git') return w.gitFiles === null ? ok('', 128) : ok(w.gitFiles)
    if (cmd === '/bin/unflatten') return ok(`${e.init?.stdin ?? ''}\n// unflattened`)
    if (cmd === '/bin/dot') {
      const before = w.beforeDot
      w.beforeDot = null
      await before?.()
      if (w.dotRejects) throw new Error('timed out after 15000 ms')
      w.dotInputs.push(e.init?.stdin ?? '')
      return w.dotFails === null ? ok() : ok('', 1, w.dotFails.stderr)
    }
    return ok()
  })
  on('state.get', (_, e) => ({ value: w.state[e.key] ?? { value: undefined, version: 0 } }))
  on('state.set', (_, e) => {
    const current = w.state[e.key]?.version ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== current) return { value: { isSet: false, version: current } }
    w.state[e.key] = { value: e.value, version: current + 1 }
    w.writes.push({ key: e.key, value: e.value })
    return { value: { isSet: true, version: current + 1 } }
  })
  on('ui.open', () => ({ value: w.placed ? { isPlaced: true } : { isPlaced: false, reason: 'narrow terminal' } }))
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    w.status.push(e.text)
    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__graph-in-pane__${e.name}` } }))
  on('prompt.submit', (_, e) => {
    w.submitted.push([e.text, ...(e.context ?? [])].join('\n'))
    return { text: e.text }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/fx' }))
  on('prompt.suggest', (_, e) => {
    w.suggested.push(e.text)
    return { isShown: true }
  })
  // Core adds no rows of its own.
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  return w
}

/** The value an atom holds in the fake state, unwrapped from its shape tag. */
export const stateOf = <T>(w: World, key: string): T | undefined =>
  (w.state[key]?.value as { value?: T } | undefined)?.value

export const PANE = {
  plugin: 'graph-in-pane',
  component: 'Pane',
  requestId: 'graph',
  props: { title: 'graph', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

/** Runs a slash command as the person would; the engine stamps origin and presentation. */
export const runCommand = async ($: Engine, command: string, args: string) => $.command.run({ command, args } as never)
