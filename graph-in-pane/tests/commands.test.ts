import { expect, test } from 'claude-code/testing'

import { resolveTarget } from '../hooks/lib/commands'
import type { Nav } from '../types'
import { SOURCE as PAIR_SOURCE } from './fixtures/pair.sexp'
import { type Engine, PANE, runCommand, stateOf, world } from './world'

const FILES = {
  '/fx': { kind: 'dir' as const },
  '/fx/pair.sh': { kind: 'file' as const, text: PAIR_SOURCE },
  '/fx/lib.sh': { kind: 'file' as const, text: 'helper() { :; }\n' },
  '/fx/notes.py': { kind: 'file' as const, text: 'print(1)\n' },
  '/fx/x.dot': { kind: 'file' as const, text: 'digraph x { a -> b }', mtimeMs: 5 },
}

const start = async ($: Engine) =>
  $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
const run = async ($: Engine, command: string, args: string) =>
  runCommand($, command, args)
const nav = (w: ReturnType<typeof world>): Nav => stateOf<Nav>(w, 'nav') ?? { stack: [] }

test('targets: quotes, ~ and relative paths resolve', async () => {
  expect(resolveTarget('"my dir/run.sh"', '/w', '/h')).toBe('/w/my dir/run.sh')
  expect(resolveTarget('~/x.sh', '/w', '/h')).toBe('/h/x.sh')
  expect(resolveTarget('/a/b.ts', '/w', '/h')).toBe('/a/b.ts')
})

test('a missing file shows an error and keeps the previous root', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await run($, 'graph-tree', 'pair.sh')
  const result = await run($, 'graph-tree', 'missing.sh')
  expect(nav(w).stack[0]?.title).toBe('pair.sh')
  expect(nav(w).stack[nav(w).stack.length - 1]?.error).toContain('not found')
  expect(result.text).toContain('not found')
})

test('an unsupported file says there is no grammar', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await run($, 'graph-tree', 'notes.py')
  expect(nav(w).stack[0]?.error).toContain('no grammar for .py')
})

test('a .dot file is rendered as written', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await run($, 'graph-tree', 'x.dot')
  expect(nav(w).stack[0]?.mode).toBe('dot')
  expect(w.dotInputs).toEqual(['digraph x { a -> b }'])
})

test('/10kfv draws the literal graph as the only view', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await run($, '10kfv', 'notes.py')
  await run($, '10kfv', 'pair.sh')
  expect(nav(w).stack.map(v => [v.mode, v.title])).toEqual([['tree', 'pair.sh']])
  expect(nav(w).stack[0]?.png).toMatch(/^\/h\/\.cache\/graph-in-pane\/.+\.png$/)
})

test('pressing 1 opens the numbered box', async ($, on) => {
  const w = world(on, { ...FILES, '/fx/lib.sh': FILES['/fx/lib.sh'] })
  await start($)
  await run($, 'graph-tree', 'pair.sh')
  expect(nav(w).stack[0]?.openable[0]?.target).toBe('/fx/lib.sh')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'open-1' })
  expect(nav(w).stack.map(v => v.target)).toEqual(['/fx/pair.sh', '/fx/lib.sh'])
  await ui.unmount()
})

test('a watched .dot redraws when its file changes, not before', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await run($, 'graph-tree', 'x.dot')
  const gen = nav(w).stack[0]?.gen ?? -1
  await w.clock.advance(1000)
  expect(nav(w).stack[0]?.gen).toBe(gen)
  w.files['/fx/x.dot'] = { kind: 'file', text: 'digraph x { a -> c }', mtimeMs: 9 }
  await w.clock.advance(1000)
  expect(nav(w).stack[0]?.gen).toBe(gen + 1)
  expect(w.dotInputs[w.dotInputs.length - 1]).toBe('digraph x { a -> c }')
})

test('the command line reads cleanly: no doubled plugin name, singular box', async ($, on) => {
  world(on, FILES)
  await start($)
  const result = await run($, 'graph-tree', 'pair.sh')
  expect(result.text).toBe('drew pair.sh (1 box to open)')
})
