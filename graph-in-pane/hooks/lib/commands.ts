import type { Tools, View } from '../../types'
import { altOutline, pngPath, treeGraph } from './dot'
import { extractTarget, isFailure } from './extract'
import type { Host } from './host'
import { emptyView } from './nav'
import { renderPng } from './render'

/** What rendering needs from the session: tools, where pngs go, the fallback parsers. */
export type RenderCtx = { tools: Tools; cacheDir: string; sessionTag: string; parserDirs: readonly string[] }

/** A command argument as an absolute path: quotes stripped, `~` expanded, relative joined. */
export const resolveTarget = (arg: string, cwd: string, home: string): string => {
  const bare = arg.trim().replace(/^(['"])(.*)\1$/, '$2')
  return bare.startsWith('~/') ? `${home}/${bare.slice(2)}` : bare.startsWith('/') ? bare : `${cwd.replace(/\/$/, '')}/${bare}`
}

const base = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

export const titleOf = (target: string): string => {
  const [file, fn] = target.split('#')
  return fn !== undefined && fn !== '' ? fn : base(file ?? target)
}

/** Draws DOT into a fresh png for `view`; errors land on the view. */
export const renderView = async (host: Host, ctx: RenderCtx, view: View, dot: string, gen: number): Promise<View> => {
  const png = view.png ?? pngPath(ctx.cacheDir, `${ctx.sessionTag}-${gen}`)
  const rendered = await renderPng(host, ctx.tools, dot, png)
  return rendered.ok
    ? { ...view, png, gen, px: { w: rendered.w, h: rendered.h }, alt: altOutline(dot), error: null, waiting: false }
    : { ...view, error: rendered.error, waiting: false }
}

/** The literal view of a file, dir, `${file}#${fn}` or .dot file. */
export const treeView = async (host: Host, ctx: RenderCtx, target: string, gen: number): Promise<View> => {
  const [file = target] = target.split('#')
  const view = emptyView(file.endsWith('.dot') ? 'dot' : 'tree', titleOf(target), target)
  const stat = await host.stat(file)
  if (stat === null) return { ...view, error: `not found: ${file}` }
  if (view.mode === 'dot') return renderView(host, ctx, { ...view, mtimeMs: stat.mtimeMs }, await host.read(file), gen)
  const sk = await extractTarget(host, ctx.tools, file, stat.kind === 'dir', ctx.parserDirs)
  if (isFailure(sk)) return { ...view, error: sk.error }
  const graph = treeGraph(sk, target.includes('#') ? target : file)
  return renderView(host, { ...ctx }, { ...view, openable: graph.openable }, graph.dot, gen)
}

/** Redraws a .dot view when its file changed since it was drawn; null when unchanged. */
export const redrawDot = async (host: Host, ctx: RenderCtx, view: View, gen: number): Promise<View | null> => {
  const stat = await host.stat(view.target)
  if (stat === null || stat.mtimeMs === view.mtimeMs) return null
  return renderView(host, ctx, { ...view, mtimeMs: stat.mtimeMs }, await host.read(view.target), gen)
}

/** The one line a command answers with. */
export const summary = (view: View): string =>
  view.error !== null ? `graph-in-pane: ${view.error}` : `graph-in-pane: drew ${view.title} (${view.openable.length} boxes to open)`
