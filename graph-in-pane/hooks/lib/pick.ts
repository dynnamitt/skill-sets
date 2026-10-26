import { IGNORED_DIRS } from './extract'
import type { Host } from './host'
import { base, normalize } from './path'
import { langOf } from './skeleton'

/** The commands whose argument is a file or dir. */
export const PICK_COMMANDS: readonly string[] = ['graph-flow', '10kfo', 'graph-tree', '10kfv']
/** The most typeahead rows, the most paths listed under a root, how deep a walk outside git goes. */
export const MAX_ROWS = 12, MAX_CANDIDATES = 20000, WALK_DEPTH = 4
/** The most near paths a not-found names. */
export const MAX_NEAR = 3
/** The longest a listing or an fzf run may take, in ms; how long a root's listing is reused. */
export const PICK_TIMEOUT_MS = 2000, PICK_CACHE_MS = 15000

/** Where to look and what to match: `prefix` is the typed part that named `root`, kept in what is written. */
export type PickQuery = { root: string; prefix: string; query: string }

/**
 * Whether the token starting at `start` is the argument of a path-taking command.
 * @param {string} text the prompt box's draft
 * @param {number} start where the token at the cursor begins
 * @returns {boolean} true for `/graph-flow <token>` and its siblings
 */
export const isPickToken = (text: string, start: number): boolean => {
  const command = /^\/(\S+)\s+/.exec(text)
  return command !== null && PICK_COMMANDS.includes(command[1] ?? '') && start >= command[0].length
}

const resolveTyped = (typed: string, cwd: string, home: string): string =>
  normalize(typed.startsWith('~/') ? `${home}/${typed.slice(2)}` : typed.startsWith('/') ? typed : `${cwd}/${typed}`)

/**
 * Splits a token into the longest dir it names and the fuzzy query after it.
 * @param {Host} host stats the candidate dirs
 * @param {string} token the token at the cursor
 * @param {string} cwd the base for a relative token
 * @param {string} home what `~` stands for
 * @returns {Promise<PickQuery | null>} the root and query, else null when only `/` would be the root
 */
