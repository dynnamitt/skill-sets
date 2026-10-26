import type { Mode, Nav, View } from '../../types'

/** Openable boxes per page; the digits 1-9 are their hotkeys. */
export const PAGE = 9
const MAX_STACK = 20

/** The breadcrumb's actions. */
export type NavAction =
  | { type: 'reset'; view: View }
  | { type: 'push'; view: View }
  | { type: 'pop' }
  | { type: 'replaceTop'; view: View }
  | { type: 'replaceIf'; was: View; view: View }
  | { type: 'page' }

/**
 * A view with nothing drawn yet.
 * @param {Mode} mode the view's mode
 * @param {string} title the breadcrumb title
 * @param {string} target what the view shows
 * @returns {View} the blank view
 */
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
  mtimeMs: 0,
})

/**
 * The view on top of the breadcrumb.
 * @param {Nav} nav the breadcrumb
 * @returns {View | undefined} the top view, else undefined when empty
 */
export const topOf = (nav: Nav): View | undefined => nav.stack[nav.stack.length - 1]

const withTop = (nav: Nav, view: View): Nav =>
  nav.stack.length === 0 ? { stack: [view] } : { stack: [...nav.stack.slice(0, -1), view] }

const pages = (view: View): number => Math.max(1, Math.ceil(view.openable.length / PAGE))

/**
 * The breadcrumb's transitions.
 * @param {Nav} nav the current breadcrumb
 * @param {NavAction} action what happened
 * @returns {Nav} the next breadcrumb
 */
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
    case 'replaceIf':
      return top !== undefined && top.mode === action.was.mode && top.target === action.was.target && top.gen === action.was.gen
        ? withTop(nav, action.view)
        : nav
    case 'page':
      return top === undefined ? nav : withTop(nav, { ...top, page: (top.page + 1) % pages(top) })
  }
}

/**
 * The openable boxes on the shown page, with the hotkey each answers to.
 * @param {View} view the view
 * @returns {{ hotkey: string; n: number; label: string; target: string }[]} up to PAGE boxes
 */
export const pageOf = (view: View): { hotkey: string; n: number; label: string; target: string }[] =>
  view.openable.slice(view.page * PAGE, view.page * PAGE + PAGE).map((o, i) => ({ ...o, hotkey: String(i + 1) }))
