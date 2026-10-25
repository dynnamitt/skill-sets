import type { Tools } from '../../types'
import { fallbackRows } from './fallback'
import type { Host } from './host'
import { RULES } from './rules'
import { type AstRow, type FileSkeleton, fileSkeleton, type Lang, langOf, type Skeleton, specsOf, toRows } from './skeleton'

export const MAX_FILES = 200
const IGNORED_DIRS: ReadonlySet<string> = new Set(['node_modules', 'dist', 'build', 'target', '.venv'])

export type Failure = { error: string }
export const isFailure = (value: unknown): value is Failure =>
  typeof value === 'object' && value !== null && 'error' in value

const dirOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/'))) || '/'

/** Collapses `.` and `..` segments of an absolute path. */
export const normalize = (path: string): string =>
  `/${path
    .split('/')
    .reduce<string[]>(
      (parts, part) =>
        part === '' || part === '.' ? parts : part === '..' ? parts.slice(0, -1) : [...parts, part],
      [],
    )
    .join('/')}`

const SCRIPT_TRIES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '/index.ts', '/index.tsx', '/index.js']

/** Resolves a relative dependency spec to an existing own file, else null. */
export const ownResolver =
  (host: Host) =>
  async (fromFile: string, spec: string): Promise<string | null> => {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return null
    const base = normalize(`${dirOf(fromFile)}/${spec}`)
    if (base.split('/').includes('node_modules')) return null
    const tries = langOf(fromFile) === 'bash' ? [''] : SCRIPT_TRIES
    const found = await Promise.all(tries.map(async ext => ((await host.exists(base + ext)) ? base + ext : null)))
    return found.find(path => path !== null) ?? null
  }

/** The source files under a dir, ignored dirs skipped, sorted, capped at MAX_FILES. */
export const listSourceFiles = async (host: Host, dir: string): Promise<{ files: string[]; omitted: number }> => {
  const walk = async (at: string): Promise<string[]> => {
    const entries = [...(await host.list(at))].sort((a, b) => a.name.localeCompare(b.name))
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
  const { exitCode, stdout, stderr } = await host.run([astGrep, 'scan', '--inline-rules', RULES[lang], '--json=stream', file], {
    stdin: '',
    timeoutMs: 30000,
  })
  return exitCode !== 0 && stdout.trim() === '' ? { error: `ast-grep failed: ${stderr.split('\n')[0] ?? ''}` } : toRows(stdout)
}

/** One file's skeleton: ast-grep, else the tree-sitter CLI with a parser from `parserDirs`. */
export const extractFile = async (
  host: Host,
  tools: Tools,
  file: string,
  lang: Lang,
  parserDirs: readonly string[] = [],
): Promise<FileSkeleton | Failure> => {
  const astGrep = tools['ast-grep']
  const rows =
    astGrep === undefined
      ? await fallbackRows(host, tools, parserDirs, file, lang)
      : await astGrepRows(host, astGrep, file, lang)
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
): Promise<Skeleton | Failure> => {
  if (!isDir) {
    const lang = langOf(path)
    if (lang === null) return { error: `no grammar for ${path.includes('.') ? path.slice(path.lastIndexOf('.')) : path}` }
    const file = await extractFile(host, tools, path, lang, parserDirs)
    return isFailure(file) ? file : { root: dirOf(path), files: [file], omitted: 0 }
  }
  const { files, omitted } = await listSourceFiles(host, path)
  if (files.length === 0) return { error: `no bash, TypeScript or JavaScript files under ${path}` }
  const skeletons = await Promise.all(files.map(file => extractFile(host, tools, file, langOf(file) as Lang, parserDirs)))
  const failed = skeletons.find(isFailure)
  return failed !== undefined && skeletons.every(isFailure)
    ? failed
    : { root: path, files: skeletons.filter((sk): sk is FileSkeleton => !isFailure(sk)), omitted }
}
