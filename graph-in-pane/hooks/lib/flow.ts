import type { Mode, Openable, View } from '../../types'
import { titleOf } from './commands'
import { emptyView } from './nav'
import type { Skeleton } from './skeleton'

export const SHOW_GRAPH = 'show_graph'
export const SHOW_GRAPH_TOOL = 'mcp__graph-in-pane__show_graph'

export const SHOW_GRAPH_DESCRIPTION =
  "Show a Graphviz graph in the user's graph pane, docked beside the chat. kind \"plan\": the plan under discussion as boxes and arrows. kind \"flow\": a 10,000-foot flow of code, answering a /graph-flow request. Give a plain digraph with no styling; the pane applies its own top-down dark style."

export const SHOW_GRAPH_SCHEMA = {
  type: 'object',
  required: ['kind', 'title', 'dot'],
  properties: {
    kind: { enum: ['plan', 'flow'] },
    title: { type: 'string' },
    dot: { type: 'string', description: 'Graphviz digraph, no styling; the pane styles it' },
    target: { type: 'string', description: 'flow only: the file or file#fn this graph is about' },
    openable: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        required: ['n', 'label', 'target'],
        properties: { n: { type: 'integer', minimum: 1 }, label: { type: 'string' }, target: { type: 'string' } },
      },
    },
  },
} as const

export const SKELETON = 'graph_skeleton'
export const SKELETON_DESCRIPTION =
  'The tree-sitter skeleton of a bash, TypeScript or JavaScript file or dir as JSON: functions with line ranges, calls (to own functions or external commands), exit codes and dependencies, with own-file dependencies resolved. Use it to ground a flow graph of code in what the code actually does.'
export const SKELETON_SCHEMA = {
  type: 'object',
  required: ['target'],
  properties: { target: { type: 'string', description: 'absolute path of a file or dir' } },
} as const

export const RESULT = {
  shown: 'shown in the graph pane',
  hidden: 'drawn; the pane is not visible (narrow terminal), the user was told to run /graph',
  status: 'plan graph updated · /graph',
  stored: 'saved as the latest plan graph; the user is browsing another graph and was told to run /graph',
} as const

export type ShowGraph = { kind: Extract<Mode, 'plan' | 'flow'>; title: string; dot: string; target: string; openable: Openable[] }

/** The tool input checked; a string says what is wrong. */
export const parseShowGraph = (input: Record<string, unknown>): ShowGraph | string => {
  const { kind, title, dot, target, openable } = input
  if (kind !== 'plan' && kind !== 'flow') return 'kind must be "plan" or "flow"'
  if (typeof title !== 'string' || title === '') return 'title must be a non-empty string'
  if (typeof dot !== 'string' || !dot.includes('{')) return 'dot must be a Graphviz digraph'
  const boxes = (Array.isArray(openable) ? openable : [])
    .filter(
      (o): o is Openable =>
        typeof o === 'object' && o !== null && Number.isInteger(o.n) && typeof o.label === 'string' && typeof o.target === 'string',
    )
    .map(o => ({ n: o.n, label: o.label, target: o.target }))
  return { kind, title, dot, target: typeof target === 'string' && target !== '' ? target : title, openable: boxes }
}

export const waitingView = (target: string): View => ({ ...emptyView('flow', titleOf(target), target), waiting: true })

const countFns = (sk: Skeleton): number => sk.files.reduce((sum, file) => sum + file.fns.length, 0)

export const flowSummary = (sk: Skeleton, target: string): string =>
  `graph-flow: skeleton of ${target} sent to Claude (${sk.files.length} files, ${countFns(sk)} functions)`

/** The request /graph-flow hands Claude, as the transcript shows it: the rules. */
export const flowRequest = (target: string): string =>
  [
    `graph-in-pane /graph-flow request for ${target}.`,
    'Draw its flow from 10,000 feet: 5–12 boxes for phases, top-down, failure exits as red ovals.',
    `First call mcp__graph-in-pane__graph_skeleton with target "${target}" for its tree-sitter skeleton.`,
    'Every arrow must be backed by that skeleton (an arrow may merge several calls); do not invent flow.',
    "Number the boxes that stand for the user's own files or large functions (① ②…) and list them in `openable` with n, label and target (absolute file path, or file#function).",
    `Call mcp__graph-in-pane__show_graph with kind "flow", target "${target}", a short title and the DOT (no styling). Then reply in at most two sentences.`,
  ].join('\n')
