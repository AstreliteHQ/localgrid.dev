import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import { useWidgetStateStore } from './useWidgetState'

interface WidgetDirtyState {
  dirtyByInstance: Record<string, boolean>
  /** Per-instance, not global — bumping just one instance's nonce is what
   * forces just that widget to remount (see `useWidgetResetNonce`). Needed
   * because every dashboard tab stays mounted at once now: a single global
   * counter would reset every widget on every tab simultaneously instead of
   * just the ones on the tab you're actually looking at. */
  resetNonceByInstance: Record<string, number>
  setDirty: (instanceId: string, isDirty: boolean) => void
  resetWidgets: (instanceIds: string[]) => void
}

const useWidgetDirtyStore = create<WidgetDirtyState>((set) => ({
  dirtyByInstance: {},
  resetNonceByInstance: {},
  setDirty: (instanceId, isDirty) =>
    set((state) => {
      if (state.dirtyByInstance[instanceId] === isDirty) return state
      return { dirtyByInstance: { ...state.dirtyByInstance, [instanceId]: isDirty } }
    }),
  // Clears the given instances' dirty flags eagerly rather than waiting for
  // each remounted widget's effect to report back in — the indicator
  // disappears the instant you click.
  resetWidgets: (instanceIds) =>
    set((state) => {
      const nextNonce = { ...state.resetNonceByInstance }
      const nextDirty = { ...state.dirtyByInstance }
      for (const instanceId of instanceIds) {
        nextNonce[instanceId] = (nextNonce[instanceId] ?? 0) + 1
        delete nextDirty[instanceId]
      }
      return { resetNonceByInstance: nextNonce, dirtyByInstance: nextDirty }
    }),
}))

/** A widget calls this with its own definition of "has moved from default"
 * (there's no generic way to detect that — every widget's default differs)
 * to report its dirty status. Cleans up on unmount, which covers both real
 * removal and the remount `resetWidgets` triggers via the per-instance
 * nonce. */
export function useWidgetDirty(instanceId: string, isDirty: boolean): void {
  useEffect(() => {
    useWidgetDirtyStore.getState().setDirty(instanceId, isDirty)
    return () => useWidgetDirtyStore.getState().setDirty(instanceId, false)
  }, [instanceId, isDirty])
}

/** Read by WidgetShell to decide whether to show the border pulse + dot. */
export function useIsWidgetDirty(instanceId: string): boolean {
  return useWidgetDirtyStore((state) => state.dirtyByInstance[instanceId] ?? false)
}

/** True if any of the given instances — typically "the active dashboard's
 * widgets" — is currently dirty. Read by the header's "Clear state" button
 * to disable itself when there's nothing to clear on the tab you're on. */
export function useAnyWidgetDirty(instanceIds: string[]): boolean {
  return useWidgetDirtyStore((state) => instanceIds.some((id) => state.dirtyByInstance[id]))
}

/** Non-reactive snapshot of "is any widget anywhere dirty", read at the
 * moment of a `beforeunload` event (see useUnsavedChangesGuard). Every
 * dashboard tab stays mounted, so this covers all tabs, not just the
 * active one. */
export function hasAnyDirtyWidget(): boolean {
  return Object.values(useWidgetDirtyStore.getState().dirtyByInstance).some(Boolean)
}

/** Read by WidgetGridItem/WidgetOverlay for the widget element's `key`. */
export function useWidgetResetNonce(instanceId: string): number {
  return useWidgetDirtyStore((state) => state.resetNonceByInstance[instanceId] ?? 0)
}

/** The header's "Clear state" button calls this with the active dashboard's
 * instance ids. Bumping the nonce (forces a remount) alone isn't enough on
 * its own — a fresh mount would otherwise still read whatever's left in
 * useWidgetState's store for that instance, so both have to be cleared
 * together. The remount still matters even with the store cleared: it's
 * what makes any impure/derived default (e.g. TimestampConverterWidget's
 * `Date.now()`-based initial value) recompute instead of reusing whatever
 * was cached at the widget's original mount. */
export function useResetWidgets(): (instanceIds: string[]) => void {
  const resetDirtyAndNonce = useWidgetDirtyStore((state) => state.resetWidgets)
  return useCallback(
    (instanceIds: string[]) => {
      resetDirtyAndNonce(instanceIds)
      useWidgetStateStore.getState().resetInstances(instanceIds)
    },
    [resetDirtyAndNonce],
  )
}
