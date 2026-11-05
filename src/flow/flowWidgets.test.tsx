import { Suspense } from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { WIDGET_REGISTRY } from '@/widgets/registry'
import { FlowInstanceContext } from './flowContext'
import { useFlowStore } from './useFlowStore'

const CONNECTABLE = Object.values(WIDGET_REGISTRY).filter((definition) => definition.flow)

/** Shown either as a form field's value or as editor text (CodeMirror). */
function isDisplayed(container: HTMLElement, value: string): boolean {
  return screen.queryAllByDisplayValue(value).length > 0 || (container.textContent ?? '').includes(value)
}

// One check per connectable widget, so a widget added later is covered too:
// what a link writes must show up in the field (the "field shows its
// state" contract), and a declared output must actually be published.
describe.each(CONNECTABLE.map((definition) => [definition.id, definition] as const))('%s flow', (_id, definition) => {
  it('displays values wired into its visible inputs and publishes its output', async () => {
    const Widget = definition.component
    const { container } = render(
      <FlowInstanceContext.Provider value="widget">
        <Suspense fallback={null}>
          <Widget instanceId="widget" mode="grid" />
        </Suspense>
      </FlowInstanceContext.Provider>,
    )
    await waitFor(() => expect(container.childElementCount).toBeGreaterThan(0))

    const declared = definition.flow?.inputs?.map((input) => input.field) ?? []
    const shown = [...container.querySelectorAll('[data-flow-slot]')]
      .map((slot) => slot.getAttribute('data-flow-slot'))
      .filter((slot): slot is string => slot !== null && slot !== 'output')
    expect(declared).toEqual(expect.arrayContaining(shown))

    for (const field of shown) {
      const value = `wired-${field}-value`
      act(() => {
        useFlowStore.getState().connect(`source-${field}`, 'widget', field)
        useFlowStore.getState().publish(`source-${field}`, value)
      })
      await waitFor(() => expect(isDisplayed(container, value)).toBe(true))
    }

    if (definition.flow?.output) {
      expect(typeof useFlowStore.getState().outputs.widget).toBe('string')
    }
  })
})
