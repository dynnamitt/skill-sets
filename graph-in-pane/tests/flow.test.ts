import { expect, test } from 'claude-code/testing'

import { flowRequest, SHOW_GRAPH_SCHEMA } from '../hooks/lib/flow'
import type { Nav, PlanState } from '../types'
import { SOURCE as PAIR_SOURCE } from './fixtures/pair.sexp'
import { type Engine, runCommand, stateOf, world } from './world'


const FILES = {
  '/fx': { kind: 'dir' as const },
  '/fx/pair.sh': { kind: 'file' as const, text: PAIR_SOURCE },
}
const TOOL = 'mcp__graph-in-pane__show_graph'
const start = async ($: Engine) => $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
const show = async ($: Engine, input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input } as never)
const skeleton = async ($: Engine, target: string) =>
  $.tool.call({ tool: 'mcp__graph-in-pane__graph_skeleton', target } as never)
const nav = (w: ReturnType<typeof world>): Nav => stateOf<Nav>(w, 'nav') ?? { stack: [] }
const textOf = (result: { result?: unknown; text?: string }): string => String(result.text ?? result.result ?? '')

test('the schema requires kind, title and dot', async () => {
  expect(SHOW_GRAPH_SCHEMA.required).toEqual(['kind', 'title', 'dot'])
})

test('the flow request carries the rules and names the skeleton tool', async () => {
  expect(flowRequest('/fx/pair.sh').startsWith('graph-in-pane /graph-flow request for /fx/pair.sh.')).toBe(true)
  expect(flowRequest('/fx/pair.sh')).toContain('do not invent flow')
  expect(flowRequest('/fx/pair.sh')).toContain('mcp__graph-in-pane__graph_skeleton')
})

test('graph_skeleton answers the tree-sitter skeleton as JSON', async ($, on) => {
  world(on, FILES)
  await start($)
  const result = await $.tool.call({ tool: 'mcp__graph-in-pane__graph_skeleton', target: '/fx/pair.sh' } as never)
  expect(String(result.result)).toContain('"fns"')
  expect(String(result.result)).toContain('"name":"pick"')
})

test('graph_skeleton on a missing file is an error', async ($, on) => {
  world(on, FILES)
  await start($)
  const result = await $.tool.call({ tool: 'mcp__graph-in-pane__graph_skeleton', target: '/fx/nope.sh' } as never)
  expect(result.isError).toBe(true)
})

test('after a /clear the tools and cwd are found again on first use', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  // A /clear starts a session with fresh state and no session.start.
  w.state = {}
  expect(String((await skeleton($, '/fx/pair.sh')).result)).toContain('"name":"pick"')
  expect(textOf(await show($, { kind: 'plan', title: 'plan', dot: 'digraph p { a -> b }' }))).not.toContain('not found')
  w.state = {}
  await runCommand($, 'graph-tree', 'pair.sh')
  expect(nav(w).stack.map(v => [v.target, v.error])).toEqual([['/fx/pair.sh', null]])
})

test('a flow graph is shown in the pane', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  const result = await show($, { kind: 'flow', title: 'pair', dot: 'digraph g { a -> b }', target: '/fx/pair.sh' })
  expect(textOf(result)).toBe('shown in the graph pane')
  expect(nav(w).stack.map(v => v.mode)).toEqual(['flow'])
  expect(w.dotInputs[0]).toContain('rankdir=TB')
})

test('when the pane cannot be placed, Claude and the status line say so', async ($, on) => {
  const w = world(on, FILES)
  w.placed = false
  await start($)
  const result = await show($, { kind: 'flow', title: 'pair', dot: 'digraph g { a -> b }', target: '/fx/pair.sh' })
  expect(textOf(result)).toBe('drawn; the pane is not visible (narrow terminal), the user was told to run /graph')
  expect(w.status).toContain('plan graph updated · /graph')
})

test('invalid DOT is an error for Claude and the pane keeps its graph', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await show($, { kind: 'flow', title: 'first', dot: 'digraph g { a -> b }', target: '/fx/pair.sh' })
  w.dotFails = { stderr: "Error: syntax error in line 1 near '}'\n" }
  const result = await show($, { kind: 'flow', title: 'broken', dot: 'digraph g { a -> }', target: '/fx/pair.sh' })
  expect(result.isError).toBe(true)
  expect(textOf(result).startsWith('dot failed:')).toBe(true)
  expect(nav(w).stack.map(v => v.title)).toEqual(['first'])
})

