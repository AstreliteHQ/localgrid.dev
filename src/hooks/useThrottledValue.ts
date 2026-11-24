import { useEffect, useRef, useState } from 'react'

/** Follows `value`, but changes at most once per `interval` ms. The latest
 * value always lands, at the end of the interval it arrived in. Used where
 * a value changes on every pointer move but its consumers are rate limited,
 * like a widget's flow output (see BURST_LIMIT in useFlowStore). */
export function useThrottledValue<T>(value: T, interval: number): T {
  const [throttled, setThrottled] = useState(value)
  const lastUpdate = useRef(0)

  useEffect(() => {
    const wait = lastUpdate.current + interval - Date.now()
    const timer = setTimeout(
      () => {
        lastUpdate.current = Date.now()
        setThrottled(value)
      },
      Math.max(0, wait),
    )
    return () => clearTimeout(timer)
  }, [value, interval])

  return throttled
}
