import { expect, test } from 'claude-code/testing'

import type { Nav, View } from '../types'
import { emptyView } from '../hooks/lib/nav'
import type { On } from './world'

const PANE = {
  plugin: 'graph-in-pane',
  component: 'Pane',
  requestId: 'graph',
  props: {
    title: 'graph',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const view = (title: string, extra: Partial<View> = {}): View => ({ ...emptyView('flow', title, `/fx/${title}`), ...extra })

const TWO: Nav = {
  stack: [
    view('ble-pair.sh'),
    view('pick gamepad', {
      png: '/c/s.png',
      gen: 7,
      px: { w: 600, h: 400 },
      alt: 'scan · pick · exit 1',
      openable: [
        { n: 1, label: 'gamepads', target: '/fx/ble-pair.sh#gamepads' },
        { n: 2, label: 'pick', target: '/fx/ble-pair.sh#pick' },
      ],
    }),
  ],
}

/** A versioned in-memory nav state beneath the plugin, recording each write. */
const seed = (on: On, nav: Nav, writes: unknown[] = []) => {
  const store = { value: { shape: 'nav-1', value: nav } as unknown, version: 1 }
  on('state.get', (_, e, next) => (e.key === 'nav' ? { value: { value: store.value, version: store.version } } : next(e)))
  on('state.set', (_, e, next) => {
    if (e.key !== 'nav') return next(e)
    if (e.ifVersion !== undefined && e.ifVersion !== store.version) return { value: { isSet: false, version: store.version } }
    writes.push(e.value)
    store.value = e.value
    store.version += 1
    return { value: { isSet: true, version: store.version } }
  })
}

test('the breadcrumb, numbered keys and back button are drawn', async ($, on) => {
  seed(on, TWO)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: 'ble-pair.sh › pick gamepad' }))?.text).toBe('ble-pair.sh › pick gamepad')
  expect((await ui.find({ key: 'open-1' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'open-2' }))?.props.hotkey).toBe('2')
  expect((await ui.find({ key: 'back' }))?.props.hotkey).toBe('0')
  await ui.unmount()
})

test('pressing back pops the breadcrumb', async ($, on) => {
  const writes: unknown[] = []
  seed(on, TWO, writes)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'back' })
  expect(writes).toEqual([{ shape: 'nav-1', value: { stack: [TWO.stack[0]] } }])
  await ui.unmount()
})

test('the picture is an Image with the alt text and generation', async ($, on) => {
  seed(on, TWO)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const image = await ui.find({ type: 'Image' })
  expect(image?.props.alt).toBe('scan · pick · exit 1')
  expect(image?.props.source).toEqual({ file: '/c/s.png', format: 'png', generation: 7 })
  await ui.unmount()
})

test('unfocused, the pane says how to reach its keys', async ($, on) => {
  seed(on, TWO)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: false }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'ctrl+x tab to use keys' })).toBeDefined()
  await ui.unmount()
})

test('a surface without Image shows the outline as text', async ($, on) => {
  seed(on, TWO)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'scan · pick · exit 1' })).toBeDefined()
  await ui.unmount()
})

test('an error view shows the error and no picture', async ($, on) => {
  seed(on, { stack: [view('notes.py', { error: 'no grammar for .py' })] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'no grammar for .py' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('a waiting view says Claude is drawing', async ($, on) => {
  seed(on, { stack: [view('ble-pair.sh', { waiting: true })] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'asking Claude…' })).toBeDefined()
  await ui.unmount()
})

test('more than nine boxes add a more key', async ($, on) => {
  const openable = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, label: `f${i + 1}`, target: `/fx/f${i + 1}` }))
  seed(on, { stack: [view('dir', { png: '/c/s.png', px: { w: 10, h: 10 }, openable })] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'more' }))?.props.hotkey).toBe('m')
  expect(await ui.find({ key: 'open-10' })).toBeUndefined()
  await ui.unmount()
})
