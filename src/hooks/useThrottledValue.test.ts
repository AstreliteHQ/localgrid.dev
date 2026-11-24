import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useThrottledValue } from './useThrottledValue'

describe('useThrottledValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on the initial value', () => {
    const { result } = renderHook(() => useThrottledValue('a', 100))
    expect(result.current).toBe('a')
  })

  it('passes a first change through straight away, then at most once per interval', () => {
    const { result, rerender } = renderHook(({ value }) => useThrottledValue(value, 100), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    act(() => vi.advanceTimersByTime(0))
    expect(result.current).toBe('b')

    rerender({ value: 'c' })
    rerender({ value: 'd' })
    act(() => vi.advanceTimersByTime(50))
    expect(result.current).toBe('b')

    act(() => vi.advanceTimersByTime(50))
    expect(result.current).toBe('d')
  })
})
