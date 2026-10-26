import type { Mode, Openable, View } from '../../types'
import { titleOf } from './commands'
import { emptyView } from './nav'

/** The show_graph tool's short name. */
export const SHOW_GRAPH = 'show_graph'
/** The show_graph tool's full name, as Claude calls it. */
export const SHOW_GRAPH_TOOL = 'mcp__graph-in-pane__show_graph'

/** What show_graph tells Claude it does. */
export const SHOW_GRAPH_DESCRIPTION =
  "Show a Graphviz graph in the user's graph pane, docked beside the chat. kind \"plan\": the plan under discussion as boxes and arrows. kind \"flow\": a 10,000-foot flow of code, answering a /graph-flow request. Give a plain digraph with no styling; the pane applies its own top-down dark style."

/** The JSON schema of show_graph's input. */
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

/** The graph_skeleton tool's name. */
export const SKELETON = 'graph_skeleton'
/** What graph_skeleton tells Claude it does. */
export const SKELETON_DESCRIPTION =
  'The tree-sitter skeleton of a bash, TypeScript or JavaScript file or dir as JSON: functions with line ranges, calls (to own functions or external commands), exit codes and dependencies, with own-file dependencies resolved. Use it to ground a flow graph of code in what the code actually does.'
/** The JSON schema of graph_skeleton's input. */
export const SKELETON_SCHEMA = {
  type: 'object',
  required: ['target'],
  properties: { target: { type: 'string', description: 'absolute path of a file or dir' } },
} as const

/** The texts show_graph answers with, by outcome. */
export const RESULT = {
  shown: 'shown in the graph pane',
  hidden: 'drawn; the pane is not visible (narrow terminal), the user was told to run /graph',
  status: 'plan graph updated · /graph',
  stored: 'saved as the latest plan graph; the user is browsing another graph and was told to run /graph',
} as const

/** A checked show_graph input. */
export type ShowGraph = { kind: Extract<Mode, 'plan' | 'flow'>; title: string; dot: string; target: string; openable: Openable[] }

/**
 * The tool input checked; a string says what is wrong.
 * @param {Record<string, unknown>} input the raw show_graph input
 * @returns {ShowGraph | string} the checked graph, else the complaint
 */
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

/**
 * The placeholder view while Claude draws a /graph-flow.
 * @param {string} target the file or dir being graphed
 * @returns {View} an empty flow view marked waiting
 */
export const waitingView = (target: string): View => ({ ...emptyView('flow', titleOf(target), target), waiting: true })

/**
 * The line /graph-flow answers with once the skeleton is on its way.
 * @param {string} target the file or dir being graphed
 * @param {number} files how many source files it covers
 * @returns {string} the summary line
 */
export const flowSummary = (target: string, files: number): string =>
  `graph-flow: skeleton of ${target} sent to Claude (${files} file${files === 1 ? '' : 's'})`

/**
 * The request /graph-flow hands Claude, as the transcript shows it: the rules.
 * @param {string} target the file or dir to graph
 * @returns {string} the request text
 */
export const flowRequest = (target: string): string =>
  [
    `graph-in-pane /graph-flow request for ${target}.`,
    'Draw its flow from 10,000 feet: 5–12 boxes for phases, top-down, failure exits as red ovals.',
    `First call mcp__graph-in-pane__graph_skeleton with target "${target}" for its tree-sitter skeleton.`,
    'Every arrow must be backed by that skeleton (an arrow may merge several calls); do not invent flow.',
    "Number the boxes that stand for the user's own files or large functions (① ②…) and list them in `openable` with n, label and target (absolute file path, or file#function).",
    `Call mcp__graph-in-pane__show_graph with kind "flow", target "${target}", a short title and the DOT (no styling). Then reply in at most two sentences.`,
  ].join('\n')
