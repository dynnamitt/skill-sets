import type { Tools } from '../../types'
import { type Host, safely } from './host'
import { dirOf } from './path'

/** How long dot and unflatten may take, in ms. */
const DOT_TIMEOUT_MS = 15000
/** Output resolution of the png. */
const DPI = 110
/** `unflatten -l` / `-c`: leaf stagger and chain length for wide fan-outs. */
const UNFLATTEN = { leaves: 3, chain: 4 } as const

/** The outcome of a render: the png's pixel size, else why it failed. */
export type Rendered = { ok: true; w: number; h: number } | { ok: false; error: string }

/** Width and height from a PNG's IHDR chunk (big-endian, bytes 16 to 23). */
const pngSize = (base64: string): { w: number; h: number } | null => {
  if (base64 === '') return null
  const bytes = Uint8Array.from(atob(base64.slice(0, 44)), c => c.charCodeAt(0))
  if (bytes.length < 24 || bytes[1] !== 0x50) return null
  const read32 = (at: number): number => bytes.slice(at, at + 4).reduce((n, b) => n * 256 + b, 0)
  return { w: read32(16), h: read32(20) }
}

/** `unflatten` stacks wide fan-outs; `missingDot` is the error when dot is not installed. */
export type RenderOptions = { unflatten?: boolean; missingDot?: string }

/** Wide fan-outs stacked into a few ranks, for a tall narrow pane; the DOT as given when unflatten is missing. */
const unflattened = async (host: Host, tools: Tools, dot: string): Promise<string> => {
  if (tools.unflatten === undefined) return dot
  const { exitCode, stdout } = await host.run([tools.unflatten, '-l', String(UNFLATTEN.leaves), '-f', '-c', String(UNFLATTEN.chain)], { stdin: dot, timeoutMs: DOT_TIMEOUT_MS })
  return exitCode === 0 && stdout.trim() !== '' ? stdout : dot
}

/**
 * Renders DOT to a PNG with Graphviz and reads back its pixel size; never throws.
 * @param {Host} host runs dot and reads the png
 * @param {Tools} tools the resolved tool paths
 * @param {string} dot the DOT source
 * @param {string} out the png path to write
 * @param {RenderOptions} [options] unflatten and the missing-dot message
 * @returns {Promise<Rendered>} the pixel size, else the error
 */
export const renderPng = async (
  host: Host,
  tools: Tools,
  dot: string,
  out: string,
  options: RenderOptions = {},
): Promise<Rendered> => {
  const dotPath = tools.dot
  if (dotPath === undefined) return { ok: false, error: options.missingDot ?? 'dot not found (install Graphviz)' }
  return safely<Rendered>(
    async () => {
      await host.run(['mkdir', '-p', dirOf(out)], { stdin: '' })
      const input = options.unflatten === true ? await unflattened(host, tools, dot) : dot
      const { exitCode, stderr } = await host.run([dotPath, '-Tpng', `-Gdpi=${DPI}`, '-o', out], { stdin: input, timeoutMs: DOT_TIMEOUT_MS })
      if (exitCode !== 0) return { ok: false, error: stderr.split('\n')[0] || `dot exited ${exitCode}` }
      const size = pngSize(await host.bytes(out).catch(() => ''))
      return size === null ? { ok: false, error: `dot wrote no png at ${out}` } : { ok: true, ...size }
    },
    error => ({ ok: false, error: `dot failed: ${error}` }),
  )
}
