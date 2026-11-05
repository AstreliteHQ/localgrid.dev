import { createContext } from 'react'

/** Instance id of the widget being rendered, set only inside the editable
 * dashboard grid, the one place wires are drawn. Flow UI renders
 * nothing elsewhere (overlay, mobile stack). */
export const FlowInstanceContext = createContext<string | null>(null)
