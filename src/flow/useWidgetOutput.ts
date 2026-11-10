import { useEffect } from 'react'
import { useFlowStore } from './useFlowStore'

/** Publishes a widget's output so connected widgets receive it as input. */
export function useWidgetOutput(instanceId: string, value: string) {
  const publish = useFlowStore((state) => state.publish)
  useEffect(() => {
    publish(instanceId, value)
  }, [instanceId, value, publish])
}
