import { createContext } from 'react'

/** Instance id of the widget being rendered, set on the dashboard (grid and
 * mobile stack) while flow is on. Flow UI renders nothing elsewhere
 * (overlay). Wires are only drawn in the editable grid. */
export const FlowInstanceContext = createContext<string | null>(null)
