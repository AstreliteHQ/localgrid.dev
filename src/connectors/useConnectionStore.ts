import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useWidgetStateStore } from '@/widgets/useWidgetState'
import { canConnect, connectionKey, sanitizeConnections, type Connection } from './connectionGraph'
import { useConnectorSettings } from './useConnectorSettings'

export const CONNECTIONS_STORAGE_KEY = 'localgrid.connections'

/** Runtime guard on top of the no-loop rule: a link writing more than
 * `BURST_LIMIT` times within `BURST_WINDOW_MS` is cut. Typing through a chain
 * stays far below it. */
export const BURST_WINDOW_MS = 1000
export const BURST_LIMIT = 50

/** Input list opened on a widget, at a viewport position. With `from`, it
 * asks which input a dropped connection should feed; without, it lists the
 * widget's inputs so one can be disconnected. */
export interface InputMenu {
  to: string
  x: number
  y: number
  from?: string
}

interface ConnectionState {
  connections: Connection[]
  /** Last value each source published, pushed to a link as soon as it is made. */
  outputs: Record<string, string>
  /** Source of the connection being dragged, if any. */
  drag: { from: string } | null
  /** `connectionKey` of the wire under the pointer, highlighted everywhere. */
  hovered: string | null
  menu: InputMenu | null
  /** Returns false when the link breaks a rule (see `canConnect`). Replaces
   * whatever was feeding that input before. */
  connect: (from: string, to: string, input: string) => boolean
  disconnect: (to: string, input: string) => void
  /** Drops every link touching these instances. Called when widgets are removed. */
  removeInstances: (instanceIds: string[]) => void
  /** Replaces every link, e.g. with the ones a share link carried. */
  setConnections: (connections: readonly Connection[]) => void
  publish: (from: string, value: string) => void
  startDrag: (from: string) => void
  endDrag: () => void
  setHovered: (key: string | null) => void
  openMenu: (menu: InputMenu) => void
  closeMenu: () => void
}

const bursts = new Map<string, { start: number; count: number }>()

function withinBudget(key: string): boolean {
  const now = Date.now()
  const burst = bursts.get(key)
  if (!burst || now - burst.start > BURST_WINDOW_MS) {
    bursts.set(key, { start: now, count: 1 })
    return true
  }
  burst.count += 1
  return burst.count <= BURST_LIMIT
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => {
      /** Writes into the target's input field, unless it already holds this
       * value or connectors are turned off. */
      const push = (link: Connection, value: string) => {
        if (!useConnectorSettings.getState().enabled) return
        const key = connectionKey(link)
        const widgetState = useWidgetStateStore.getState()
        if (widgetState.values[key] === value) return
        if (!withinBudget(key)) {
          console.warn(`Connection into ${key} fired too often and was removed`)
          get().disconnect(link.to, link.input)
          return
        }
        widgetState.setValue(key, value)
      }

      return {
        connections: [],
        outputs: {},
        drag: null,
        hovered: null,
        menu: null,

        connect: (from, to, input) => {
          const { connections, outputs } = get()
          if (!canConnect(connections, from, to, input)) return false
          const link = { from, to, input }
          const key = connectionKey(link)
          bursts.delete(key)
          set({ connections: [...connections.filter((other) => connectionKey(other) !== key), link] })
          if (from in outputs) push(link, outputs[from])
          return true
        },

        disconnect: (to, input) =>
          set((state) => ({
            connections: state.connections.filter((link) => link.to !== to || link.input !== input),
          })),

        removeInstances: (instanceIds) =>
          set((state) => ({
            connections: state.connections.filter(
              (link) => !instanceIds.includes(link.from) && !instanceIds.includes(link.to),
            ),
            outputs: Object.fromEntries(Object.entries(state.outputs).filter(([id]) => !instanceIds.includes(id))),
          })),

        setConnections: (connections) => set({ connections: sanitizeConnections(connections) }),

        publish: (from, value) => {
          if (get().outputs[from] !== value) set((state) => ({ outputs: { ...state.outputs, [from]: value } }))
          for (const link of get().connections) if (link.from === from) push(link, value)
        },

        startDrag: (from) => set({ drag: { from } }),
        endDrag: () => set({ drag: null }),
        setHovered: (key) => set((state) => (state.hovered === key ? state : { hovered: key })),
        openMenu: (menu) => set({ menu }),
        closeMenu: () => set({ menu: null }),
      }
    },
    {
      name: CONNECTIONS_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ connections: state.connections }),
      merge: (persisted, current) => ({
        ...current,
        connections: sanitizeConnections((persisted as { connections?: unknown } | undefined)?.connections),
      }),
    },
  ),
)

// Links pause while connectors are off; turning them back on catches every
// target up with its source's current output.
useConnectorSettings.subscribe((settings, previous) => {
  if (!settings.enabled || previous.enabled) return
  const { connections, outputs, publish } = useConnectionStore.getState()
  for (const from of new Set(connections.map((link) => link.from))) {
    if (from in outputs) publish(from, outputs[from])
  }
})
