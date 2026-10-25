import { expect, mock, test } from 'claude-code/testing'

import { ran } from '../hooks/lib/host'

const TOOLS = { plugin: 'graph-in-pane', key: 'tools' } as const

test('session start stores the tools it found', async ($, on) => {
  mock.env(on, { HOME: '/home/u' })
  on('fs.exists', () => ({ value: false }))
  on('process.run', (_, e) => ({
    value: e.argv[2] === 'command -v dot' ? ran(0, '/usr/bin/dot\n') : ran(1),
  }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__graph-in-pane__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  const writes: Record<string, unknown> = {}
  on('state.set', (_, e, next) => {
    writes[`${e.plugin}/${e.key}`] = e.value
    return next(e)
  })

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })

  expect(writes[`${TOOLS.plugin}/${TOOLS.key}`]).toEqual({ shape: 'tools-1', value: { dot: '/usr/bin/dot' } })
})
