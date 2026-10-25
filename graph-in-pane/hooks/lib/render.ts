import type { Tools } from '../../types'
import type { Host } from './host'

export type Rendered = { ok: true; w: number; h: number } | { ok: false; error: string }

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

/** Width and height from a PNG's IHDR chunk (big-endian, bytes 16 to 23). */
const pngSize = (base64: string): { w: number; h: number } | null => {
  const bytes = Uint8Array.from(atob(base64.slice(0, 44)), c => c.charCodeAt(0))
  if (bytes.length < 24 || bytes[1] !== 0x50) return null
  const read32 = (at: number): number => bytes.slice(at, at + 4).reduce((n, b) => n * 256 + b, 0)
  return { w: read32(16), h: read32(20) }
}

/** Renders DOT to a PNG with Graphviz and reads back its pixel size. */
export const renderPng = async (host: Host, tools: Tools, dot: string, out: string): Promise<Rendered> => {
  if (tools.dot === undefined) return { ok: false, error: 'dot not found (install Graphviz)' }
  await host.run(['mkdir', '-p', dirOf(out)], { stdin: '' })
  const { exitCode, stderr } = await host.run([tools.dot, '-Tpng', '-Gdpi=110', '-o', out], {
    stdin: dot,
    timeoutMs: 15000,
  })
  if (exitCode !== 0) return { ok: false, error: stderr.split('\n')[0] || `dot exited ${exitCode}` }
  const size = pngSize(await host.bytes(out))
  return size === null ? { ok: false, error: `dot wrote no png at ${out}` } : { ok: true, ...size }
}
