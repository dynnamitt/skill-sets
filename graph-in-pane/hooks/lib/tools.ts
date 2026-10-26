import type { PluginOptions } from 'claude-code'

import type { ToolName, Tools } from '../../types'
import type { Host } from './host'

export type { ToolName, Tools }

const TOOL_NAMES: readonly ToolName[] = ['dot', 'ast-grep', 'tree-sitter', 'nvim', 'unflatten']

const OPTION_OF: Readonly<Partial<Record<ToolName, string>>> = {
  dot: 'dotPath',
  'ast-grep': 'astGrepPath',
  'tree-sitter': 'treeSitterPath',
}

/**
 * Where binaries live on common distros, after PATH: user installs, then distro packages (a PATH the hook does not see).
 * @param {string} home the user's home dir
 * @returns {readonly string[]} dirs to look in, in order
 */
export const candidateDirs = (home: string): readonly string[] => [
  '/home/linuxbrew/.linuxbrew/bin',
  `${home}/.linuxbrew/bin`,
  `${home}/.cargo/bin`,
  `${home}/.local/bin`,
  '/usr/local/bin',
  '/usr/bin',
]

const firstMatch = async <T>(
  items: readonly T[],
  test: (item: T) => Promise<string | undefined>,
): Promise<string | undefined> =>
  items.reduce<Promise<string | undefined>>(
    async (found, item) => (await found) ?? test(item),
    Promise.resolve(undefined),
  )

const onPath = async (host: Host, name: string): Promise<string | undefined> => {
  const { exitCode, stdout } = await host.run(['sh', '-c', `command -v ${name}`])
  const path = stdout.trim().split('\n')[0] ?? ''
  return exitCode === 0 && path.startsWith('/') ? path : undefined
}

const existing = async (host: Host, path: string): Promise<string | undefined> =>
  path !== '' && (await host.exists(path)) ? path : undefined

const resolveOne = async (
  host: Host,
  options: PluginOptions,
  home: string,
  name: ToolName,
): Promise<string | undefined> => {
  const key = OPTION_OF[name]
  const configured = key === undefined ? '' : String(options[key] ?? '')
  return (
    (await existing(host, configured)) ??
    (await onPath(host, name)) ??
    (await firstMatch(candidateDirs(home), dir => existing(host, `${dir}/${name}`)))
  )
}

/**
 * Finds each host tool: the option's path, then PATH, then common bin dirs.
 * @param {Host} host runs `command -v` and checks paths
 * @param {PluginOptions} options the plugin options (`dotPath`, `astGrepPath`, `treeSitterPath`)
 * @returns {Promise<Tools>} the paths of the tools that were found
 */
export const resolveTools = async (host: Host, options: PluginOptions): Promise<Tools> => {
  const home = (await host.env('HOME')) ?? ''
  const found = await Promise.all(
    TOOL_NAMES.map(async name => [name, await resolveOne(host, options, home, name)] as const),
  )
  return Object.fromEntries(found.filter(([, path]) => path !== undefined)) as Tools
}

const osField = (osRelease: string, field: string): string =>
  osRelease
    .split('\n')
    .filter(line => line.startsWith(`${field}=`))
    .map(line => line.slice(field.length + 1).replace(/^"|"$/g, ''))[0] ?? ''

type Family = 'arch' | 'fedora' | 'debian' | 'other'

const familyOf = (osRelease: string): Family => {
  const ids = [osField(osRelease, 'ID'), ...osField(osRelease, 'ID_LIKE').split(' ')]
  const known: readonly Family[] = ['arch', 'fedora', 'debian']
  return known.find(family => ids.includes(family)) ?? (ids.includes('ubuntu') ? 'debian' : 'other')
}

const PORTABLE_AST_GREP = 'cargo install ast-grep  or  npm i -g @ast-grep/cli'
const PORTABLE_TREE_SITTER = 'cargo install tree-sitter-cli  or  npm i -g tree-sitter-cli'

const HINTS: Readonly<Record<Family, (hasBrew: boolean) => Readonly<Record<'dot' | 'ast-grep' | 'tree-sitter', string>>>> = {
  arch: () => ({ dot: 'pacman -S graphviz', 'ast-grep': 'pacman -S ast-grep', 'tree-sitter': 'pacman -S tree-sitter-cli' }),
  fedora: hasBrew =>
    hasBrew
      ? { dot: 'brew install graphviz', 'ast-grep': 'brew install ast-grep', 'tree-sitter': PORTABLE_TREE_SITTER }
      : { dot: 'sudo dnf install graphviz', 'ast-grep': 'cargo install ast-grep', 'tree-sitter': PORTABLE_TREE_SITTER },
  debian: () => ({ dot: 'sudo apt install graphviz', 'ast-grep': PORTABLE_AST_GREP, 'tree-sitter': PORTABLE_TREE_SITTER }),
  other: hasBrew =>
    hasBrew
      ? { dot: 'brew install graphviz', 'ast-grep': 'brew install ast-grep', 'tree-sitter': PORTABLE_TREE_SITTER }
      : { dot: 'install graphviz with your package manager', 'ast-grep': PORTABLE_AST_GREP, 'tree-sitter': PORTABLE_TREE_SITTER },
}

/**
 * The install line for a missing tool on the distro /etc/os-release describes.
 * ast-grep's names the tree-sitter CLI too: it is shown only when that is missing as well.
 * @param {string} osRelease the text of /etc/os-release
 * @param {boolean} hasBrew whether Homebrew is installed
 * @param {ToolName} missing the tool that was not found
 * @returns {string} the message to show
 */
export const installHint = (osRelease: string, hasBrew: boolean, missing: ToolName): string => {
  const hints = HINTS[familyOf(osRelease)](hasBrew)
  return missing === 'ast-grep'
    ? `ast-grep not found. Install: ${hints['ast-grep']}  (or ${hints['tree-sitter']} to parse with nvim's tree-sitter parsers)`
    : missing === 'dot'
      ? `dot not found. Install: ${hints.dot}`
      : `${missing} not found (optional).`
}
