import type { Openable } from '../../types'
import { base } from './path'
import { type Call, type FileSkeleton, type Skeleton, TOP } from './skeleton'

export type { Openable }
export type Graph = { dot: string; openable: Openable[] }

export const COLORS = {
  bg: '#1e1e2e',
  fill: '#313244',
  border: '#89b4fa',
  text: '#cdd6f4',
  edge: '#7f849c',
  edgeText: '#a6adc8',
  openable: '#f9e2af',
  ok: '#a6e3a1',
  fail: '#f38ba8',
  external: '#585b70',
  externalText: '#7f849c',
} as const

/** The preamble every graph the pane draws shares (plan, tree and flow alike). */
export const STYLE = [
  `  graph [rankdir=TB bgcolor="${COLORS.bg}" pad=0.3 nodesep=0.3 ranksep=0.32 fontname="sans" fontcolor="${COLORS.text}"]`,
  `  node [shape=box style="rounded,filled" fillcolor="${COLORS.fill}" color="${COLORS.border}" fontcolor="${COLORS.text}" fontname="sans" fontsize=11]`,
  `  edge [color="${COLORS.edge}" fontcolor="${COLORS.edgeText}" fontname="sans" fontsize=9]`,
].join('\n')

/** Inserts STYLE right after the graph's opening brace. */
export const styleDot = (dot: string): string => {
  const brace = dot.indexOf('{')
  return brace < 0 ? dot : `${dot.slice(0, brace + 1)}\n${STYLE}\n${dot.slice(brace + 1)}`
}

const MAX_EXTERNALS = 12
const BIG_FN_LINES = 12
const MAX_FN_OPENABLE = 9

const q = (text: string): string => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const circled = (n: number): string => (n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`)
const attrs = (pairs: Readonly<Record<string, string>>): string =>
  Object.entries(pairs)
    .map(([key, value]) =>
      `${key}=${value.startsWith('"') || (key !== 'label' && /^[A-Za-z0-9.]+$/.test(value)) ? value : q(value)}`,
    )
    .join(' ')
const nodeLine = (id: string, pairs: Readonly<Record<string, string>>): string => `  ${q(id)} [${attrs(pairs)}]`
const edgeLine = (from: string, to: string, pairs: Readonly<Record<string, string>> = {}): string =>
  `  ${q(from)} -> ${q(to)}${Object.keys(pairs).length > 0 ? ` [${attrs(pairs)}]` : ''}`
const unique = <T>(items: readonly T[]): T[] => [...new Set(items)]
const fnId = (name: string): string => (name === TOP ? 'top' : `fn:${name}`)
const OPENABLE_STYLE = { color: `"${COLORS.openable}"`, penwidth: '"2"' }
const wrap = (lines: readonly string[]): string => styleDot(`digraph g {\n${unique(lines).join('\n')}\n}`)

const externalLines = (calls: readonly Call[]): string[] => {
  const names = unique(calls.filter(call => call.kind === 'external').map(call => call.to))
  const shown = new Set(names.slice(0, MAX_EXTERNALS))
  const extra = names.length - shown.size
  const style = { shape: 'cylinder', fillcolor: `"${COLORS.bg}"`, color: `"${COLORS.external}"`, fontcolor: `"${COLORS.externalText}"` }
  return [
    ...[...shown].map(name => nodeLine(`ext:${name}`, { label: name, ...style })),
    ...(extra > 0 ? [nodeLine('ext:more', { label: `+${extra} more`, ...style })] : []),
    ...calls
      .filter(call => call.kind === 'external')
      .map(call => edgeLine(fnId(call.from), shown.has(call.to) ? `ext:${call.to}` : 'ext:more', { style: 'dashed' })),
  ]
}

const fileGraph = (file: FileSkeleton, onlyFn: string | null): Graph => {
  const keep = (from: string): boolean => onlyFn === null || from === onlyFn
  const calls = file.calls.filter(call => keep(call.from))
  const exits = file.exits.filter(exit => keep(exit.from))
  const deps = file.deps.filter(dep => keep(dep.from))
  const ownDeps = deps.filter(dep => dep.resolved !== null)
  const reached = new Set(calls.filter(call => call.kind === 'fn').map(call => call.to))
  const fns = file.fns.filter(fn => onlyFn === null || fn.name === onlyFn || reached.has(fn.name))
  const bigFns = fns
    .filter(fn => fn.name !== onlyFn && fn.endLine - fn.startLine + 1 >= BIG_FN_LINES)
    .sort((a, b) => b.endLine - b.startLine - (a.endLine - a.startLine))
    .slice(0, MAX_FN_OPENABLE)
  const openable: Openable[] =
    ownDeps.length > 0
      ? unique(ownDeps.map(dep => dep.resolved as string)).map((target, i) => ({ n: i + 1, label: base(target), target }))
      : bigFns.map((fn, i) => ({ n: i + 1, label: fn.name, target: `${file.file}#${fn.name}` }))
  const numberOf = (target: string): number | undefined => openable.find(o => o.target === target)?.n
  const titled = (label: string, target: string) => {
    const n = numberOf(target)
    return n === undefined ? { label } : { label: `${circled(n)} ${label}`, ...OPENABLE_STYLE }
  }
  const lines = [
    ...(onlyFn === null ? [nodeLine('top', { label: base(file.file), fillcolor: '"#45475a"' })] : []),
    ...fns.map(fn => nodeLine(fnId(fn.name), titled(fn.name, `${file.file}#${fn.name}`))),
    ...calls.filter(call => call.kind === 'fn').map(call => edgeLine(fnId(call.from), fnId(call.to))),
    ...externalLines(calls),
    ...exits.map(exit =>
      nodeLine(`exit:${exit.code ?? '?'}`, {
        label: `exit ${exit.code ?? '?'}`,
        shape: 'oval',
        color: `"${exit.code === 0 ? COLORS.ok : COLORS.fail}"`,
      }),
    ),
    ...exits.map(exit => edgeLine(fnId(exit.from), `exit:${exit.code ?? '?'}`)),
    ...deps.map(dep =>
      nodeLine(`dep:${dep.spec}`, dep.resolved === null ? { label: base(dep.spec), shape: 'note' } : titled(base(dep.spec), dep.resolved)),
    ),
    ...deps.map(dep => edgeLine(fnId(dep.from), `dep:${dep.spec}`, { style: 'dashed' })),
  ]
  return { dot: wrap(lines), openable }
}

