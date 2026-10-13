import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWidgetState, useWidgetStateStore } from './useWidgetState'

describe('useWidgetState', () => {
  it('starts at the given initial value, then updates on setState', () => {
    const { result } = renderHook(() => useWidgetState('a', 'input', 'default'))

    expect(result.current[0]).toBe('default')

    act(() => result.current[1]('changed'))

    expect(result.current[0]).toBe('changed')
  })

  it('supports an updater function, same as useState', () => {
    const { result } = renderHook(() => useWidgetState('b', 'count', 0))

    act(() => result.current[1]((prev) => prev + 1))
    act(() => result.current[1]((prev) => prev + 1))

    expect(result.current[0]).toBe(2)
  })

  it('evaluates a lazy initializer only once, not on every read', () => {
    let calls = 0
    const { result, rerender } = renderHook(() =>
      useWidgetState('c', 'lazy', () => {
        calls += 1
        return 'computed'
      }),
    )
    rerender()
    rerender()

    expect(result.current[0]).toBe('computed')
    expect(calls).toBe(1)
  })

  it('keeps different fields on the same instance independent', () => {
    const { result: fieldA } = renderHook(() => useWidgetState('d', 'fieldA', 'a-default'))
    const { result: fieldB } = renderHook(() => useWidgetState('d', 'fieldB', 'b-default'))

    act(() => fieldA.current[1]('a-changed'))

    expect(fieldA.current[0]).toBe('a-changed')
    expect(fieldB.current[0]).toBe('b-default')
  })

  it('keeps the same field on different instances independent', () => {
    const { result: instanceA } = renderHook(() => useWidgetState('e1', 'input', ''))
    const { result: instanceB } = renderHook(() => useWidgetState('e2', 'input', ''))

    act(() => instanceA.current[1]('only on e1'))

    expect(instanceA.current[0]).toBe('only on e1')
    expect(instanceB.current[0]).toBe('')
  })

  it('persists across unmount/remount of the reading component — the whole point', () => {
    const { result, unmount } = renderHook(() => useWidgetState('f', 'input', ''))
    act(() => result.current[1]('survives'))
    unmount()

    const { result: remounted } = renderHook(() => useWidgetState('f', 'input', ''))

    expect(remounted.current[0]).toBe('survives')
  })
})

describe('useWidgetStateStore.resetInstances', () => {
  it('clears every field for the given instances, leaving other instances untouched', () => {
    const { result: g1 } = renderHook(() => useWidgetState('g1', 'a', ''))
    const { result: g1b } = renderHook(() => useWidgetState('g1', 'b', ''))
    const { result: g2 } = renderHook(() => useWidgetState('g2', 'a', ''))
    act(() => g1.current[1]('x'))
    act(() => g1b.current[1]('y'))
    act(() => g2.current[1]('z'))

    act(() => useWidgetStateStore.getState().resetInstances(['g1']))

    const { result: g1After } = renderHook(() => useWidgetState('g1', 'a', 'fresh'))
    const { result: g1bAfter } = renderHook(() => useWidgetState('g1', 'b', 'fresh'))
    const { result: g2After } = renderHook(() => useWidgetState('g2', 'a', 'fresh'))
    expect(g1After.current[0]).toBe('fresh')
    expect(g1bAfter.current[0]).toBe('fresh')
    expect(g2After.current[0]).toBe('z')
  })
})

describe('useWidgetStateStore.duplicateInstance', () => {
  it('copies every field from the source instance to the target instance', () => {
    const { result: sourceA } = renderHook(() => useWidgetState('h1', 'a', ''))
    const { result: sourceB } = renderHook(() => useWidgetState('h1', 'b', ''))
    act(() => sourceA.current[1]('hello'))
    act(() => sourceB.current[1]('world'))

    act(() => useWidgetStateStore.getState().duplicateInstance('h1', 'h2'))

    const { result: targetA } = renderHook(() => useWidgetState('h2', 'a', 'fresh'))
    const { result: targetB } = renderHook(() => useWidgetState('h2', 'b', 'fresh'))
    expect(targetA.current[0]).toBe('hello')
    expect(targetB.current[0]).toBe('world')
  })

  it('leaves the source instance untouched', () => {
    const { result: source } = renderHook(() => useWidgetState('i1', 'a', ''))
    act(() => source.current[1]('original'))

    act(() => useWidgetStateStore.getState().duplicateInstance('i1', 'i2'))

    expect(source.current[0]).toBe('original')
  })

  it('does not touch an unrelated instance that happens to share a field name', () => {
    const { result: source } = renderHook(() => useWidgetState('j1', 'a', ''))
    const { result: unrelated } = renderHook(() => useWidgetState('j-other', 'a', ''))
    act(() => source.current[1]('copied'))
    act(() => unrelated.current[1]('untouched'))

    act(() => useWidgetStateStore.getState().duplicateInstance('j1', 'j2'))

    expect(unrelated.current[0]).toBe('untouched')
  })

  it('is a harmless no-op when the source instance has no stored fields', () => {
    act(() => useWidgetStateStore.getState().duplicateInstance('k-never-touched', 'k2'))

    const { result: target } = renderHook(() => useWidgetState('k2', 'a', 'fresh'))
    expect(target.current[0]).toBe('fresh')
  })
})
