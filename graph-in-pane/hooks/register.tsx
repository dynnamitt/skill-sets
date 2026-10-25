import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Meta, Nav, PlanState, View } from '../types'
import { redrawDot, type RenderCtx, resolveTarget, summary, treeView } from './lib/commands'
import { nvimParserDirs } from './lib/fallback'
import { hostOf } from './lib/host'
import { type NavAction, navReduce, topOf } from './lib/nav'
import { paneTree } from './lib/pane'
import { resolveTools, type Tools } from './lib/tools'

export const PANE_ID = 'graph'
const DOT_POLL_MS = 1000

// The engine reads `$.state` keys off this file's own consts, so every atom
// lives here; lib/ stays pure or takes a Host.
const EMPTY_TOOLS: Tools = {}
const EMPTY_NAV: Nav = { stack: [] }
const EMPTY_PLAN: PlanState = { active: false, source: null, latest: null }
const EMPTY_META: Meta = { cwd: '/', sessionTag: 'session', cacheDir: '/tmp/graph-in-pane', gen: 0, parserDirs: [] }

const toolsAtom = atom({ plugin: 'graph-in-pane', key: 'tools' } as const, EMPTY_TOOLS, { shape: 'tools-1' })
const navAtom = atom({ plugin: 'graph-in-pane', key: 'nav' } as const, EMPTY_NAV, { shape: 'nav-1' })
const planAtom = atom({ plugin: 'graph-in-pane', key: 'plan' } as const, EMPTY_PLAN, { shape: 'plan-1' })
const metaAtom = atom({ plugin: 'graph-in-pane', key: 'meta' } as const, EMPTY_META, { shape: 'meta-1' })

async function dispatch($: EngineInterface, action: NavAction): Promise<void> {
  await update($, navAtom, nav => navReduce(nav ?? EMPTY_NAV, action))
}

/** Puts a view in the pane and opens it; says whether a surface draws it now. */
async function showView($: EngineInterface, view: View, how: 'reset' | 'push' | 'replaceTop'): Promise<{ isPlaced: boolean }> {
  await dispatch($, { type: how, view })
  const opened = await $.ui.open({ id: PANE_ID, title: `Graph · ${view.title}` })
  return { isPlaced: opened.isPlaced }
}

/** The render context and a fresh generation number for the next png. */
async function renderCtx($: EngineInterface): Promise<{ ctx: RenderCtx; gen: number; meta: Meta }> {
  await update($, metaAtom, meta => ({ ...(meta ?? EMPTY_META), gen: (meta ?? EMPTY_META).gen + 1 }))
  const meta = await read($, metaAtom)
  const tools = await read($, toolsAtom)
  return { ctx: { tools, cacheDir: meta.cacheDir, sessionTag: meta.sessionTag, parserDirs: meta.parserDirs }, gen: meta.gen, meta }
}

async function treeCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const { ctx, gen, meta } = await renderCtx($)
  const home = (await $.env.get('HOME')) ?? ''
  const view = await treeView(hostOf($), ctx, resolveTarget(args, meta.cwd, home), gen)
  const nav = await read($, navAtom)
  await showView($, view, view.error !== null && nav.stack.length > 0 ? 'push' : 'reset')
  return { text: summary(view) }
}

async function openBox($: EngineInterface, n: number): Promise<void> {
  const top = topOf(await read($, navAtom))
  const box = top?.openable.find(o => o.n === n)
  if (top === undefined || box === undefined) return
  const { ctx, gen } = await renderCtx($)
  await showView($, await treeView(hostOf($), ctx, box.target, gen), 'push')
}

async function pollDot($: EngineInterface): Promise<void> {
  const top = topOf(await read($, navAtom))
  if (top === undefined || top.mode !== 'dot' || top.error !== null) return
  const meta = await read($, metaAtom)
  const tools = await read($, toolsAtom)
  const ctx = { tools, cacheDir: meta.cacheDir, sessionTag: meta.sessionTag, parserDirs: meta.parserDirs }
  const redrawn = await redrawDot(hostOf($), ctx, top, top.gen + 1)
  if (redrawn !== null) await dispatch($, { type: 'replaceTop', view: redrawn })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const host = hostOf($)
    const tools = await resolveTools(host, options)
    const home = (await $.env.get('HOME')) ?? ''
    const cacheDir = `${(await $.env.get('XDG_CACHE_HOME')) || `${home}/.cache`}/graph-in-pane`
    const parserDirs = tools['ast-grep'] === undefined ? await nvimParserDirs(host, tools, options) : []
    await update($, toolsAtom, () => tools)
    await update($, metaAtom, meta => ({
      cwd: e.cwd,
      sessionTag: String(Date.now()),
      cacheDir,
      gen: meta?.gen ?? 0,
      parserDirs,
    }))
    // Pngs from sessions over a day old.
    void $.process.run(['find', cacheDir, '-name', '*.png', '-mtime', '+1', '-delete'], { stdin: '' }).catch(() => undefined)
    await $.command.register({ name: 'graph-tree', description: 'Graph a file or dir literally in the graph pane', argumentHint: '<file|dir>' })
    await $.command.register({ name: '10kfv', description: '10,000 ft view: alias of /graph-tree', argumentHint: '<file|dir>' })
    await $.command.register({ name: 'graph', description: 'Reopen the graph pane (latest plan graph first); /graph off stops plan graphs', argumentHint: '[off]' })
    $.clock.every(DOT_POLL_MS, () => void pollDot($))

    return next(e)
  })

  on('command.run', { command: 'graph-tree' }, async ($, e) => treeCommand($, e.args))
  on('command.run', { command: '10kfv' }, async ($, e) => treeCommand($, e.args))

  on('command.run', { command: 'graph' }, async ($, e) => {
    if (e.args.trim() === 'off') {
      await update($, planAtom, plan => ({ ...(plan ?? EMPTY_PLAN), active: false, source: null }))
      return { text: 'graph-in-pane: plan graphs off' }
    }
    const latest = (await read($, planAtom)).latest
    if (latest !== null) await showView($, latest, 'reset')
    else await $.ui.open({ id: PANE_ID, title: 'Graph' })
    return { text: 'graph-in-pane: pane opened' }
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
