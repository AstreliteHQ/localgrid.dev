import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

function fireBeforeUnload(): Event {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('useUnsavedChangesGuard', () => {
  it('lets the page unload when no widget is dirty', () => {
    renderHook(() => useUnsavedChangesGuard())
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })

  it('blocks the unload while a widget is dirty, and stops once it is clean', () => {
    renderHook(() => useUnsavedChangesGuard())
    const { rerender } = renderHook(({ isDirty }: { isDirty: boolean }) => useWidgetDirty('guard-a', isDirty), {
      initialProps: { isDirty: true },
    })
    expect(fireBeforeUnload().defaultPrevented).toBe(true)

    rerender({ isDirty: false })
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })

  it('removes its listener on unmount', () => {
    const guard = renderHook(() => useUnsavedChangesGuard())
    renderHook(() => useWidgetDirty('guard-b', true))
    guard.unmount()
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })
})
