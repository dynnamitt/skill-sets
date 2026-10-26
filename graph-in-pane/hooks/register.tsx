import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hints, Meta, Nav, PlanState, View } from '../types'
import { flowCheck, redrawDot, type RenderCtx, renderView, resolveTarget, skeletonOf, summary, treeView } from './lib/commands'
import { styleDot } from './lib/dot'
import { isFailure } from './lib/extract'
import { nvimParserDirs } from './lib/fallback'
import {
  flowRequest,
  flowSummary,
  parseShowGraph,
  RESULT,
  SHOW_GRAPH,
  SHOW_GRAPH_DESCRIPTION,
  SHOW_GRAPH_SCHEMA,
  SKELETON,
  SKELETON_DESCRIPTION,
  SKELETON_SCHEMA,
  waitingView,
} from './lib/flow'
import { hostOf } from './lib/host'
import { emptyView, type NavAction, navReduce, topOf } from './lib/nav'
import { paneTree } from './lib/pane'
import { isPlanningSkill, PLAN_SECTION_ID, PLAN_TEXT, type PlanEvent, planTransition } from './lib/plan'
import { installHint, resolveTools, type Tools } from './lib/tools'
import { narrow, summarize } from './lib/skeleton'

export const PANE_ID = 'graph'
const DOT_POLL_MS = 1000

// The engine reads `$.state` keys off this file's own consts, so every atom
// lives here; lib/ stays pure or takes a Host.
const EMPTY_TOOLS: Tools = {}
const EMPTY_NAV: Nav = { stack: [] }
const EMPTY_PLAN: PlanState = { active: false, source: null, latest: null }
const EMPTY_HINTS: Hints = { dot: 'dot not found (install Graphviz)', astGrep: 'ast-grep not found' }
const EMPTY_META: Meta = { cwd: '/', sessionTag: 'session', cacheDir: '/tmp/graph-in-pane', gen: 0, parserDirs: [], hints: EMPTY_HINTS }

const toolsAtom = atom({ plugin: 'graph-in-pane', key: 'tools' } as const, EMPTY_TOOLS, { shape: 'tools-1' })
const navAtom = atom({ plugin: 'graph-in-pane', key: 'nav' } as const, EMPTY_NAV, { shape: 'nav-1' })
const planAtom = atom({ plugin: 'graph-in-pane', key: 'plan' } as const, EMPTY_PLAN, { shape: 'plan-1' })
const metaAtom = atom({ plugin: 'graph-in-pane', key: 'meta' } as const, EMPTY_META, { shape: 'meta-1' })

async function planEvent($: EngineInterface, event: PlanEvent): Promise<void> {
  await update($, planAtom, plan => planTransition(plan ?? EMPTY_PLAN, event))
}

async function dispatch($: EngineInterface, action: NavAction): Promise<void> {
  await update($, navAtom, nav => navReduce(nav ?? EMPTY_NAV, action))
}

/** Puts a view in the pane and opens it; says whether a surface draws it now. */
async function showView($: EngineInterface, view: View, how: 'reset' | 'push' | 'replaceTop'): Promise<{ isPlaced: boolean }> {
  await dispatch($, { type: how, view })
  const opened = await $.ui.open({ id: PANE_ID, title: `Graph · ${view.title}` })
  // A graph on screen makes an earlier "plan graph updated · /graph" stale.
  if (opened.isPlaced) $.ui.status(undefined)
  return { isPlaced: opened.isPlaced }
}

/** The render context and a fresh generation number for the next png. */
async function renderCtx($: EngineInterface): Promise<{ ctx: RenderCtx; gen: number; meta: Meta }> {
  await update($, metaAtom, meta => ({ ...(meta ?? EMPTY_META), gen: (meta ?? EMPTY_META).gen + 1 }))
  const meta = await read($, metaAtom)
  const tools = await read($, toolsAtom)
  return { ctx: ctxOf(meta, tools), gen: meta.gen, meta }
}

function ctxOf(meta: Meta, tools: Tools): RenderCtx {
  return { tools, cacheDir: meta.cacheDir, sessionTag: meta.sessionTag, parserDirs: meta.parserDirs, hints: meta.hints ?? EMPTY_HINTS }
}

async function targetOf($: EngineInterface, args: string): Promise<string> {
  const meta = await read($, metaAtom)
  const home = (await $.env.get('HOME')) ?? ''
  return resolveTarget(args, meta.cwd, home)
}

async function treeCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  return treeTarget($, await targetOf($, args))
}

async function treeTarget($: EngineInterface, target: string): Promise<{ text: string }> {
  const { ctx, gen } = await renderCtx($)
  const view = await treeView(hostOf($), ctx, target, gen)
  const nav = await read($, navAtom)
  await showView($, view, view.error !== null && nav.stack.length > 0 ? 'push' : 'reset')
  return { text: summary(view) }
}

