import { mock, type test } from 'claude-code/testing'

import { ROWS as PAIR } from './fixtures/pair.rows'

type On = Parameters<Parameters<typeof test>[1]>[1]
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
}

/** Answers every host call the plugin makes from memory: files, ast-grep, dot, state, ui. */
export const world = (on: On, files: Record<string, FakeFile>): World => {
  const clock = mock.clock(on, { now: 1000 })
  const w: World = { files, dotInputs: [], dotFails: null, state: {}, writes: [], submitted: [], status: [], placed: true, clock }
  mock.env(on, { HOME: '/h' })
  on('fs.exists', (_, e) => ({ value: e.path in w.files }))
  on('fs.stat', (_, e) => {
    const file = w.files[e.path]
    if (file === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: { kind: file.kind, size: (file.text ?? '').length, mtimeMs: file.mtimeMs ?? 0, isLink: false } }
  })
  on('fs.list', (_, e) => ({
    value: Object.entries(w.files)
      .filter(([path]) => path.startsWith(`${e.path}/`) && !path.slice(e.path.length + 1).includes('/'))
      .map(([path, file]) => ({ name: path.slice(e.path.length + 1), kind: file.kind, size: 1, mtimeMs: file.mtimeMs ?? 0 })),
  }))
  on('fs.read', (_, e) =>
    e.as === 'bytes' ? { value: { base64: PNG_600x400 } } : { value: w.files[e.path]?.text ?? '' },
  )
  on('process.run', (_, e) => {
    const [cmd, ...rest] = e.argv
    if (cmd === 'sh') return rest[1] === 'command -v ast-grep' ? ok('/bin/ast-grep\n') : rest[1] === 'command -v dot' ? ok('/bin/dot\n') : ok('', 1)
    if (cmd === '/bin/ast-grep') {
      const file = rest[rest.length - 1] ?? ''
      return ok(file.endsWith('pair.sh') ? PAIR.map(row => JSON.stringify(row)).join('\n') : '')
    }
    if (cmd === '/bin/dot') {
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
