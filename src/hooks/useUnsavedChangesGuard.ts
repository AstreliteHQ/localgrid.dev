import { useEffect } from 'react'
import { hasAnyDirtyWidget } from '@/widgets/useWidgetDirty'

/** Asks the browser to confirm a reload, close or navigation away while any
 * widget is dirty, since widget content only lives in memory. Browsers show
 * their own generic dialog here; custom text isn't supported. */
export function useUnsavedChangesGuard() {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasAnyDirtyWidget()) return
      event.preventDefault()
      // Older Chrome/Edge only show the dialog when returnValue is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])
}
