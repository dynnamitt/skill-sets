import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

import { hostOf } from './lib/host'
import { resolveTools, type Tools } from './lib/tools'

// The engine reads `$.state` keys off this file's own consts, so every atom
// lives here; lib/ stays pure or takes a Host.
const EMPTY_TOOLS: Tools = {}
const toolsAtom = atom({ plugin: 'graph-in-pane', key: 'tools' } as const, EMPTY_TOOLS, {
  shape: 'tools-1',
})

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const tools = await resolveTools(hostOf($), options)
    await update($, toolsAtom, () => tools)

    return next(e)
  })
}
