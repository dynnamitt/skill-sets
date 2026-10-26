import { expect, test } from 'claude-code/testing'

import { EXTRACT_CONCURRENCY, listSourceFiles, MAX_FILES, MAX_LISTED, MAX_PROBE_BYTES, MAX_VISITED_DIRS, ownResolver } from '../hooks/lib/extract'
import { type Host, mapLimit } from '../hooks/lib/host'
import { fileSkeleton, langOf, langOfShebang, specsOf, toRows } from '../hooks/lib/skeleton'
import { ROWS as PAIR } from './fixtures/pair.rows'
import { ROWS as VITE } from './fixtures/vite.rows'

const pairSk = () =>
  fileSkeleton('/fx/pair.sh', 'bash', toRows(PAIR), spec => (spec === './lib.sh' ? '/fx/lib.sh' : null))

test('bash functions are found by name', async () => {
  expect(pairSk().fns.map(fn => fn.name)).toEqual(['scan', 'pick'])
})

test('a top-level call to a function is a fn call', async () => {
  expect(pairSk().calls).toContainEqual(expect.objectContaining({ from: '(top)', to: 'pick', kind: 'fn' }))
})

test('a call inside a function is attributed to it', async () => {
  expect(pairSk().calls).toContainEqual(
    expect.objectContaining({ from: 'scan', to: 'bluetoothctl', kind: 'external' }),
  )
})

test('builtins and expansions are not calls', async () => {
  const names = pairSk().calls.map(call => call.to)
  expect(names.filter(name => ['echo', 'local', 'printf', 'exit', 'read', '"$@"'].includes(name))).toEqual([])
})

test('exit codes are read, return is not an exit', async () => {
  expect(pairSk().exits.map(exit => exit.code).sort()).toEqual([0, 3])
  expect(pairSk().exits).toContainEqual(expect.objectContaining({ from: 'pick', code: 3 }))
})

test('a sourced file is a dep, resolved by the resolver', async () => {
  expect(pairSk().deps).toEqual([{ from: '(top)', spec: './lib.sh', resolved: '/fx/lib.sh', line: 2 }])
})

test('ts imports are deps; only relative ones resolve', async () => {
  const sk = fileSkeleton('/fx/vite/vite.config.ts', 'typescript', toRows(VITE), spec =>
    spec === './build/banner' ? '/fx/vite/build/banner.ts' : null,
  )
  expect(sk.deps.map(dep => [dep.spec, dep.resolved])).toEqual([
    ['vite', null],
    ['@vitejs/plugin-react', null],
    ['./build/banner', '/fx/vite/build/banner.ts'],
  ])
})

test('ts calls keep local fns and imported bindings only', async () => {
  const sk = fileSkeleton('/fx/vite/vite.config.ts', 'typescript', toRows(VITE), () => null)
  expect(sk.fns.map(fn => fn.name)).toEqual(['helper', 'mk'])
  expect(sk.calls).toContainEqual(expect.objectContaining({ from: 'mk', to: 'helper', kind: 'fn' }))
  expect(sk.calls).toContainEqual(expect.objectContaining({ from: '(top)', to: 'defineConfig', kind: 'external' }))
  expect(sk.calls.map(call => call.to)).not.toContain('String')
})

test('specs are listed before resolving', async () => {
  expect(specsOf(toRows(VITE), 'typescript')).toEqual(['vite', '@vitejs/plugin-react', './build/banner'])
})

test('languages come from the extension', async () => {
  expect(['a.sh', 'b.bash', 'c.ts', 'd.tsx', 'e.mjs', 'f.py', 'g'].map(langOf)).toEqual([
    'bash', 'bash', 'typescript', 'tsx', 'javascript', null, null,
  ])
})

test('languages come from a shebang', async () => {
  expect(['#!/bin/bash\n', '#!/usr/bin/env -S node --x\n', '#!/usr/bin/env tsx\n', '#!/usr/bin/python3\n', 'echo\n'].map(text => langOfShebang(text)))
    .toEqual(['bash', 'javascript', 'typescript', null, null])
})

const entry = (name: string, kind: 'file' | 'dir', size = 1) => ({ name, kind, size, mtimeMs: 0, isLink: false })

const treeHost = (tree: Record<string, ReturnType<typeof entry>[]>, files: readonly string[] = [], texts: Readonly<Record<string, string>> = {}): Host => ({
  run: async () => ({ exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }),
  exists: async path => files.includes(path) || path in tree,
  env: async () => undefined,
  list: async dir => tree[dir] ?? [],
  read: async path => texts[path] ?? '',
  bytes: async () => '',
  stat: async path =>
    files.includes(path) ? { kind: 'file', mtimeMs: 0 } : path in tree ? { kind: 'dir', mtimeMs: 0 } : null,
})

test('a big dir skips ignored folders and caps at 200 files', async () => {
  const many = Array.from({ length: 250 }, (_, i) => entry(`m${String(i).padStart(3, '0')}.ts`, 'file'))
  const host = treeHost({
    '/p': [entry('node_modules', 'dir'), entry('.git', 'dir'), entry('dist', 'dir'), entry('src', 'dir'), ...many],
    '/p/node_modules': [entry('x.ts', 'file')],
    '/p/src': [entry('run.sh', 'file'), entry('notes.md', 'file')],
  })
  const { files, omitted } = await listSourceFiles(host, '/p')
  expect(files.length).toBe(200)
  expect(omitted).toBe(51)
  expect(files.filter(f => f.path.includes('node_modules'))).toEqual([])
})

