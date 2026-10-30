import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { useWidgetStateStore } from '@/widgets/useWidgetState'
import { useConnectionStore } from '@/connectors/useConnectionStore'
import { DEFAULT_CONNECTOR_SETTINGS, useConnectorSettings } from '@/connectors/useConnectorSettings'

// Widget content now lives in a store keyed by instanceId rather than local
// component state, so a fresh `render()` no longer guarantees a fresh
// value — tests that reuse the same instanceId across `it()` blocks (a
// common pattern, e.g. `instanceId="test"`) would otherwise silently bleed
// content into each other. Reset centrally here instead of requiring every
// widget test file to remember a unique id per test.
afterEach(() => {
  useWidgetStateStore.setState({ values: {} })
  useConnectionStore.setState({ connections: [], outputs: {}, drag: null, hovered: null, menu: null })
  useConnectorSettings.setState(DEFAULT_CONNECTOR_SETTINGS)
})

// jsdom doesn't implement matchMedia — useMediaQuery (dark-mode detection,
// the editable-grid breakpoint) needs it to exist even if tests don't care
// about its result.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

// jsdom doesn't implement ResizeObserver — cmdk uses it internally to size
// its results list.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom doesn't implement scrollIntoView — cmdk calls it when the selected
// item changes.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom doesn't implement Range.getClientRects/getBoundingClientRect (real
// layout geometry, which it never computes) — @codemirror/merge's MergeView
// schedules a requestAnimationFrame-based measure pass (to align the two
// panes' gutters/revert controls) on construction and after every
// reconfigure(), which walks into these to measure line heights. Real
// browsers always have them; without a stub here, that measure pass throws
// an *uncaught* exception (it runs in a rAF callback outside any test's own
// call stack, so it isn't a normal assertion failure — it can still fire
// after a test that triggered several edits finishes, before its cleanup's
// `MergeView.destroy()` gets a chance to cancel the pending frame).
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect
}
