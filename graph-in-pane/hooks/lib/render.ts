import type { Tools } from '../../types'
import { type Host, safely } from './host'

export type Rendered = { ok: true; w: number; h: number } | { ok: false; error: string }

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

/** Width and height from a PNG's IHDR chunk (big-endian, bytes 16 to 23). */
const pngSize = (base64: string): { w: number; h: number } | null => {
  if (base64 === '') return null
  const bytes = Uint8Array.from(atob(base64.slice(0, 44)), c => c.charCodeAt(0))
  if (bytes.length < 24 || bytes[1] !== 0x50) return null
  const read32 = (at: number): number => bytes.slice(at, at + 4).reduce((n, b) => n * 256 + b, 0)
  return { w: read32(16), h: read32(20) }
}

export type RenderOptions = { unflatten?: boolean; missingDot?: string }

/** Wide fan-outs stacked into a few ranks, for a tall narrow pane; the DOT as given when unflatten is missing. */
const unflattened = async (host: Host, tools: Tools, dot: string): Promise<string> => {
  if (tools.unflatten === undefined) return dot
  const { exitCode, stdout } = await host.run([tools.unflatten, '-l', '3', '-f', '-c', '4'], { stdin: dot, timeoutMs: 15000 })
  return exitCode === 0 && stdout.trim() !== '' ? stdout : dot
}

/** Renders DOT to a PNG with Graphviz and reads back its pixel size; never throws. */
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
      const { exitCode, stderr } = await host.run([dotPath, '-Tpng', '-Gdpi=110', '-o', out], { stdin: input, timeoutMs: 15000 })
      if (exitCode !== 0) return { ok: false, error: stderr.split('\n')[0] || `dot exited ${exitCode}` }
      const size = pngSize(await host.bytes(out).catch(() => ''))
      return size === null ? { ok: false, error: `dot wrote no png at ${out}` } : { ok: true, ...size }
    },
    error => ({ ok: false, error: `dot failed: ${error}` }),
  )
}