test('mapLimit with a limit of 0 still maps every item', async () => {
  expect(await mapLimit([1, 2, 3], 0, async n => n + 1)).toEqual([2, 3, 4])
})

test('the walk lists at most MAX_VISITED_DIRS dirs and says it was cut short', async () => {
  const dirs = Array.from({ length: 600 }, (_, i) => `d${String(i).padStart(3, '0')}`)
  const tree = Object.fromEntries([
    ['/p', dirs.map(d => entry(d, 'dir'))],
    ...dirs.map(d => [`/p/${d}`, [entry('notes.md', 'file')]] as const),
  ])
  const listed: string[] = []
  const base = treeHost(tree)
  const result = await listSourceFiles({ ...base, list: async dir => (listed.push(dir), base.list(dir)) }, '/p')
  expect(listed.length).toBeLessThanOrEqual(MAX_VISITED_DIRS)
  expect(result.truncated).toBe(true)
})

test('a big extension-less file is not probed for a shebang', async () => {
  const reads: string[] = []
  const base = treeHost(
    { '/p': [entry('big', 'file', MAX_PROBE_BYTES + 1), entry('small', 'file')] },
    [],
    { '/p/big': '#!/bin/bash\n', '/p/small': '#!/bin/bash\n' },
  )
  const { files } = await listSourceFiles({ ...base, read: async path => (reads.push(path), base.read(path)) }, '/p')
  expect(files.map(f => f.path)).toEqual(['/p/small'])
  expect(reads).toEqual(['/p/small'])
})

test('mapLimit keeps order and never runs more than the limit', async () => {
  let live = 0, peak = 0
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async n => { peak = Math.max(peak, ++live); await Promise.resolve(); live--; return n * 10 })
  expect([out, peak]).toEqual([[10, 20, 30, 40, 50, 60], 2])
})

test('the walk stops listing once MAX_LISTED files are found', async () => {
  const dirs = Array.from({ length: 30 }, (_, i) => `d${String(i).padStart(2, '0')}`)
  const tree = Object.fromEntries([
    ['/p', dirs.map(d => entry(d, 'dir'))],
    ...dirs.map(d => [`/p/${d}`, Array.from({ length: 100 }, (_, i) => entry(`f${String(i).padStart(3, '0')}.ts`, 'file'))] as const),
  ])
  const listed: string[] = []
  const base = treeHost(tree)
  const { files, omitted } = await listSourceFiles({ ...base, list: async dir => (listed.push(dir), base.list(dir)) }, '/p')
  expect([files.length, omitted, listed.length < 30]).toEqual([MAX_FILES, MAX_LISTED - MAX_FILES, true])
})

test('shebang probes in a dir run at most EXTRACT_CONCURRENCY at once', async () => {
  const names = Array.from({ length: 40 }, (_, i) => `script${String(i).padStart(2, '0')}`)
  let live = 0, peak = 0
  const base = treeHost({ '/p': names.map(n => entry(n, 'file')) })
  const host: Host = {
    ...base,
    read: async () => { peak = Math.max(peak, ++live); await new Promise(r => setTimeout(r, 1)); live--; return '#!/bin/sh\n' },
  }
  const { files } = await listSourceFiles(host, '/p')
  expect([files.length, peak <= EXTRACT_CONCURRENCY, peak > 1]).toEqual([MAX_FILES > 40 ? 40 : MAX_FILES, true, true])
})

test('a dir walk lists extension-less shebang scripts and skips plain files', async () => {
  const host = treeHost(
    { '/p': [entry('LICENSE', 'file'), entry('deploy', 'file'), entry('a.ts', 'file')] },
    [],
    { '/p/deploy': '#!/usr/bin/env bash\necho hi\n', '/p/LICENSE': 'MIT\n' },
  )
  expect((await listSourceFiles(host, '/p')).files).toEqual([
    { path: '/p/a.ts', lang: 'typescript' },
    { path: '/p/deploy', lang: 'bash' },
  ])
})

test('relative specs resolve to existing own files with extensions', async () => {
  const resolve = ownResolver(treeHost({}, ['/fx/vite/build/banner.ts', '/fx/lib.sh']))
  expect(await resolve('/fx/vite/vite.config.ts', './build/banner')).toBe('/fx/vite/build/banner.ts')
  expect(await resolve('/fx/pair.sh', './lib.sh')).toBe('/fx/lib.sh')
  expect(await resolve('/fx/vite/vite.config.ts', 'vite')).toBe(null)
  expect(await resolve('/fx/pair.sh', '$CONF')).toBe(null)
  expect(await resolve('/fx/a.ts', './node_modules/x')).toBe(null)
})

test('a dir import resolves to its index, and a .js spec to its .ts source', async () => {
  const resolve = ownResolver(treeHost({ '/p/lib': [] }, ['/p/lib/index.ts', '/p/foo.ts', '/p/bar.js']))
  expect(await resolve('/p/a.ts', './lib')).toBe('/p/lib/index.ts')
  expect(await resolve('/p/a.ts', './foo.js')).toBe('/p/foo.ts')
  expect(await resolve('/p/a.ts', './bar.js')).toBe('/p/bar.js')
})

test('a quoted bash source path is unquoted before resolving', async () => {
  const at = { line: 0, column: 0 }
  const rows = ['source "./lib.sh"', ". './lib.sh'"].map(text => ({ ruleId: 'source', text, start: at, end: at }))
  expect(specsOf(rows, 'bash')).toEqual(['./lib.sh', './lib.sh'])
})
