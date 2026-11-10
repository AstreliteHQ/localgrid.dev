import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useWidgetStateStore } from '@/widgets/useWidgetState'
import { canConnect, linkKey, sanitizeLinks, type Link } from './linkGraph'
import { useFlowSettings } from './useFlowSettings'

export const FLOW_STORAGE_KEY = 'localgrid.flow'

/** Runtime guard on top of the no-loop rule: a link writing more than
 * `BURST_LIMIT` times within `BURST_WINDOW_MS` is cut. Typing through a chain
 * stays far below it. */
export const BURST_WINDOW_MS = 1000
export const BURST_LIMIT = 50

/** Input list opened on a widget, at a viewport position. With `from`, it
 * asks which input a dropped link should feed; without, it lists the
 * widget's inputs so one can be disconnected. */
export interface InputMenu {
  to: string
  x: number
  y: number
  from?: string
}

/** Menu opened by clicking a widget's OUT tab, listing what it can feed. */
export interface ConnectMenu {
  from: string
  x: number
  y: number
}

/** Menu opened by clicking a wire, at a viewport position. */
export interface LinkMenu {
  /** `linkKey` of the clicked link. */
  key: string
  x: number
  y: number
}

interface FlowState {
  links: Link[]
  /** Last value each source published, pushed to a link as soon as it is made. */
  outputs: Record<string, string>
  /** Source of the link being dragged, if any. */
  drag: { from: string } | null
  /** `linkKey` of the wire under the pointer, highlighted everywhere. */
  hovered: string | null
  menu: InputMenu | null
  linkMenu: LinkMenu | null
  connectMenu: ConnectMenu | null
  /** Returns false when the link breaks a rule (see `canConnect`). Replaces
   * whatever was feeding that input before. */
  connect: (from: string, to: string, input: string) => boolean
  disconnect: (to: string, input: string) => void
  /** Sets a link's palette color, or `undefined` to go back to its source's color. */
  setLinkColor: (to: string, input: string, color: number | undefined) => void
  /** Drops every link touching these instances. Called when widgets are removed. */
  removeInstances: (instanceIds: string[]) => void
  /** Replaces every link, e.g. with the ones a share link carried. */
  setLinks: (links: readonly Link[]) => void
  publish: (from: string, value: string) => void
  startDrag: (from: string) => void
  endDrag: () => void
  setHovered: (key: string | null) => void
  openMenu: (menu: InputMenu) => void
  closeMenu: () => void
  openLinkMenu: (menu: LinkMenu) => void
  closeLinkMenu: () => void
  openConnectMenu: (menu: ConnectMenu) => void
  closeConnectMenu: () => void
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

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => {
      /** Writes into the target's input field, unless it already holds this
       * value or flow is turned off. */
      const push = (link: Link, value: string) => {
        if (!useFlowSettings.getState().enabled) return
        const key = linkKey(link)
        const widgetState = useWidgetStateStore.getState()
        if (widgetState.values[key] === value) return
        if (!withinBudget(key)) {
          console.warn(`Link into ${key} fired too often and was removed`)
          get().disconnect(link.to, link.input)
          return
        }
        widgetState.setValue(key, value)
      }

      return {
        links: [],
        outputs: {},
        drag: null,
        hovered: null,
        menu: null,
        linkMenu: null,
        connectMenu: null,

        connect: (from, to, input) => {
          const { links, outputs } = get()
          if (!canConnect(links, from, to, input)) return false
          const link = { from, to, input }
          const key = linkKey(link)
          bursts.delete(key)
          set({ links: [...links.filter((other) => linkKey(other) !== key), link] })
          if (from in outputs) push(link, outputs[from])
          return true
        },

        setLinkColor: (to, input, color) =>
          set((state) => ({
            links: state.links.map((link) => {
              if (link.to !== to || link.input !== input) return link
              const { color: _previous, ...rest } = link
              return color === undefined ? rest : { ...rest, color }
            }),
          })),

        disconnect: (to, input) =>
          set((state) => ({
            links: state.links.filter((link) => link.to !== to || link.input !== input),
          })),

        removeInstances: (instanceIds) =>
          set((state) => ({
            links: state.links.filter((link) => !instanceIds.includes(link.from) && !instanceIds.includes(link.to)),
            outputs: Object.fromEntries(Object.entries(state.outputs).filter(([id]) => !instanceIds.includes(id))),
          })),

        setLinks: (links) => set({ links: sanitizeLinks(links) }),

        publish: (from, value) => {
          if (get().outputs[from] !== value) set((state) => ({ outputs: { ...state.outputs, [from]: value } }))
          for (const link of get().links) if (link.from === from) push(link, value)
        },

        startDrag: (from) => set({ drag: { from } }),
        endDrag: () => set({ drag: null }),
        setHovered: (key) => set((state) => (state.hovered === key ? state : { hovered: key })),
        openMenu: (menu) => set({ menu }),
        closeMenu: () => set({ menu: null }),
        openLinkMenu: (linkMenu) => set({ linkMenu }),
        closeLinkMenu: () => set({ linkMenu: null }),
        openConnectMenu: (connectMenu) => set({ connectMenu }),
        closeConnectMenu: () => set({ connectMenu: null }),
      }
    },
    {
      name: FLOW_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ links: state.links }),
      merge: (persisted, current) => ({
        ...current,
        links: sanitizeLinks((persisted as { links?: unknown } | undefined)?.links),
      }),
    },
  ),
)

// Links pause while flow is off; turning them back on catches every
// target up with its source's current output.
useFlowSettings.subscribe((settings, previous) => {
  if (!settings.enabled || previous.enabled) return
  const { links, outputs, publish } = useFlowStore.getState()
  for (const from of new Set(links.map((link) => link.from))) {
    if (from in outputs) publish(from, outputs[from])
  }
})
