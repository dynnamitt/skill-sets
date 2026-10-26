import type { PluginOptions } from 'claude-code'

import type { Tools } from '../../types'
import type { Failure } from './extract'
import type { Host } from './host'
import { dirOf } from './path'
import type { AstRow, Lang } from './skeleton'

type Pos = { line: number; column: number }
type Node = { kind: string; field: string | null; start: Pos; end: Pos; children: Node[] }

const OPEN = /(?:([a-z_]+):\s*)?\(([a-z_]+) \[(\d+), (\d+)\] - \[(\d+), (\d+)\]|\)/g

/** Parses `tree-sitter parse` output into a node tree. */
const parseSexp = (sexp: string): Node[] => {
  const root: Node = { kind: 'root', field: null, start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, children: [] }
  ;[...sexp.matchAll(OPEN)].reduce<Node[]>(
    (stack, m) => {
      if (m[0] === ')') return stack.slice(0, -1)
      const node: Node = {
        kind: m[2] ?? '',
        field: m[1] ?? null,
        start: { line: Number(m[3]), column: Number(m[4]) },
        end: { line: Number(m[5]), column: Number(m[6]) },
        children: [],
      }
      stack[stack.length - 1]?.children.push(node)
      return [...stack, node]
    },
    [root],
  )
  return root.children
}

const preorder = (nodes: readonly Node[]): Node[] => nodes.flatMap(node => [node, ...preorder(node.children)])

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The source text between two tree-sitter positions (columns are bytes). */
const slicer = (source: string) => {
  const lines = source.split('\n').map(line => encoder.encode(`${line}\n`))
  const offsets = lines.reduce<number[]>((acc, line) => [...acc, (acc[acc.length - 1] ?? 0) + line.length], [0])
  const bytes = encoder.encode(source)
  return (start: Pos, end: Pos): string =>
    decoder.decode(bytes.slice((offsets[start.line] ?? 0) + start.column, (offsets[end.line] ?? 0) + end.column))
}

const row = (ruleId: string, node: Node, slice: (a: Pos, b: Pos) => string): AstRow => ({
  ruleId,
  text: slice(node.start, node.end),
  start: node.start,
  end: node.end,
})

const ruleOf = (lang: Lang, node: Node, nameText: (node: Node) => string | null): string | null => {
  if (lang === 'bash') {
    if (node.kind === 'function_definition') return 'fn'
    if (node.kind === 'command_name') return 'cmd'
    if (node.kind !== 'command') return null
    const name = nameText(node)
    return name === 'exit' ? 'exit' : name === 'source' || name === '.' ? 'source' : null
  }
  if (node.kind === 'function_declaration') return 'fn'
  if (node.kind === 'variable_declarator')
    return node.children.some(child => child.field === 'value' && child.kind === 'arrow_function') ? 'fn' : null
  return node.kind === 'call_expression' ? 'call' : node.kind === 'import_statement' ? 'import' : null
}

/** Rows matching rules.ts's rule ids, from `tree-sitter parse` output and the source. */
export const sexpToRows = (sexp: string, source: string, lang: Lang): AstRow[] => {
  const slice = slicer(source)
  const nameText = (command: Node): string | null => {
    const name = command.children.find(child => child.kind === 'command_name')
    return name === undefined ? null : slice(name.start, name.end)
  }
  return preorder(parseSexp(sexp)).flatMap(node => {
    const ruleId = ruleOf(lang, node, nameText)
    return ruleId === null ? [] : [row(ruleId, node, slice)]
  })
}

/** Where parser .so files may be: the option, nvim's runtimepath, then XDG defaults. */
export const parserDirsFrom = (from: { option: string; nvimFiles: string; dataHome: string }): string[] => [
  ...new Set(
    [
      from.option,
      ...from.nvimFiles
        .split('\n')
        .filter(line => line.endsWith('.so'))
        .map(dirOf),
      `${from.dataHome}/nvim/site/parser`,
      `${from.dataHome}/nvim/lazy/nvim-treesitter/parser`,
    ].filter(dir => dir !== ''),
  ),
]

const NVIM_LUA = 'lua io.write(table.concat(vim.api.nvim_get_runtime_file("parser/*.so", true), "\\n"))'

export const nvimParserDirs = async (host: Host, tools: Tools, options: PluginOptions): Promise<string[]> => {
  const nvim = tools.nvim
  const nvimFiles =
    nvim === undefined
      ? ''
      : (await host.run([nvim, '--headless', '-c', NVIM_LUA, '-c', 'q'], { stdin: '', timeoutMs: 10000 }).catch(
          () => ({ stdout: '' }),
        )).stdout
  const home = (await host.env('HOME')) ?? ''
  const dataHome = (await host.env('XDG_DATA_HOME')) || `${home}/.local/share`
  return parserDirsFrom({ option: String(options.nvimParserDir ?? ''), nvimFiles, dataHome })
}

/** Rows for one file through the tree-sitter CLI and a prebuilt parser. */
export const fallbackRows = async (
  host: Host,
  tools: Tools,
  dirs: readonly string[],
  file: string,
  lang: Lang,
  missing = 'ast-grep not found',
): Promise<AstRow[] | Failure> => {
  const treeSitter = tools['tree-sitter']
  if (treeSitter === undefined) return { error: missing }
  const found = await Promise.all(
    dirs.map(async dir => ((await host.exists(`${dir}/${lang}.so`)) ? `${dir}/${lang}.so` : null)),
  )
  const so = found.find(path => path !== null)
  if (so === undefined || so === null) return { error: `no ${lang} parser for tree-sitter` }
  const { exitCode, stdout, stderr } = await host.run(
    [treeSitter, 'parse', '--lib-path', so, '--lang-name', lang, file],
    { stdin: '', timeoutMs: 30000 },
  )
  if (exitCode !== 0 && stdout.trim() === '') return { error: `tree-sitter failed: ${stderr.split('\n')[0] ?? ''}` }
  return sexpToRows(stdout, await host.read(file), lang)
}
