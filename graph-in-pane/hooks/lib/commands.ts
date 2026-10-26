import type { Hints, Tools, View } from '../../types'
import { altOutline, pngPath, treeGraph } from './dot'
import { extractTarget, isFailure } from './extract'
import { type Host, safely } from './host'
import { emptyView } from './nav'
import { base, normalize } from './path'
import { renderPng, type RenderOptions } from './render'

/** What rendering needs from the session: tools, where pngs go, the fallback parsers. */
export type RenderCtx = { tools: Tools; cacheDir: string; sessionTag: string; parserDirs: readonly string[]; hints: Hints }

/** A command argument as an absolute path: quotes stripped, `~` expanded, relative joined. */
export const resolveTarget = (arg: string, cwd: string, home: string): string => {
  const bare = arg.trim().replace(/^(['"])(.*)\1$/, '$2')
  return normalize(bare.startsWith('~/') ? `${home}/${bare.slice(2)}` : bare.startsWith('/') ? bare : `${cwd}/${bare}`)
}

export const titleOf = (target: string): string => {
  const [file, fn] = target.split('#')
  return fn !== undefined && fn !== '' ? fn : base(file ?? target)
}

/** Draws DOT into a fresh png for `view`; errors land on the view. */
export const renderView = async (
  host: Host,
  ctx: RenderCtx,
  view: View,
  dot: string,
  gen: number,
  options: Pick<RenderOptions, 'unflatten'> = {},
): Promise<View> => {
  const png = view.png ?? pngPath(ctx.cacheDir, `${ctx.sessionTag}-${gen}`)
  const rendered = await renderPng(host, ctx.tools, dot, png, { ...options, missingDot: ctx.hints.dot })
  return rendered.ok
    ? { ...view, png, gen, px: { w: rendered.w, h: rendered.h }, alt: altOutline(dot), error: null, waiting: false }
    : { ...view, error: rendered.error, waiting: false }
}

/** The literal view of a file, dir, `${file}#${fn}` or .dot file; failures land on the view, never thrown. */
export const treeView = async (host: Host, ctx: RenderCtx, target: string, gen: number): Promise<View> => {
  const [file = target] = target.split('#')
  const view = emptyView(file.endsWith('.dot') ? 'dot' : 'tree', titleOf(target), target)
  return safely<View>(
    async () => {
      const stat = await host.stat(file)
      if (stat === null) return { ...view, error: `not found: ${file}` }
      if (view.mode === 'dot') {
        if (stat.kind !== 'file') return { ...view, error: `not a file: ${file}` }
        return renderView(host, ctx, { ...view, mtimeMs: stat.mtimeMs }, await host.read(file), gen)
      }
      const sk = await extractTarget(host, ctx.tools, file, stat.kind === 'dir', ctx.parserDirs, ctx.hints.astGrep)
      if (isFailure(sk)) return { ...view, error: sk.error }
      const graph = treeGraph(sk, target.includes('#') ? target : file)
      return renderView(host, ctx, { ...view, openable: graph.openable }, graph.dot, gen, { unflatten: true })
    },
    error => ({ ...view, error }),
  )
}

/**
 * Redraws a .dot view when its file changed since it was drawn; null when unchanged.
 * A bad save keeps the last good picture under the error, and the next good save clears it.
 */
export const redrawDot = async (
  host: Host,
  ctx: RenderCtx,
  view: View,
  nextGen: () => Promise<number>,
): Promise<View | null> => {
  const stat = await host.stat(view.target)
  if (stat === null || stat.mtimeMs === view.mtimeMs) return null
  const gen = await nextGen()
  const text = await host.read(view.target).catch(() => null)
  if (text === null) return { ...view, mtimeMs: stat.mtimeMs, error: `cannot read ${view.target}` }
  const next = await renderView(host, ctx, { ...view, png: null, mtimeMs: stat.mtimeMs }, text, gen)
  return next.error === null ? next : { ...view, mtimeMs: stat.mtimeMs, error: next.error }
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 'es'}`

/** The one line a command answers with; the engine already names the plugin. */
export const summary = (view: View): string =>
  view.error ?? `drew ${view.title} (${plural(view.openable.length, 'box')} to open)`
