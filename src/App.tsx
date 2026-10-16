import { CommandPalette } from '@/command-palette/CommandPalette'
import { Dashboard } from '@/dashboard/Dashboard'
import { WidgetOverlay } from '@/overlay/WidgetOverlay'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

function App() {
  useUnsavedChangesGuard()

  return (
    <WidgetOverlay>
      <Dashboard />
      <CommandPalette />
    </WidgetOverlay>
  )
}

export default App
