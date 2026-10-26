import type { Elements, RenderSurface } from 'claude-code'

import type { Nav, View } from '../../types'
import { fitBox } from './dot'
import { PAGE, pageOf, topOf } from './nav'

/** What the pane draws with: surface, width, rows and focus. */
export type PaneCtx = { surface: RenderSurface; bodyColumns: number; rows: number; isFocused: boolean }
/** The handlers the pane's buttons call. */
export type PaneActions = { back: () => void; open: (n: number) => void; more: () => void }

const EMPTY = 'No graph yet: /graph-tree or /graph-flow a file or dir.'
const CHROME_ROWS = 6

/**
 * The pane's drawing for the breadcrumb's top view; pure, handlers passed in.
 * @param {Elements[RenderSurface]} t the surface's element table
 * @param {Nav} nav the breadcrumb
 * @param {PaneCtx} ctx surface, size and focus
 * @param {PaneActions} actions the button handlers
 * @returns the pane's element tree
 */
export const paneTree = (t: Elements[RenderSurface], nav: Nav, ctx: PaneCtx, actions: PaneActions) => {
  const { Box, Text, Button } = t
  // Other surfaces' tables carry an Image that draws nothing: only the terminal paints one.
  const Image = ctx.surface === 'terminal' && 'Image' in t ? t.Image : undefined
  const view: View | undefined = topOf(nav)
  if (view === undefined) return <Text dimColor>{EMPTY}</Text>

  const keys = pageOf(view)
  const hasKeys = keys.length > 0 || nav.stack.length > 1
  const box = view.px === null ? null : fitBox(view.px, { columns: ctx.bodyColumns, rows: Math.max(4, ctx.rows - CHROME_ROWS) })
  // An error over a picture that drew before (a bad save of a followed .dot) keeps the picture.
  const picture =
    view.error !== null && view.png === null ? (
      <Text color="red">{view.error}</Text>
    ) : view.waiting ? (
      <Text dimColor>asking Claude…</Text>
    ) : Image !== undefined && view.png !== null && box !== null ? (
      <Image
        source={{ file: view.png, format: 'png', generation: view.gen }}
        columns={Math.min(255, box.columns)}
        rows={Math.min(255, box.rows)}
        alt={view.alt}
      />
    ) : (
      <Text>{view.alt}</Text>
    )

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        {nav.stack.length > 1 && (
          <Button key="back" hotkey="0" plain onPress={actions.back}>
            back
          </Button>
        )}
        <Text>{nav.stack.map(v => v.title).join(' › ')}</Text>
      </Box>
      {picture}
      {view.error !== null && view.png !== null && <Text color="red">{view.error}</Text>}
      {keys.length > 0 && (
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {keys.map(k => (
            <Button key={`open-${k.n}`} hotkey={k.hotkey} plain onPress={() => actions.open(k.n)}>
              {k.label}
            </Button>
          ))}
          {view.openable.length > PAGE && (
            <Button key="more" hotkey="m" plain onPress={actions.more}>
              more
            </Button>
          )}
        </Box>
      )}
      {hasKeys && !ctx.isFocused && <Text dimColor>ctrl+x tab to use keys</Text>}
    </Box>
  )
}
