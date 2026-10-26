import type { Tools } from '../../types'
import { fallbackRows } from './fallback'
import { type Host, safely } from './host'
import { dirOf, normalize } from './path'
import { RULES } from './rules'
import { type AstRow, type FileSkeleton, fileSkeleton, type Lang, langOf, type Skeleton, specsOf, toRows } from './skeleton'

export const MAX_FILES = 200
const IGNORED_DIRS: ReadonlySet<string> = new Set(['node_modules', 'dist', 'build', 'target', '.venv'])

export type Failure = { error: string }
export const isFailure = (value: unknown): value is Failure =>
  typeof value === 'object' && value !== null && 'error' in value

const SCRIPT_TRIES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '/index.ts', '/index.tsx', '/index.js']
// An ESM-style `.js` spec names a `.ts` source: try these stems first.
const JS_TO_TS: Readonly<Record<string, string>> = { '.js': '.ts', '.jsx': '.tsx', '.mjs': '.mts' }

/** Resolves a relative dependency spec to an existing own file (never a dir), else null. */
export const ownResolver =
  (host: Host) =>
  async (fromFile: string, spec: string): Promise<string | null> => {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return null
    const base = normalize(`${dirOf(fromFile)}/${spec}`)
    if (base.split('/').includes('node_modules')) return null
    const jsExt = Object.keys(JS_TO_TS).find(ext => base.endsWith(ext))
    const swapped = jsExt === undefined ? [] : [`${base.slice(0, -jsExt.length)}${JS_TO_TS[jsExt]}`]
    const tries = langOf(fromFile) === 'bash' ? [base] : [...swapped, ...SCRIPT_TRIES.map(ext => base + ext)]
    const isFile = async (path: string) => (await host.stat(path))?.kind === 'file'
    const found = await Promise.all(tries.map(async path => ((await isFile(path)) ? path : null)))
    return found.find(path => path !== null) ?? null
  }

/** The source files under a dir, ignored dirs skipped, sorted, capped at MAX_FILES. */
export const listSourceFiles = async (host: Host, dir: string): Promise<{ files: string[]; omitted: number }> => {
  const walk = async (at: string): Promise<string[]> => {
    // An unreadable folder is skipped, not fatal.
    const entries = [...(await host.list(at).catch(() => []))].sort((a, b) => a.name.localeCompare(b.name))
    const nested = await Promise.all(
      entries
        .filter(entry => entry.kind === 'dir' && !entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name))
        .map(entry => walk(`${at}/${entry.name}`)),
    )
    const here = entries
      .filter(entry => entry.kind === 'file' && langOf(entry.name) !== null)
      .map(entry => `${at}/${entry.name}`)
    return [...here, ...nested.flat()]
  }
  const all = await walk(dir)
  return { files: all.slice(0, MAX_FILES), omitted: Math.max(0, all.length - MAX_FILES) }
}

const astGrepRows = async (host: Host, astGrep: string, file: string, lang: Lang): Promise<AstRow[] | Failure> => {
  const { exitCode, stdout, stderr, isStdoutTruncated } = await host.run(
    [astGrep, 'scan', '--inline-rules', RULES[lang], '--json=stream', file],
    { stdin: '', timeoutMs: 30000 },
  )
  if (isStdoutTruncated) return { error: `${file} is too large to graph (ast-grep output over 4 MiB)` }
  return exitCode !== 0 && stdout.trim() === '' ? { error: `ast-grep failed: ${stderr.split('\n')[0] ?? ''}` } : toRows(stdout)
}

/** One file's skeleton: ast-grep, else the tree-sitter CLI with a parser from `parserDirs`. */
export const extractFile = async (
  host: Host,
  tools: Tools,
  file: string,
  lang: Lang,
  parserDirs: readonly string[] = [],
  missing = 'ast-grep not found',
): Promise<FileSkeleton | Failure> => {
  const astGrep = tools['ast-grep']
  const rows = await safely<AstRow[] | Failure>(
    () =>
      astGrep === undefined
        ? fallbackRows(host, tools, parserDirs, file, lang, missing)
        : astGrepRows(host, astGrep, file, lang),
    error => ({ error: `${file}: ${error}` }),
  )
  if (isFailure(rows)) return rows
  const resolve = ownResolver(host)
  const resolved = new Map(
    await Promise.all(specsOf(rows, lang).map(async spec => [spec, await resolve(file, spec)] as const)),
  )
  return fileSkeleton(file, lang, rows, spec => resolved.get(spec) ?? null)
}

/** The skeleton of a file or a dir of source files. */
export const extractTarget = async (
  host: Host,
  tools: Tools,
  path: string,
  isDir: boolean,
  parserDirs: readonly string[] = [],
  missing = 'ast-grep not found',
): Promise<Skeleton | Failure> => {
  if (!isDir) {
    const lang = langOf(path)
    if (lang === null) return { error: `no grammar for ${path.includes('.') ? path.slice(path.lastIndexOf('.')) : path}` }
    const file = await extractFile(host, tools, path, lang, parserDirs, missing)
    return isFailure(file) ? file : { root: dirOf(path), files: [file], omitted: 0 }
  }
  const { files, omitted } = await listSourceFiles(host, path)
  if (files.length === 0) return { error: `no bash, TypeScript or JavaScript files under ${path}` }
  const skeletons = await Promise.all(files.map(file => extractFile(host, tools, file, langOf(file) as Lang, parserDirs, missing)))
  const failed = skeletons.find(isFailure)
  return failed !== undefined && skeletons.every(isFailure)
    ? failed
    : { root: path, files: skeletons.filter((sk): sk is FileSkeleton => !isFailure(sk)), omitted }
}
