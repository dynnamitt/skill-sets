import { expect, test } from 'claude-code/testing'

import { type Host, ran } from '../hooks/lib/host'
import { fuzzyRank, isPickToken, MAX_NEAR, MAX_ROWS, nearPaths, pickable, pickRoot, rank, withDirs } from '../hooks/lib/pick'
import type { FsEntry, PromptAutocompleteInput, PromptAutocompleteResult } from 'claude-code'
import { type Engine, runCommand, world } from './world'

const DIRS = ['/w', '/w/src', '/w/src/data', '/h', '/h/entur']

const fakeHost = (run: Host['run'] = async () => ran(1)): Host => ({
  run,
  exists: async () => false,
  env: async () => undefined,
  list: async (): Promise<readonly FsEntry[]> => [],
  read: async () => '',
  bytes: async () => '',
  stat: async path => (DIRS.includes(path) ? { kind: 'dir', mtimeMs: 0 } : null),
})

test('only the argument of a path-taking command is picked', async () => {
  expect(isPickToken('/graph-flow src', 12)).toBe(true)
  expect(isPickToken('/10kfv ~/x', 7)).toBe(true)
  expect(isPickToken('/graph-flow', 1)).toBe(false)
  expect(isPickToken('/graph off', 7)).toBe(false)
  expect(isPickToken('graph-flow src', 11)).toBe(false)
})

test('a relative token is fuzzy-matched under the cwd', async () => {
  expect(await pickRoot(fakeHost(), 'veh-imp', '/w', '/h')).toEqual({ root: '/w', prefix: '', query: 'veh-imp' })
})

test('the longest existing dir in the token is the root; the rest is the query', async () => {
  expect(await pickRoot(fakeHost(), 'src/data/veh', '/w', '/h')).toEqual({ root: '/w/src/data', prefix: 'src/data/', query: 'veh' })
  expect(await pickRoot(fakeHost(), '~/entur/hat/veh', '/w', '/h')).toEqual({ root: '/h/entur', prefix: '~/entur/', query: 'hat/veh' })
})

test('a token under no dir but / picks nothing', async () => {
  expect(await pickRoot(fakeHost(), '/nope/x', '/w', '/h')).toBeNull()
})

test('files bring their parent dirs; only graphable paths stay', async () => {
  const paths = withDirs(['src/a.ts', 'src/lib/run.sh', 'README.md', 'bin/deploy']).filter(pickable)
  expect(paths).toEqual(['src/a.ts', 'src/lib/run.sh', 'bin/deploy', 'src/', 'src/lib/', 'bin/'])
})

test('the built-in matcher ranks tight subsequence matches first', async () => {
  const ranked = fuzzyRank(['src/vehicles/', 'src/data/vehicle-imports/', 'README.md', 'src/vehicle-types/'], 'vehimp')
  expect(ranked).toEqual(['src/data/vehicle-imports/'])
})

test('rank hands the query to fzf --filter when it is installed', async () => {
  const runs: string[][] = []
  const host = fakeHost(async (argv, init) => {
    runs.push([...argv])
    return ran(0, (init?.stdin ?? '').split('\n').filter(line => line.includes('imp')).join('\n'))
  })
  expect(await rank(host, '/bin/fzf', ['a/', 'imports/', 'b.ts'], 'imp')).toEqual(['imports/'])
  expect(runs).toEqual([['/bin/fzf', '--filter', 'imp']])
})

test('an empty query lists the shallowest paths first, capped', async () => {
  const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => `deep/x${i}.ts`)
  const ranked = await rank(fakeHost(), undefined, [...many, 'top/', 'a.ts'], '')
  expect(ranked.slice(0, 2)).toEqual(['a.ts', 'top/'])
  expect(ranked.length).toBe(MAX_ROWS)
})

const FILES = {
  '/fx': { kind: 'dir' as const },
  '/fx/src': { kind: 'dir' as const },
  '/fx/src/data': { kind: 'dir' as const },
}
const LS = 'src/data/vehicle-imports/run.ts\nsrc/data/vehicles/list.ts\nREADME.md\n'
// Only the engine raises it, so the kit's types leave it off $.prompt; the kit still runs the chain.
type Autocompleting = { autocomplete: (e: PromptAutocompleteInput) => Promise<PromptAutocompleteResult> }
const autocomplete = async ($: Engine, text: string): Promise<PromptAutocompleteResult> => {
  const token = text.split(/\s+/).pop() ?? ''
  return ($.prompt as unknown as Autocompleting).autocomplete({ text, cursor: text.length, token, start: text.length - token.length })
}

test('/graph-flow offers fuzzy-matched paths in the typeahead', async ($, on) => {
  const w = world(on, FILES)
  w.gitFiles = LS
  await $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
  const { suggestions } = await autocomplete($, '/graph-flow vehimp')
  expect(suggestions.map(s => s.text)).toEqual(['src/data/vehicle-imports/', 'src/data/vehicle-imports/run.ts'])
  expect(suggestions[0]?.description).toBe('dir')
})

test('a typed dir keeps its prefix in what is written', async ($, on) => {
  const w = world(on, FILES)
  w.gitFiles = 'vehicle-imports/run.ts\n'
  await $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
  const { suggestions } = await autocomplete($, '/10kfo src/data/run')
  expect(suggestions.map(s => s.text)).toEqual(['src/data/vehicle-imports/run.ts'])
})

test('other prompts get no path rows', async ($, on) => {
  world(on, FILES)
  await $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
  expect((await autocomplete($, 'graph the vehimp')).suggestions).toEqual([])
})

test('a missing path is near the fuzzy matches of its missing part, absolute', async () => {
  const list = async () => ['vehicle-imports/', 'vehicle-imports/run.ts', 'vehicles/', 'README.md']
  const near = await nearPaths(fakeHost(), undefined, '/w/src/data/vehicle-import', list)
  expect(near).toEqual(['/w/src/data/vehicle-imports', '/w/src/data/vehicle-imports/run.ts'])
  expect(near.length).toBeLessThanOrEqual(MAX_NEAR)
})

test('a /graph-flow typo names the near paths and proposes the closest as the next prompt', async ($, on) => {
  const w = world(on, FILES)
  w.gitFiles = 'vehicle-imports/run.ts\n'
  await $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
  const result = await runCommand($, 'graph-flow', 'src/data/vehicle-import')
  expect(String(result.text)).toBe('not found: /fx/src/data/vehicle-import · did you mean /fx/src/data/vehicle-imports, /fx/src/data/vehicle-imports/run.ts')
  await w.clock.advance(1)
  expect(w.suggested).toEqual(['/graph-flow /fx/src/data/vehicle-imports'])
  expect(w.submitted).toEqual([])
})

test('a /10kfv typo proposes the same command under ~ with the closest path', async ($, on) => {
  const w = world(on, { ...FILES, '/h': { kind: 'dir' as const }, '/h/src': { kind: 'dir' as const } })
  w.gitFiles = 'pair.sh\n'
  await $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
  await runCommand($, '10kfv', '~/src/pir.sh')
  await w.clock.advance(1)
  expect(w.suggested).toEqual(['/10kfv ~/src/pair.sh'])
})

test('graph_skeleton on a typo tells Claude the near paths', async ($, on) => {
  const w = world(on, FILES)
  w.gitFiles = 'vehicle-imports/run.ts\n'
  await $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })
  const result = await $.tool.call({ tool: 'mcp__graph-in-pane__graph_skeleton', target: '/fx/src/data/vehicle-imprts' } as never)
  expect(result.isError).toBe(true)
  expect(String(result.result)).toContain('did you mean /fx/src/data/vehicle-imports')
})
