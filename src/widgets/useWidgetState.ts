import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { create } from 'zustand'

interface WidgetStateStore {
  /** Key = `${instanceId}:${field}` — flat rather than nested so clearing a
   * whole instance (on delete or reset) is a simple prefix filter, and so a
   * widget with several fields (e.g. uuid-generator's five) never risks
   * colliding with another field under the same instanceId. */
  values: Record<string, unknown>
  setValue: (key: string, value: unknown) => void
  /** Drops every key belonging to any of the given instance ids. Used both
   * by "Clear state" (paired with a nonce bump — see useWidgetDirty.ts) and
   * by real widget/dashboard deletion (used alone, nothing to remount). */
  resetInstances: (instanceIds: string[]) => void
  /** Copies every field currently stored under `sourceInstanceId` to the
   * same field names under `targetInstanceId` — used when duplicating a
   * pinned widget, so the copy starts out identical to the original
   * instead of empty. A source with no stored fields yet (never
   * interacted with) is a harmless no-op. */
  duplicateInstance: (sourceInstanceId: string, targetInstanceId: string) => void
}

export const useWidgetStateStore = create<WidgetStateStore>((set) => ({
  values: {},
  setValue: (key, value) => set((state) => ({ values: { ...state.values, [key]: value } })),
  resetInstances: (instanceIds) =>
    set((state) => {
      const prefixes = instanceIds.map((id) => `${id}:`)
      return {
        values: Object.fromEntries(
          Object.entries(state.values).filter(([key]) => !prefixes.some((prefix) => key.startsWith(prefix))),
        ),
      }
    }),
  duplicateInstance: (sourceInstanceId, targetInstanceId) =>
    set((state) => {
      const prefix = `${sourceInstanceId}:`
      const copied: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(state.values)) {
        if (key.startsWith(prefix)) copied[`${targetInstanceId}:${key.slice(prefix.length)}`] = value
      }
      return { values: { ...state.values, ...copied } }
    }),
}))

/** Drop-in replacement for `useState`, backed by a store keyed on
 * `(instanceId, field)` instead of the component instance — so a widget's
 * content survives that component unmounting (tab switch, expand/collapse,
 * a mobile/desktop layout swap) instead of requiring it to stay mounted
 * forever via a portal. `instanceId` is already threaded through every
 * widget via `WidgetProps`; `field` just needs to be unique within that one
 * widget's own calls (e.g. `'input'`, `'direction'`). */
export function useWidgetState<T>(
  instanceId: string,
  field: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const key = `${instanceId}:${field}`
  // Delegates lazy-initializer semantics to a real useState call — this is
  // ONLY the fallback used until the shared store has a real entry for
  // `key`, never the source of truth itself. Reused verbatim across
  // re-renders of the same mount, exactly like useState's own initializer.
  const [fallback] = useState(initial)
  const setStoreValue = useWidgetStateStore((state) => state.setValue)
  const value = useWidgetStateStore((state) => (key in state.values ? (state.values[key] as T) : fallback))

  const setState = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const state = useWidgetStateStore.getState()
      const current = key in state.values ? (state.values[key] as T) : fallback
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(current) : next
      setStoreValue(key, resolved)
    },
    [key, fallback, setStoreValue],
  )

  return [value, setState]
}