/** Extracts a target's skeleton, shows a waiting view and asks Claude for its flow graph. */
async function flowAsk($: EngineInterface, target: string, how: 'reset' | 'push'): Promise<{ text: string }> {
  const [file = target] = target.split('#')
  const checked = await flowCheck(hostOf($), file)
  if (isFailure(checked)) {
    const view = { ...emptyView('flow', file, target), error: checked.error }
    await showView($, view, (await read($, navAtom)).stack.length > 0 ? 'push' : how)
    return { text: summary(view) }
  }
  await showView($, waitingView(target), how)
  // A command hook holds the turn; the submit runs once it has returned.
  $.clock.after(0, () => void $.prompt.submit({ text: flowRequest(target) }))
  return { text: flowSummary(target, checked.files) }
}

async function flowCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const target = await targetOf($, args)
  // A .dot file is drawn as written by either command.
  return target.endsWith('.dot') ? treeTarget($, target) : flowAsk($, target, 'reset')
}

async function openBox($: EngineInterface, n: number): Promise<void> {
  const top = topOf(await read($, navAtom))
  const box = top?.openable.find(o => o.n === n)
  if (top === undefined || box === undefined) return
  if (top.mode === 'flow') {
    await flowAsk($, box.target, 'push')
    return
  }
  const { ctx, gen } = await renderCtx($)
  await showView($, await treeView(hostOf($), ctx, box.target, gen), 'push')
}

/** Whether the top view is a flow pane waiting on (or showing a failure for) this target. */
function awaitsFlow(top: View | undefined, target: string): boolean {
  return top !== undefined && top.mode === 'flow' && top.target === target && (top.waiting || top.error !== null)
}

/** Replaces the waiting flow view for a target with the error that ended the wait. */
async function failWaiting($: EngineInterface, target: string, error: string): Promise<void> {
  const top = topOf(await read($, navAtom))
  if (top !== undefined && awaitsFlow(top, target)) await dispatch($, { type: 'replaceTop', view: { ...top, waiting: false, error } })
}

/** Serves graph_skeleton: the tree-sitter skeleton of a file or dir, as JSON. */
async function handleSkeleton($: EngineInterface, input: Record<string, unknown>) {
  const meta = await read($, metaAtom)
  const tools = await read($, toolsAtom)
  const target = await targetOf($, typeof input.target === 'string' ? input.target : '')
  const [file = '', fn] = target.split('#')
  const extracted = await skeletonOf(hostOf($), ctxOf(meta, tools), file)
  if (isFailure(extracted)) {
    await failWaiting($, target, extracted.error)
    return { isError: true as const, result: extracted.error, text: extracted.error }
  }
  const { sk, isDir } = extracted
  // A file#fn target answers that function alone; a dir answers one line per file.
  const answer = fn !== undefined && fn !== '' ? narrow(sk, file, fn) : isDir ? summarize(sk) : sk
  return { result: JSON.stringify(answer) }
}

/** Serves show_graph: renders Claude's DOT and routes it to the pane by kind. */
async function handleShowGraph($: EngineInterface, input: Record<string, unknown>) {
  const parsed = parseShowGraph(input)
  if (typeof parsed === 'string') return { isError: true as const, result: parsed, text: parsed }
  const { ctx, gen } = await renderCtx($)
  const base = { ...emptyView(parsed.kind, parsed.title, parsed.target), openable: parsed.openable }
  const view = await renderView(hostOf($), ctx, base, styleDot(parsed.dot), gen)
  if (view.error !== null) {
    const text = `dot failed: ${view.error}`
    if (parsed.kind === 'flow') await failWaiting($, parsed.target, view.error)
    return { isError: true as const, result: text, text }
  }
  const nav = await read($, navAtom)
  const top = topOf(nav)
  if (parsed.kind === 'plan') {
    await update($, planAtom, plan => ({ ...(plan ?? EMPTY_PLAN), latest: view }))
    if (nav.stack.length > 0 && nav.stack[0]?.mode !== 'plan') {
      $.ui.status(RESULT.status)
      return { result: RESULT.stored }
    }
  }
  const how = parsed.kind === 'flow' && awaitsFlow(top, parsed.target) ? 'replaceTop' : 'reset'
  const { isPlaced } = await showView($, view, how)
  if (!isPlaced) $.ui.status(RESULT.status)
  return { result: isPlaced ? RESULT.shown : RESULT.hidden }
}

