import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useWidgetStateStore } from './useWidgetState'
import { findWidgetInstance, sanitizeConfig, useHasWidgetConfig, useWidgetConfig } from './widgetConfig'

const DASHBOARD = 'dash'

function instance(instanceId: string) {
  return findWidgetInstance(useDashboardStore.getState().dashboards, instanceId)
}

beforeEach(() => {
  useWidgetStateStore.setState({ values: {} })
  useDashboardStore.setState({
    dashboards: [
      {
        id: DASHBOARD,
        name: 'Dash',
        widgets: [{ instanceId: 'clock', widgetId: 'world-clock', x: 0, y: 0, w: 5, h: 4 }],
      },
    ],
    activeDashboardId: DASHBOARD,
  })
})

describe('sanitizeConfig', () => {
  it('keeps fields matching the schema and drops the rest', () => {
    expect(
      sanitizeConfig('watermark', { text: 'Draft', opacity: 50, position: 'diagonal', extra: true, color: 'red' }),
    ).toEqual({ text: 'Draft', opacity: 50 })
  })

  it('returns undefined when nothing survives, or the widget has no schema', () => {
    expect(sanitizeConfig('world-clock', { selectedIds: 'paris' })).toBeUndefined()
    expect(sanitizeConfig('uuid-generator', { version: 'v4' })).toBeUndefined()
    expect(sanitizeConfig('world-clock', null)).toBeUndefined()
  })
})

describe('useWidgetConfig', () => {
  it('writes to the pinned instance config', () => {
    const { result } = renderHook(() => useWidgetConfig<string[]>('clock', 'selectedIds', ['utc']))

    expect(result.current[0]).toEqual(['utc'])
    act(() => result.current[1]((prev) => [...prev, 'paris']))

    expect(result.current[0]).toEqual(['utc', 'paris'])
    expect(instance('clock')?.config).toEqual({ selectedIds: ['utc', 'paris'] })
  })

  it('falls back to the initial value when the stored value no longer matches the schema', () => {
    useDashboardStore.getState().setWidgetConfig('clock', 'selectedIds', 42)
    const { result } = renderHook(() => useWidgetConfig<string[]>('clock', 'selectedIds', ['utc']))

    expect(result.current[0]).toEqual(['utc'])
  })

  it('is not touched by clearing widget state', () => {
    const { result } = renderHook(() => useWidgetConfig<string[]>('clock', 'selectedIds', ['utc']))
    act(() => result.current[1](['tokyo']))

    act(() => useWidgetStateStore.getState().resetInstances(['clock']))

    expect(result.current[0]).toEqual(['tokyo'])
  })

  it('keeps an ephemeral instance in widget state, then carries it over on pin', () => {
    const { result } = renderHook(() => useWidgetConfig<string[]>('ephemeral', 'selectedIds', ['utc']))
    act(() => result.current[1](['berlin']))

    expect(instance('ephemeral')).toBeUndefined()
    expect(result.current[0]).toEqual(['berlin'])

    act(() => useDashboardStore.getState().pinInstance(DASHBOARD, 'world-clock', 'ephemeral'))

    expect(instance('ephemeral')?.config).toEqual({ selectedIds: ['berlin'] })
    expect(result.current[0]).toEqual(['berlin'])
  })
})

describe('useHasWidgetConfig', () => {
  it('turns on once a field is saved and off after a reset', () => {
    const { result } = renderHook(() => useHasWidgetConfig('clock'))
    expect(result.current).toBe(false)

    act(() => useDashboardStore.getState().setWidgetConfig('clock', 'selectedIds', ['utc']))
    expect(result.current).toBe(true)

    act(() => useDashboardStore.getState().resetWidgetConfig('clock'))
    expect(result.current).toBe(false)
    expect(instance('clock')).not.toHaveProperty('config')
  })
})
