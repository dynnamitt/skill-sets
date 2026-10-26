import type { Tools } from '../../types'
import { fallbackRows } from './fallback'
import { type Host, mapLimit, safely } from './host'
import { base, dirOf, normalize } from './path'
import { RULES } from './rules'
import { type AstRow, type FileSkeleton, fileSkeleton, type Lang, langOf, langOfShebang, type Skeleton, specsOf, toRows } from './skeleton'

/** The most files a dir graph covers; the rest are counted as omitted. */
export const MAX_FILES = 200
/** The most source files a dir walk collects before it stops. */
export const MAX_LISTED = 2000
/** The most extractions (or probes) in flight at once. */
export const EXTRACT_CONCURRENCY = 8
/** The longest an ast-grep or tree-sitter run may take, in ms. */
export const RUN_TIMEOUT_MS = 30000
const PROBE_BATCH = 64
const IGNORED_DIRS: ReadonlySet<string> = new Set(['node_modules', 'dist', 'build', 'target', '.venv'])

/** A step that failed: what to show the user. */
export type Failure = { error: string }

/**
 * Tells a Failure from a result.
 * @param {unknown} value a result or a Failure
 * @returns {boolean} true when `value` is a Failure
 */
export const isFailure = (value: unknown): value is Failure =>
  typeof value === 'object' && value !== null && 'error' in value

const SCRIPT_TRIES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '/index.ts', '/index.tsx', '/index.js']
// An ESM-style `.js` spec names a `.ts` source: try these stems first.
const JS_TO_TS: Readonly<Record<string, string>> = { '.js': '.ts', '.jsx': '.tsx', '.mjs': '.mts' }

/**
 * Resolves a relative dependency spec to an existing own file (never a dir), else null.
 * @param {Host} host stats the candidate paths
 * @returns {(fromFile: string, spec: string) => Promise<string | null>} the resolver: importing file and spec in, absolute file path or null out
 */
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

/** A source file and its language. */
export type SourceFile = { path: string; lang: Lang }

/**
 * The language of a file: by extension, else by shebang when the name has no `.`.
 * @param {Host} host reads the file for the shebang probe
 * @param {string} path absolute file path
 * @returns {Promise<Lang | null>} the language, else null
 */
export const langOfFile = async (host: Host, path: string): Promise<Lang | null> =>
  langOf(path) ?? (base(path).includes('.') ? null : langOfShebang(await host.read(path).catch(() => '')))

/**
 * The "no grammar" message for a file: its extension when it has one, else its name.
 * @param {string} path file path
 * @returns {string} the error text
 */
export const noGrammar = (path: string): string => {
  const name = base(path)
  return `no grammar for ${name.includes('.') ? name.slice(name.lastIndexOf('.')) : name}`
}

/**
 * The source files under a dir, ignored dirs skipped, sorted, capped at MAX_FILES. The walk stops at MAX_LISTED.
 * @param {Host} host lists dirs and reads files
 * @param {string} dir absolute dir path
 * @returns {Promise<{ files: SourceFile[]; omitted: number }>} up to MAX_FILES files, and how many more there were
 */
export const listSourceFiles = async (host: Host, dir: string): Promise<{ files: SourceFile[]; omitted: number }> => {
  // Probes entries in batches, bounded, until `room` source files are found.
  const probe = async (paths: readonly string[], room: number, found: SourceFile[] = []): Promise<SourceFile[]> => {
    if (paths.length === 0 || found.length >= room) return found.slice(0, room)
    const batch = await mapLimit(paths.slice(0, PROBE_BATCH), EXTRACT_CONCURRENCY, async path => ({
      path,
      lang: await langOfFile(host, path),
    }))
    const hits = batch.filter((file): file is SourceFile => file.lang !== null)
    return probe(paths.slice(PROBE_BATCH), room, [...found, ...hits])
  }
  // Depth-first and in sequence: a dir's files, then its subdirs, each sorted.
  const walk = async (at: string, room: number): Promise<SourceFile[]> => {
    if (room <= 0) return []
    // An unreadable folder is skipped, not fatal.
    const entries = [...(await host.list(at).catch(() => []))].sort((a, b) => a.name.localeCompare(b.name))
    const here = await probe(
      entries.filter(entry => entry.kind === 'file').map(entry => `${at}/${entry.name}`),
      room,
    )
    return entries
      .filter(entry => entry.kind === 'dir' && !entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name))
      .reduce(
        async (acc, entry) => {
          const so = await acc
          return so.length >= room ? so : [...so, ...(await walk(`${at}/${entry.name}`, room - so.length))]
        },
        Promise.resolve(here),
      )
  }
  const all = await walk(dir, MAX_LISTED)
  return { files: all.slice(0, MAX_FILES), omitted: Math.max(0, all.length - MAX_FILES) }
}

const astGrepRows = async (host: Host, astGrep: string, file: string, lang: Lang): Promise<AstRow[] | Failure> => {
  const { exitCode, stdout, stderr, isStdoutTruncated } = await host.run(
    [astGrep, 'scan', '--inline-rules', RULES[lang], '--json=stream', file],
    { stdin: '', timeoutMs: RUN_TIMEOUT_MS },
  )
  if (isStdoutTruncated) return { error: `${file} is too large to graph (ast-grep output over 4 MiB)` }
  return exitCode !== 0 && stdout.trim() === '' ? { error: `ast-grep failed: ${stderr.split('\n')[0] ?? ''}` } : toRows(stdout)
}

/**
 * One file's skeleton: ast-grep, else the tree-sitter CLI with a parser from `parserDirs`.
 * @param {Host} host runs the tools and stats files
 * @param {Tools} tools the resolved tool paths
 * @param {string} file absolute file path
 * @param {Lang} lang the file's language
 * @param {readonly string[]} [parserDirs] dirs holding tree-sitter parsers
 * @param {string} [missing] the error text when no tool can parse
 * @returns {Promise<FileSkeleton | Failure>} the skeleton, else why not
 */
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

/**
 * The skeleton of a file or a dir of source files.
 * @param {Host} host runs the tools and lists dirs
 * @param {Tools} tools the resolved tool paths
 * @param {string} path absolute path of a file or dir
 * @param {boolean} isDir whether `path` is a dir
 * @param {readonly string[]} [parserDirs] dirs holding tree-sitter parsers
 * @param {string} [missing] the error text when no tool can parse
 * @returns {Promise<Skeleton | Failure>} the skeleton, else why not
 */
export const extractTarget = async (
  host: Host,
  tools: Tools,
  path: string,
  isDir: boolean,
  parserDirs: readonly string[] = [],
  missing = 'ast-grep not found',
): Promise<Skeleton | Failure> => {
  if (!isDir) {
    const lang = await langOfFile(host, path)
    if (lang === null) return { error: noGrammar(path) }
    const file = await extractFile(host, tools, path, lang, parserDirs, missing)
    return isFailure(file) ? file : { root: dirOf(path), files: [file], omitted: 0 }
  }
  const { files, omitted } = await listSourceFiles(host, path)
  if (files.length === 0) return { error: `no bash, TypeScript or JavaScript files under ${path}` }
  const skeletons = await mapLimit(files, EXTRACT_CONCURRENCY, file => extractFile(host, tools, file.path, file.lang, parserDirs, missing))
  const failed = skeletons.find(isFailure)
  return failed !== undefined && skeletons.every(isFailure)
    ? failed
    : { root: path, files: skeletons.filter((sk): sk is FileSkeleton => !isFailure(sk)), omitted }
}
