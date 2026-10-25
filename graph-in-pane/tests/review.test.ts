import { expect, test } from 'claude-code/testing'

import type { Nav } from '../types'
import { SOURCE as PAIR_SOURCE } from './fixtures/pair.sexp'
import { type Engine, runCommand, stateOf, world } from './world'

// Findings from the final whole-branch review, each pinned before its fix.

const FILES = {
  '/fx': { kind: 'dir' as const },
  '/fx/pair.sh': { kind: 'file' as const, text: PAIR_SOURCE },
  '/fx/x.dot': { kind: 'file' as const, text: 'digraph x { a -> b }', mtimeMs: 5 },
}
const start = async ($: Engine) => $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
const nav = (w: ReturnType<typeof world>): Nav => stateOf<Nav>(w, 'nav') ?? { stack: [] }
const top = (w: ReturnType<typeof world>) => nav(w).stack[nav(w).stack.length - 1]
const skeleton = async ($: Engine, target: string) =>
  $.tool.call({ tool: 'mcp__graph-in-pane__graph_skeleton', target } as never)

test('review 1: graph_skeleton narrows a file#fn target to that function', async ($, on) => {
  world(on, FILES)
  await start($)
  const result = await skeleton($, '/fx/pair.sh#pick')
  expect(result.isError).toBeUndefined()
  const sk = JSON.parse(String(result.result))
  expect(sk.files[0].fns.map((fn: { name: string }) => fn.name)).toEqual(['pick'])
  expect(sk.files[0].calls.every((call: { from: string }) => call.from === 'pick')).toBe(true)
})

test('review 2: /graph-flow on a .dot file renders it as written', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await runCommand($, '10kfo', 'x.dot')
  expect([top(w)?.mode, top(w)?.error]).toEqual(['dot', null])
  expect(w.submitted).toEqual([])
})

test('review 3: a bad save of a followed .dot keeps the last picture and recovers', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await runCommand($, 'graph-tree', 'x.dot')
  const good = top(w)
  w.files['/fx/x.dot'] = { kind: 'file', text: 'digraph x { a -> }', mtimeMs: 6 }
  w.dotFails = { stderr: "Error: syntax error in line 1 near '}'" }
  await w.clock.advance(1000)
  expect([top(w)?.png, top(w)?.px, top(w)?.error]).toEqual([good?.png, good?.px, "Error: syntax error in line 1 near '}'"])
  w.files['/fx/x.dot'] = { kind: 'file', text: 'digraph x { a -> c }', mtimeMs: 7 }
  w.dotFails = null
  await w.clock.advance(1000)
  expect(top(w)?.error).toBe(null)
  expect(top(w)?.gen).toBeGreaterThan(good?.gen ?? 0)
})

test('review 4a: an unreadable subfolder is skipped, not fatal', async ($, on) => {
  const w = world(on, { ...FILES, '/fx/secret': { kind: 'dir' } })
  w.denied = ['/fx/secret']
  await start($)
  const ran = await runCommand($, 'graph-tree', '/fx')
  expect(top(w)?.error).toBe(null)
  expect(ran.text).toContain('drew fx')
})

test('review 4b: ast-grep output past the 4 MiB cut is an error in the pane', async ($, on) => {
  const w = world(on, { ...FILES, '/fx/big.sh': { kind: 'file', text: 'a() { :; }' } })
  await start($)
  await runCommand($, 'graph-tree', 'big.sh')
  expect(top(w)?.error).toContain('too large')
})

test('review 4c: a .dot that renders no png is an error in the pane', async ($, on) => {
  const w = world(on, { ...FILES, '/fx/empty.dot': { kind: 'file', text: '' } })
  w.noPng = true
  await start($)
  await runCommand($, 'graph-tree', 'empty.dot')
  expect(top(w)?.error).toContain('no png')
})

test('review 4d: a dot run that rejects (a timeout) is an error in the pane', async ($, on) => {
  const w = world(on, FILES)
  w.dotRejects = true
  await start($)
  await runCommand($, 'graph-tree', 'pair.sh')
  // The kit skips a throwing test hook, so the rejection reads "no implementation"; a timeout reads "timed out".
  expect(top(w)?.error).toContain('dot failed:')
})

test('review 4e: a directory named like a .dot file is an error, not a throw', async ($, on) => {
  const w = world(on, { ...FILES, '/fx/odd.dot': { kind: 'dir' } })
  await start($)
  await runCommand($, 'graph-tree', 'odd.dot')
  expect(top(w)?.error).not.toBe(null)
})

test('review 5: literal graphs go through unflatten so they stack instead of spreading wide', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await runCommand($, 'graph-tree', 'pair.sh')
  expect(w.runs.some(argv => argv[0] === '/bin/unflatten')).toBe(true)
  expect(w.dotInputs[w.dotInputs.length - 1]).toContain('// unflattened')
})

test('review 6: a missing dot shows the install line for the distro', async ($, on) => {
  const w = world(on, { ...FILES, '/etc/os-release': { kind: 'file', text: 'ID=arch\n' } })
  w.noDot = true
  await start($)
  await runCommand($, 'graph-tree', 'pair.sh')
  expect(top(w)?.error).toContain('pacman -S graphviz')
})

test('review 7: graph_skeleton on a dir answers per-file summaries, not every call', async ($, on) => {
  world(on, { ...FILES, '/fx/lib.sh': { kind: 'file', text: 'helper() { :; }\n' } })
  await start($)
  const result = await skeleton($, '/fx')
  const sk = JSON.parse(String(result.result))
  expect(sk.summary).toBe(true)
  expect(sk.files.map((f: { file: string }) => f.file)).toContain('/fx/pair.sh')
  expect(JSON.stringify(sk)).not.toContain('"calls"')
})
