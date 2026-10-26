import { expect, test } from 'claude-code/testing'

import { missingRequired, toolReport } from '../hooks/lib/tools'
import { SOURCE as PAIR_SOURCE } from './fixtures/pair.sexp'
import { type Engine, runCommand, world } from './world'

const ARCH = 'ID=manjaro\nID_LIKE=arch\n'
const FILES = {
  '/fx': { kind: 'dir' as const },
  '/fx/pair.sh': { kind: 'file' as const, text: PAIR_SOURCE },
  '/etc/os-release': { kind: 'file' as const, text: ARCH },
}
const start = async ($: Engine) => $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
const show = async ($: Engine) =>
  $.tool.call({ tool: 'mcp__graph-in-pane__show_graph', kind: 'plan', title: 'p', dot: 'digraph p { a -> b }' } as never)

test('dot is required, and one of ast-grep or the tree-sitter CLI', async () => {
  expect(missingRequired({})).toEqual(['dot', 'ast-grep'])
  expect(missingRequired({ dot: '/d', 'tree-sitter': '/t' })).toEqual([])
  expect(missingRequired({ 'ast-grep': '/a' })).toEqual(['dot'])
})

test('the report names each tool, what it is for and how to install a missing one', async () => {
  const lines = toolReport({ 'ast-grep': '/usr/bin/ast-grep' }, ARCH, false)
  expect(lines).toContainEqual(expect.stringContaining('✓ ast-grep  /usr/bin/ast-grep'))
  expect(lines).toContainEqual(expect.stringMatching(/^✗ dot .*every graph.*pacman -S graphviz/))
  expect(lines).toContainEqual(expect.stringMatching(/^– fzf \(optional\).*pacman -S fzf/))
})

test('session start toasts the required tools that are missing', async ($, on) => {
  const w = world(on, FILES)
  w.noDot = true
  await start($)
  expect(w.toasts).toEqual(['graph-in-pane: dot not found · /graph check explains'])
})

test('no toast when the required tools are there', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  expect(w.toasts).toEqual([])
})

test('a tool installed mid-session is found on the next use', async ($, on) => {
  const w = world(on, FILES)
  w.noDot = true
  await start($)
  expect((await show($)).isError).toBe(true)
  w.noDot = false
  expect((await show($)).isError).not.toBe(true)
})

test('/graph check re-checks and explains every tool', async ($, on) => {
  const w = world(on, FILES)
  w.noDot = true
  await start($)
  w.noDot = false
  const { text } = await runCommand($, 'graph', 'check')
  expect(String(text)).toContain('✓ dot  /bin/dot')
  expect(String(text)).toContain('✓ ast-grep  /bin/ast-grep')
})