async function pollDot($: EngineInterface): Promise<void> {
  const top = topOf(await read($, navAtom))
  // Keeps polling under an error too, so fixing the file brings the picture back.
  if (top === undefined || top.mode !== 'dot') return
  const ctx = ctxOf(await read($, metaAtom), await read($, toolsAtom))
  const redrawn = await redrawDot(hostOf($), ctx, top, async () => (await renderCtx($)).gen).catch(() => null)
  if (redrawn !== null) await dispatch($, { type: 'replaceIf', was: top, view: redrawn })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const host = hostOf($)
    const tools = await resolveTools(host, options)
    const home = (await $.env.get('HOME')) ?? ''
    const cacheDir = `${(await $.env.get('XDG_CACHE_HOME')) || `${home}/.cache`}/graph-in-pane`
    const parserDirs = tools['ast-grep'] === undefined ? await nvimParserDirs(host, tools, options) : []
    const osRelease = await host.read('/etc/os-release').catch(() => '')
    const hasBrew = (await host.run(['sh', '-c', 'command -v brew'], { stdin: '' }).catch(() => ({ exitCode: 1 }))).exitCode === 0
    const hints: Hints = { dot: installHint(osRelease, hasBrew, 'dot'), astGrep: installHint(osRelease, hasBrew, 'ast-grep') }
    await update($, toolsAtom, () => tools)
    await update($, metaAtom, meta => ({
      cwd: e.cwd,
      sessionTag: String(Date.now()),
      cacheDir,
      gen: meta?.gen ?? 0,
      parserDirs,
      hints,
    }))
    // Pngs from sessions over a day old.
    void $.process.run(['find', cacheDir, '-name', '*.png', '-mtime', '+1', '-delete'], { stdin: '' }).catch(() => undefined)
    await $.command.register({ name: 'graph-tree', description: 'Graph a file or dir literally in the graph pane', argumentHint: '<file|dir>' })
    await $.command.register({ name: '10kfv', description: '10,000 ft view: alias of /graph-tree', argumentHint: '<file|dir>' })
    await $.command.register({ name: 'graph-flow', description: '10,000 ft flow of a file or dir, drawn by Claude in the graph pane', argumentHint: '<file|dir>' })
    await $.command.register({ name: '10kfo', description: '10,000 ft overview: alias of /graph-flow', argumentHint: '<file|dir>' })
    await $.tool.register({ name: SKELETON, description: SKELETON_DESCRIPTION, inputSchema: SKELETON_SCHEMA, isDeferred: false })
    await $.tool.register({ name: SHOW_GRAPH, description: SHOW_GRAPH_DESCRIPTION, inputSchema: SHOW_GRAPH_SCHEMA, isDeferred: false })
    await $.command.register({ name: 'graph', description: 'Reopen the graph pane (latest plan graph first); /graph off stops plan graphs', argumentHint: '[off]' })
    // One poll at a time: a slow dot run must not be raced by the next tick.
    let isPolling = false
    $.clock.every(DOT_POLL_MS, () => {
      if (isPolling) return
      isPolling = true
      void pollDot($).finally(() => {
        isPolling = false
      })
    })

    return next(e)
  })

  on('command.run', { command: 'graph-tree' }, async ($, e) => treeCommand($, e.args))
  on('command.run', { command: '10kfv' }, async ($, e) => treeCommand($, e.args))

  on('command.run', { command: 'graph-flow' }, async ($, e) => flowCommand($, e.args))
  on('command.run', { command: '10kfo' }, async ($, e) => flowCommand($, e.args))

  on('tool.call', { tool: 'mcp__graph-in-pane__graph_skeleton' }, async ($, e) => handleSkeleton($, e as Record<string, unknown>))

  on('tool.call', { tool: 'mcp__graph-in-pane__show_graph' }, async ($, e) => handleShowGraph($, e as Record<string, unknown>))

  on('command.run', { command: 'graph' }, async ($, e) => {
    if (e.args.trim() === 'off') {
      await planEvent($, { type: 'off' })
      return { text: 'plan graphs off' }
    }
    const latest = (await read($, planAtom)).latest
    if (latest !== null) await showView($, latest, 'reset')
    else await $.ui.open({ id: PANE_ID, title: 'Graph' })
    return { text: 'pane opened' }
  })

  on('skill.prompt', async ($, e, next) => {
    if (isPlanningSkill(e.skill)) await planEvent($, { type: 'skill' })
    return next(e)
  })

  on('tool.call', { tool: 'EnterPlanMode' }, async ($, e, next) => {
    const ran = await next(e)
    await planEvent($, { type: 'enterPlanTool' })
    return ran
  })

  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    const ran = await next(e)
    await planEvent($, { type: 'exitPlanTool' })
    return ran
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await planEvent($, { type: 'permissionMode', mode: e.permission_mode })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await planEvent($, { type: 'clear' })
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const plan = await read($, planAtom)
    return plan.active
      ? { ...composed, sections: [...composed.sections, { id: PLAN_SECTION_ID, text: PLAN_TEXT, scope: 'session' as const }] }
      : composed
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const nav = await read($, navAtom)
    return paneTree(
      $.ui.resolve(e),
      nav,
      { surface: e.surface, bodyColumns: e.props.bodyColumns, rows: e.viewport?.rows ?? 24, isFocused: e.props.isFocused },
      {
        back: () => void dispatch($, { type: 'pop' }),
        open: n => void openBox($, n),
        more: () => void dispatch($, { type: 'page' }),
      },
    )
  })
}
