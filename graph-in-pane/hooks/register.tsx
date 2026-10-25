import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Meta, Nav, PlanState, View } from '../types'
import { hostOf } from './lib/host'
import { type NavAction, navReduce } from './lib/nav'
import { paneTree } from './lib/pane'
import { resolveTools, type Tools } from './lib/tools'

export const PANE_ID = 'graph'

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

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const tools = await resolveTools(hostOf($), options)
    await update($, toolsAtom, () => tools)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const nav = await read($, navAtom)
    return paneTree(
      $.ui.resolve(e),
      nav,
      { surface: e.surface, bodyColumns: e.props.bodyColumns, rows: e.viewport?.rows ?? 24, isFocused: e.props.isFocused },
      {
        back: () => void dispatch($, { type: 'pop' }),
        open: () => undefined,
        more: () => void dispatch($, { type: 'page' }),
      },
    )
  })
}

// Used by later tasks' hooks; referenced here so the module keeps them.
export const internals = { showView, planAtom, metaAtom }
