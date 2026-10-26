import type { Hints, Tools, View } from '../../types'
import { altOutline, pngPath, treeGraph } from './dot'
import { extractTarget, type Failure, isFailure, langOfFile, listSourceFiles, noGrammar } from './extract'
import { type Host, safely } from './host'
import { emptyView } from './nav'
import { base, normalize } from './path'
import { renderPng, type RenderOptions } from './render'
import type { Skeleton } from './skeleton'

/** What rendering needs from the session: tools, where pngs go, the fallback parsers. */
export type RenderCtx = { tools: Tools; cacheDir: string; sessionTag: string; parserDirs: readonly string[]; hints: Hints }

/**
 * A command argument as an absolute path: quotes stripped, `~` expanded, relative joined.
 * @param {string} arg the raw argument
 * @param {string} cwd the base for a relative path
 * @param {string} home what `~` stands for
 * @returns {string} a normalized absolute path
 */
export const resolveTarget = (arg: string, cwd: string, home: string): string => {
  const bare = arg.trim().replace(/^(['"])(.*)\1$/, '$2')
  return normalize(bare.startsWith('~/') ? `${home}/${bare.slice(2)}` : bare.startsWith('/') ? bare : `${cwd}/${bare}`)
}

/**
 * A view's title: the function name for `file#fn`, else the file's base name.
 * @param {string} target a path or `${file}#${fn}`
 * @returns {string} the title
 */
export const titleOf = (target: string): string => {
  const [file, fn] = target.split('#')
  return fn !== undefined && fn !== '' ? fn : base(file ?? target)
}

/**
 * Draws DOT into a fresh png for `view`; errors land on the view.
 * @param {Host} host runs dot
 * @param {RenderCtx} ctx tools, cache dir and hints
 * @param {View} view the view to update
 * @param {string} dot the DOT source
 * @param {number} gen the picture's generation
 * @param {Pick<RenderOptions, 'unflatten'>} [options] whether to unflatten
 * @returns {Promise<View>} the view with its picture, or with the error
 */
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

/**
 * Stats a file or dir and extracts its skeleton: the one path behind the tree view and graph_skeleton.
 * @param {Host} host the session host
 * @param {RenderCtx} ctx tools, parser dirs and hints
 * @param {string} file absolute path of a file or dir
 * @returns {Promise<{ sk: Skeleton; isDir: boolean } | Failure>} the skeleton, else why not
 */
export const skeletonOf = async (host: Host, ctx: RenderCtx, file: string): Promise<{ sk: Skeleton; isDir: boolean } | Failure> => {
  const stat = await host.stat(file)
  if (stat === null) return { error: `not found: ${file}` }
  const isDir = stat.kind === 'dir'
  const sk = await extractTarget(host, ctx.tools, file, isDir, ctx.parserDirs, ctx.hints.astGrep)
  return isFailure(sk) ? sk : { sk, isDir }
}

/**
 * The cheap check behind /graph-flow: the target exists and has something to extract. Runs no ast-grep.
 * @param {Host} host the session host
 * @param {string} file absolute path of a file or dir
 * @returns {Promise<{ files: number } | Failure>} how many source files, else why not
 */
export const flowCheck = async (host: Host, file: string): Promise<{ files: number } | Failure> => {
  const stat = await host.stat(file)
  if (stat === null) return { error: `not found: ${file}` }
  if (stat.kind !== 'dir') return (await langOfFile(host, file)) === null ? { error: noGrammar(file) } : { files: 1 }
  const { files } = await listSourceFiles(host, file)
  return files.length === 0 ? { error: `no bash, TypeScript or JavaScript files under ${file}` } : { files: files.length }
}

/**
 * The literal view of a file, dir, `${file}#${fn}` or .dot file; failures land on the view, never thrown.
 * @param {Host} host the session host
 * @param {RenderCtx} ctx tools, parser dirs and hints
 * @param {string} target an absolute path, or `${file}#${fn}`
 * @param {number} gen the picture's generation
 * @returns {Promise<View>} the drawn view, or one carrying the error
 */
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
      const extracted = await skeletonOf(host, ctx, file)
      if (isFailure(extracted)) return { ...view, error: extracted.error }
      const graph = treeGraph(extracted.sk, target.includes('#') ? target : file)
      return renderView(host, ctx, { ...view, openable: graph.openable }, graph.dot, gen, { unflatten: true })
    },
    error => ({ ...view, error }),
  )
}

/**
 * Redraws a .dot view when its file changed since it was drawn; null when unchanged.
 * A bad save keeps the last good picture under the error, and the next good save clears it.
 * @param {Host} host the session host
 * @param {RenderCtx} ctx tools, cache dir and hints
 * @param {View} view the .dot view
 * @param {() => Promise<number>} nextGen takes the next picture generation
 * @returns {Promise<View | null>} the redrawn view, else null
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

/**
 * The one line a command answers with; the engine already names the plugin.
 * @param {View} view the drawn view
 * @returns {string} the error, else a "drew ..." line
 */
export const summary = (view: View): string =>
  view.error ?? `drew ${view.title} (${plural(view.openable.length, 'box')} to open)`
