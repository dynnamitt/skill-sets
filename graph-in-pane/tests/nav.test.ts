import { expect, test } from 'claude-code/testing'

import type { View } from '../types'
import { emptyView, type NavAction, navReduce } from '../hooks/lib/nav'

const view = (title: string, extra: Partial<View> = {}): View => ({ ...emptyView('tree', title, `/fx/${title}`), ...extra })

test('reset, push, push, pop leaves the second view shown', async () => {
  const actions: NavAction[] = [
    { type: 'reset', view: view('a') },
    { type: 'push', view: view('b') },
    { type: 'push', view: view('c') },
    { type: 'pop' },
  ]
  const nav = actions.reduce(navReduce, { stack: [] })
  expect(nav.stack.map(v => v.title)).toEqual(['a', 'b'])
})

test('pop on the root alone changes nothing', async () => {
  const nav = navReduce({ stack: [view('a')] }, { type: 'pop' })
  expect(nav.stack.map(v => v.title)).toEqual(['a'])
})

test('page cycles through the openable boxes in nines', async () => {
  const openable = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, label: `f${i + 1}`, target: `/fx/f${i + 1}` }))
  const once = navReduce({ stack: [view('a', { openable })] }, { type: 'page' })
  const twice = navReduce(once, { type: 'page' })
  expect([once.stack[0]?.page, twice.stack[0]?.page]).toEqual([1, 0])
})

test('push keeps at most 20 views', async () => {
  const nav = Array.from({ length: 25 }, (_, i) => view(`v${i}`)).reduce(
    (acc, v) => navReduce(acc, { type: 'push', view: v }),
    { stack: [] as View[] },
  )
  expect(nav.stack.length).toBe(20)
  expect(nav.stack[nav.stack.length - 1]?.title).toBe('v24')
})

test('replaceTop swaps only the shown view', async () => {
  const nav = navReduce({ stack: [view('a'), view('b')] }, { type: 'replaceTop', view: view('c') })
  expect(nav.stack.map(v => v.title)).toEqual(['a', 'c'])
})
