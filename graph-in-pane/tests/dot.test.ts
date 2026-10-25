import { expect, test } from 'claude-code/testing'

import { altOutline, fitBox, pngPath, styleDot, treeGraph } from '../hooks/lib/dot'
import { renderPng } from '../hooks/lib/render'
import { type FileSkeleton, fileSkeleton, toRows } from '../hooks/lib/skeleton'
import { ROWS as PAIR } from './fixtures/pair.rows'

const pair = (resolveLib: boolean): FileSkeleton =>
  fileSkeleton('/fx/pair.sh', 'bash', toRows(PAIR), spec => (resolveLib && spec === './lib.sh' ? '/fx/lib.sh' : null))
const single = (file: FileSkeleton) => ({ root: '/fx', files: [file], omitted: 0 })
const node = (dot: string, id: string): string => dot.split('\n').find(line => line.trim().startsWith(`"${id}" [`)) ?? ''

test('styleDot puts the shared style before the graph body', async () => {
  const dot = styleDot('digraph g { a -> b }')
  expect(dot).toContain('rankdir=TB')
  expect(dot).toContain('bgcolor="#1e1e2e"')
  expect(dot.indexOf('rankdir')).toBeLessThan(dot.indexOf('a -> b'))
})

test('exits are ovals: green for 0, red otherwise', async () => {
  const { dot } = treeGraph(single(pair(true)))
  expect(node(dot, 'exit:0')).toMatch(/shape=oval.*color="#a6e3a1"/)
  expect(node(dot, 'exit:3')).toMatch(/shape=oval.*color="#f38ba8"/)
})

test('external commands are cylinders', async () => {
  expect(node(treeGraph(single(pair(true))).dot, 'ext:bluetoothctl')).toContain('shape=cylinder')
})

test('own-file deps are the openable boxes', async () => {
  const { dot, openable } = treeGraph(single(pair(true)))
  expect(openable).toEqual([{ n: 1, label: 'lib.sh', target: '/fx/lib.sh' }])
  expect(node(dot, 'dep:./lib.sh')).toContain('① lib.sh')
})

test('without own deps, big functions are openable, largest first', async () => {
  const { dot, openable } = treeGraph(single(pair(false)))
  expect(openable).toEqual([{ n: 1, label: 'pick', target: '/fx/pair.sh#pick' }])
  expect(node(dot, 'fn:pick')).toContain('① pick')
})

test('more than 12 external commands collapse into one node', async () => {
  const base = pair(false)
  const calls = Array.from({ length: 15 }, (_, i) => ({ from: '(top)', to: `tool${i}`, line: 30 + i, kind: 'external' as const }))
  const { dot } = treeGraph(single({ ...base, calls: [...base.calls, ...calls] }))
  expect(dot).toContain('+5 more')
})

test('a function focus draws only that function', async () => {
  const { dot } = treeGraph(single(pair(false)), '/fx/pair.sh#pick')
  expect(node(dot, 'exit:3')).not.toBe('')
  expect(node(dot, 'ext:bluetoothctl')).toBe('')
})

test('a dir graph has a node per file, dep edges and a +N more node', async () => {
  const lib: FileSkeleton = { file: '/fx/lib.sh', lang: 'bash', fns: [], calls: [], exits: [], deps: [] }
  const { dot, openable } = treeGraph({ root: '/fx', files: [pair(true), lib], omitted: 4 })
  expect(node(dot, 'file:/fx/pair.sh')).toContain('pair.sh')
  expect(dot).toContain('"file:/fx/pair.sh" -> "file:/fx/lib.sh"')
  expect(dot).toContain('+4 more files')
  expect(openable.map(o => o.target)).toEqual(['/fx/pair.sh', '/fx/lib.sh'])
})

test('the alt outline starts with the first node label', async () => {
  const { dot } = treeGraph(single(pair(true)))
  expect(altOutline(dot).startsWith('pair.sh')).toBe(true)
  expect(altOutline(dot).length).toBeLessThanOrEqual(400)
})

test('fitBox keeps the aspect ratio with cells twice as tall as wide', async () => {
  expect(fitBox({ w: 600, h: 900 }, { columns: 40, rows: 30 })).toEqual({ columns: 40, rows: 30 })
  expect(fitBox({ w: 900, h: 300 }, { columns: 40, rows: 30 })).toEqual({ columns: 40, rows: 7 })
  expect(fitBox({ w: 300, h: 900 }, { columns: 40, rows: 30 })).toEqual({ columns: 20, rows: 30 })
})

test('each session gets its own png', async () => {
  expect(pngPath('/c', 's1')).not.toBe(pngPath('/c', 's2'))
})

const PNG_HEADER_600x400 = btoa(
  String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 88, 0, 0, 1, 144),
)

const renderHost = (dotResult: { exitCode: number; stderr: string }, log: string[][] = []) => ({
  run: async (argv: readonly string[]) => {
    log.push([...argv])
    return argv[0] === 'mkdir'
      ? { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
      : { ...dotResult, stdout: '', isStdoutTruncated: false, isStderrTruncated: false }
  },
  exists: async () => true,
  env: async () => undefined,
  list: async () => [],
  read: async () => '',
  bytes: async () => PNG_HEADER_600x400,
  stat: async () => null,
})

test('a dot failure reports its first stderr line', async () => {
  const host = renderHost({ exitCode: 1, stderr: "Error: syntax error in line 1 near 'x'\nmore" })
  expect(await renderPng(host, { dot: '/usr/bin/dot' }, 'digraph {', '/c/s.png')).toEqual({
    ok: false,
    error: "Error: syntax error in line 1 near 'x'",
  })
})

test('a rendered png reports its pixel size', async () => {
  const log: string[][] = []
  const result = await renderPng(renderHost({ exitCode: 0, stderr: '' }, log), { dot: '/usr/bin/dot' }, 'digraph {}', '/c/s.png')
  expect(result).toEqual({ ok: true, w: 600, h: 400 })
  expect(log[0]).toEqual(['mkdir', '-p', '/c'])
  expect(log[1]).toEqual(['/usr/bin/dot', '-Tpng', '-Gdpi=110', '-o', '/c/s.png'])
})

test('a missing dot says how to install it', async () => {
  const result = await renderPng(renderHost({ exitCode: 0, stderr: '' }), {}, 'digraph {}', '/c/s.png')
  expect(result.ok ? '' : result.error).toContain('dot not found')
})