const relative = (root: string, path: string): string => (path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path)

const dirGraph = (sk: Skeleton): Graph => {
  const openable = sk.files.map((file, i) => ({ n: i + 1, label: relative(sk.root, file.file), target: file.file }))
  const inSet = new Set(sk.files.map(file => file.file))
  const lines = [
    ...openable.map(o => nodeLine(`file:${o.target}`, { label: `${circled(o.n)} ${o.label}`, ...OPENABLE_STYLE })),
    ...sk.files.flatMap(file =>
      file.deps
        .filter(dep => dep.resolved !== null && inSet.has(dep.resolved))
        .map(dep => edgeLine(`file:${file.file}`, `file:${dep.resolved}`)),
    ),
    ...(sk.omitted > 0 ? [nodeLine('more', { label: `+${sk.omitted} more files`, shape: 'note' })] : []),
  ]
  return { dot: wrap(lines), openable }
}

/** The literal graph of a skeleton; `focus` narrows it to one file or `${file}#${fn}`. */
export const treeGraph = (sk: Skeleton, focus?: string): Graph => {
  const [focusFile, focusFn] = (focus ?? '').split('#')
  const file = sk.files.find(f => f.file === focusFile) ?? (sk.files.length === 1 ? sk.files[0] : undefined)
  return file === undefined ? dirGraph(sk) : fileGraph(file, focusFn === undefined || focusFn === '' ? null : focusFn)
}

/** Node labels in order, for terminals that cannot draw the picture. */
export const altOutline = (dot: string): string => {
  const labels = [...dot.matchAll(/^\s*"(?:[^"\\]|\\.)*"\s*\[[^\n]*?label="((?:[^"\\]|\\.)*)"/gm)].map(m =>
    (m[1] ?? '').replace(/\\n/g, ' ').replace(/\\(.)/g, '$1'),
  )
  const names = labels.length > 0 ? labels : unique([...dot.matchAll(/"?([A-Za-z0-9_:./-]+)"?\s*->/g)].map(m => m[1] ?? ''))
  const text = names.join(' · ')
  return text.length > 400 ? `${text.slice(0, 399)}…` : text || 'graph'
}

/** The png a session renders into; one per session so sessions never clash. */
export const pngPath = (cacheDir: string, sessionTag: string): string => `${cacheDir}/${sessionTag}.png`

/** The cell box that shows a picture whole: cells are twice as tall as wide. */
export const fitBox = (
  px: { w: number; h: number },
  room: { columns: number; rows: number },
): { columns: number; rows: number } => {
  const rows = Math.round((room.columns * (px.h / px.w)) / 2)
  return rows <= room.rows
    ? { columns: room.columns, rows: Math.max(1, rows) }
    : { columns: Math.max(1, Math.round((room.rows * 2 * px.w) / px.h)), rows: room.rows }
}
