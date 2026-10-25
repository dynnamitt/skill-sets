import type { Mode, Nav, View } from '../../types'

export const PAGE = 9
const MAX_STACK = 20

export type NavAction =
  | { type: 'reset'; view: View }
  | { type: 'push'; view: View }
  | { type: 'pop' }
  | { type: 'replaceTop'; view: View }
  | { type: 'page' }

export const emptyView = (mode: Mode, title: string, target: string): View => ({
  mode,
  title,
  target,
  png: null,
  gen: 0,
  px: null,
  alt: title,
  openable: [],
  page: 0,
  error: null,
  waiting: false,
})

export const topOf = (nav: Nav): View | undefined => nav.stack[nav.stack.length - 1]

const withTop = (nav: Nav, view: View): Nav =>
  nav.stack.length === 0 ? { stack: [view] } : { stack: [...nav.stack.slice(0, -1), view] }

const pages = (view: View): number => Math.max(1, Math.ceil(view.openable.length / PAGE))

/** The breadcrumb's transitions. */
export const navReduce = (nav: Nav, action: NavAction): Nav => {
  const top = topOf(nav)
  switch (action.type) {
    case 'reset':
      return { stack: [action.view] }
    case 'push':
      return { stack: [...nav.stack, action.view].slice(-MAX_STACK) }
    case 'pop':
      return nav.stack.length > 1 ? { stack: nav.stack.slice(0, -1) } : nav
    case 'replaceTop':
      return withTop(nav, action.view)
    case 'page':
      return top === undefined ? nav : withTop(nav, { ...top, page: (top.page + 1) % pages(top) })
  }
}

/** The openable boxes on the shown page, with the hotkey each answers to. */
export const pageOf = (view: View): { hotkey: string; n: number; label: string; target: string }[] =>
  view.openable.slice(view.page * PAGE, view.page * PAGE + PAGE).map((o, i) => ({ ...o, hotkey: String(i + 1) }))