export const pickRoot = async (host: Host, token: string, cwd: string, home: string): Promise<PickQuery | null> => {
  const isAbsolute = token.startsWith('/') || token.startsWith('~/')
  const cuts = [...(isAbsolute ? [] : [0]), ...[...token.matchAll(/\//g)].map(match => (match.index ?? 0) + 1)].sort((a, b) => b - a)
  const found = await cuts.reduce<Promise<PickQuery | undefined>>(async (prior, cut) => {
    const hit = await prior
    if (hit !== undefined) return hit
    const prefix = token.slice(0, cut)
    const root = prefix === '' ? cwd : resolveTyped(prefix, cwd, home)
    return (await host.stat(root))?.kind === 'dir' ? { root, prefix, query: token.slice(cut) } : undefined
  }, Promise.resolve(undefined))
  return found === undefined || found.root === '/' ? null : found
}

/**
 * Files followed by every dir above them (as `dir/`), each once.
 * @param {readonly string[]} files paths relative to a root
 * @returns {string[]} the files, then their dirs in first-seen order
 */
export const withDirs = (files: readonly string[]): string[] => [
  ...files,
  ...new Set(
    files.flatMap(file =>
      file
        .split('/')
        .slice(0, -1)
        .map((_, i, parts) => `${parts.slice(0, i + 1).join('/')}/`),
    ),
  ),
]

/**
 * Whether a path can be graphed: a dir, a `.dot` file, a known language, or an extension-less script.
 * @param {string} path a relative path, dirs ending in `/`
 * @returns {boolean} true to offer it
 */
export const pickable = (path: string): boolean =>
  path.endsWith('/') || path.endsWith('.dot') || langOf(path) !== null || !base(path).includes('.')

const lines = (text: string): string[] => text.split('\n').filter(line => line !== '')

const WALK_PRUNE = ['.*', ...IGNORED_DIRS].flatMap((name, i) => [...(i === 0 ? [] : ['-o']), '-name', name])

/**
 * The graphable paths under a root: `git ls-files` inside a repo, else a shallow `find`.
 * @param {Host} host runs git and find
 * @param {string} root an absolute dir
 * @returns {Promise<string[]>} paths relative to `root`, dirs ending in `/`
 */
export const listCandidates = async (host: Host, root: string): Promise<string[]> => {
  const init = { stdin: '', timeoutMs: PICK_TIMEOUT_MS }
  const git = await host
    .run(['git', '-C', root, '-c', 'core.quotePath=false', 'ls-files', '--cached', '--others', '--exclude-standard'], init)
    .catch(() => null)
  if (git !== null && git.exitCode === 0) return withDirs(lines(git.stdout)).filter(pickable).slice(0, MAX_CANDIDATES)
  const walk = await host
    .run(
      [
        'sh', '-c', 'find "$@" | head -n "$0"', String(MAX_CANDIDATES),
        root, '-mindepth', '1', '-maxdepth', String(WALK_DEPTH), '(', ...WALK_PRUNE, ')', '-prune',
        '-o', '-type', 'd', '-printf', '%P/\\n', '-o', '-type', 'f', '-printf', '%P\\n',
      ],
      init,
    )
    .catch(() => null)
  return walk === null ? [] : lines(walk.stdout).filter(pickable)
}

const depthOf = (path: string): number => path.replace(/\/$/, '').split('/').length

const byDepth = (a: string, b: string): number => depthOf(a) - depthOf(b) || a.localeCompare(b)

/** Total gap between the query's letters in `path`, in order and ignoring case; null when they are not all there. */
const gapScore = (path: string, query: string): number | null => {
  const lower = path.toLowerCase()
  const end = [...query.toLowerCase()].reduce<{ at: number; gaps: number } | null>((acc, ch) => {
    if (acc === null) return null
    const i = lower.indexOf(ch, acc.at + 1)
    return i < 0 ? null : { at: i, gaps: acc.gaps + (acc.at < 0 ? 0 : i - acc.at - 1) }
  }, { at: -1, gaps: 0 })
  return end === null ? null : end.gaps
}

/**
 * Subsequence matching for when fzf is not installed: tightest matches first, then shorter paths.
 * @param {readonly string[]} paths the candidates
 * @param {string} query the typed letters
 * @returns {string[]} the matching paths, best first, at most MAX_ROWS
 */
export const fuzzyRank = (paths: readonly string[], query: string): string[] =>
  paths
    .map(path => ({ path, score: gapScore(path, query) }))
    .filter((hit): hit is { path: string; score: number } => hit.score !== null)
    .sort((a, b) => a.score - b.score || a.path.length - b.path.length)
    .slice(0, MAX_ROWS)
    .map(hit => hit.path)

/**
 * The best paths for a query: shallowest first when empty, else `fzf --filter`, else the built-in matcher.
 * @param {Host} host runs fzf
 * @param {string | undefined} fzf fzf's path, when installed
 * @param {readonly string[]} paths the candidates
 * @param {string} query the typed letters
 * @returns {Promise<string[]>} at most MAX_ROWS paths, best first
 */
export const rank = async (host: Host, fzf: string | undefined, paths: readonly string[], query: string): Promise<string[]> => {
  if (query === '') return [...paths].sort(byDepth).slice(0, MAX_ROWS)
  if (fzf === undefined) return fuzzyRank(paths, query)
  const ran = await host.run([fzf, '--filter', query], { stdin: paths.join('\n'), timeoutMs: PICK_TIMEOUT_MS }).catch(() => null)
  // fzf exits 1 with no match; anything else falls back to the built-in matcher.
  return ran === null || ran.exitCode > 1 ? fuzzyRank(paths, query) : lines(ran.stdout).slice(0, MAX_ROWS)
}

/**
 * Paths a missing one may have meant: its missing part fuzzy-matched under the longest dir it names.
 * @param {Host} host stats dirs and runs the listing and fzf
 * @param {string | undefined} fzf fzf's path, when installed
 * @param {string} path the absolute path that was not found
 * @param {(host: Host, root: string) => Promise<readonly string[]>} [list] lists a root's candidates
 * @returns {Promise<string[]>} at most MAX_NEAR absolute paths, best first
 */
export const nearPaths = async (
  host: Host,
  fzf: string | undefined,
  path: string,
  list: (host: Host, root: string) => Promise<readonly string[]> = listCandidates,
): Promise<string[]> => {
  const picked = await pickRoot(host, path, '/', '')
  if (picked === null || picked.query === '') return []
  const ranked = await rank(host, fzf, await list(host, picked.root), picked.query)
  return ranked.slice(0, MAX_NEAR).map(near => normalize(`${picked.root}/${near}`))
}

/**
 * The not-found error, naming the near paths when there are any.
 * @param {string} path the path that was not found
 * @param {readonly string[]} near the paths it may have meant
 * @returns {string} the message for the pane, the command and Claude
 */
export const notFoundText = (path: string, near: readonly string[]): string =>
  near.length === 0 ? `not found: ${path}` : `not found: ${path} · did you mean ${near.join(', ')}`
