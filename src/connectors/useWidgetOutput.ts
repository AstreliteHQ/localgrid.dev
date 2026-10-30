import { useEffect } from 'react'
import { useConnectionStore } from './useConnectionStore'

/** Publishes a widget's output so connected widgets receive it as input. */
export function useWidgetOutput(instanceId: string, value: string) {
  const publish = useConnectionStore((state) => state.publish)
  useEffect(() => {
    publish(instanceId, value)
  }, [instanceId, value, publish])
}