test('a plan graph does not replace a tree being browsed', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await runCommand($, 'graph-tree', 'pair.sh')
  const result = await show($, { kind: 'plan', title: 'plan', dot: 'digraph p { idea -> build }' })
  expect(textOf(result)).toBe('saved as the latest plan graph; the user is browsing another graph and was told to run /graph')
  expect(nav(w).stack.map(v => v.mode)).toEqual(['tree'])
  expect(stateOf<PlanState>(w, 'plan')?.latest?.title).toBe('plan')
  expect(w.status).toContain('plan graph updated · /graph')
})

test('/graph-flow runs no ast-grep itself; only graph_skeleton does', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await runCommand($, 'graph-flow', 'pair.sh')
  expect(w.runs.filter(argv => argv[0] === '/bin/ast-grep')).toEqual([])
})

test('/10kfo sends the skeleton to Claude and waits; the answer replaces the wait', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  const ran = await runCommand($, '10kfo', 'pair.sh')
  expect(ran.text).toContain('graph-flow: skeleton of /fx/pair.sh sent to Claude')
  expect(nav(w).stack[0]?.waiting).toBe(true)
  await w.clock.advance(1)
  expect(w.submitted.length).toBe(1)
  expect(w.submitted[0]?.startsWith('graph-in-pane /graph-flow request for /fx/pair.sh')).toBe(true)
  expect(w.submitted[0]).toContain('mcp__graph-in-pane__graph_skeleton')

  await show($, { kind: 'flow', title: 'pairing', dot: 'digraph g { scan -> pick }', target: '/fx/pair.sh' })
  expect(nav(w).stack.length).toBe(1)
  expect(nav(w).stack[0]?.waiting).toBe(false)
  expect(nav(w).stack[0]?.title).toBe('pairing')
})

test('a graph shown in the pane clears a stale plan-graph status', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await runCommand($, 'graph-tree', 'pair.sh')
  await show($, { kind: 'plan', title: 'plan', dot: 'digraph p { idea -> build }' })
  await runCommand($, 'graph', '')
  expect(w.status[w.status.length - 1]).toBeUndefined()
})

test('a flow whose DOT fails shows the error in place of the wait, and a retry replaces it', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await runCommand($, 'graph-flow', 'pair.sh')
  w.dotFails = { stderr: 'Error: syntax error\n' }
  await show($, { kind: 'flow', title: 'bad', dot: 'digraph g { a -> }', target: '/fx/pair.sh' })
  expect([nav(w).stack[0]?.waiting, nav(w).stack[0]?.error]).toEqual([false, 'Error: syntax error'])
  w.dotFails = null
  await show($, { kind: 'flow', title: 'good', dot: 'digraph g { a -> b }', target: '/fx/pair.sh' })
  expect(nav(w).stack.map(v => [v.title, v.error])).toEqual([['good', null]])
})

test('a show_graph target Claude supplies is normalized before matching the wait', async ($, on) => {
  const w = world(on, FILES)
  await start($)
  await runCommand($, 'graph-flow', 'pair.sh')
  w.dotFails = { stderr: 'Error: syntax error\n' }
  await show($, { kind: 'flow', title: 'bad', dot: 'digraph g { a -> }', target: '/fx/./pair.sh' })
  expect(nav(w).stack.map(v => [v.waiting, v.error])).toEqual([[false, 'Error: syntax error']])
  w.dotFails = null
  await show($, { kind: 'flow', title: 'good', dot: 'digraph g { a -> b }', target: '/fx/./pair.sh' })
  expect(nav(w).stack.map(v => [v.title, v.error])).toEqual([['good', null]])
})

test('a graph_skeleton failure for the awaited target shows in the pane', async ($, on) => {
  const w = world(on, { ...FILES })
  await start($)
  await runCommand($, 'graph-flow', 'pair.sh')
  delete w.files['/fx/pair.sh']
  await skeleton($, '/fx/pair.sh')
  expect([nav(w).stack[0]?.waiting, nav(w).stack[0]?.error]).toEqual([false, 'not found: /fx/pair.sh'])
})
