import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useWidgetDataSettings } from './useWidgetDataSettings'
import { useWidgetStateStore } from './useWidgetState'
import { findWidgetInstance, listWidgetData, sanitizeWidgetData, useHasWidgetData, useWidgetData } from './widgetData'

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

describe('sanitizeWidgetData', () => {
  it('keeps fields matching the schema and drops the rest', () => {
    expect(
      sanitizeWidgetData('watermark', { text: 'Draft', opacity: 50, position: 'diagonal', extra: true, color: 'red' }),
    ).toEqual({ text: 'Draft', opacity: 50 })
  })

  it('returns undefined when nothing survives, or the widget has no schema', () => {
    expect(sanitizeWidgetData('world-clock', { selectedIds: 'paris' })).toBeUndefined()
    expect(sanitizeWidgetData('uuid-generator', { version: 'v4' })).toBeUndefined()
    expect(sanitizeWidgetData('world-clock', null)).toBeUndefined()
  })
})

describe('useWidgetData', () => {
  it('writes to the pinned instance data', () => {
    const { result } = renderHook(() => useWidgetData<string[]>('clock', 'selectedIds', ['utc']))

    expect(result.current[0]).toEqual(['utc'])
    act(() => result.current[1]((prev) => [...prev, 'paris']))

    expect(result.current[0]).toEqual(['utc', 'paris'])
    expect(instance('clock')?.data).toEqual({ selectedIds: ['utc', 'paris'] })
  })

  it('falls back to the initial value when the stored value no longer matches the schema', () => {
    useDashboardStore.getState().setWidgetData('clock', 'selectedIds', 42)
    const { result } = renderHook(() => useWidgetData<string[]>('clock', 'selectedIds', ['utc']))

    expect(result.current[0]).toEqual(['utc'])
  })

  it('is not touched by clearing widget state', () => {
    const { result } = renderHook(() => useWidgetData<string[]>('clock', 'selectedIds', ['utc']))
    act(() => result.current[1](['tokyo']))

    act(() => useWidgetStateStore.getState().resetInstances(['clock']))

    expect(result.current[0]).toEqual(['tokyo'])
  })

  it('keeps an ephemeral instance in widget state, then carries it over on pin', () => {
    const { result } = renderHook(() => useWidgetData<string[]>('ephemeral', 'selectedIds', ['utc']))
    act(() => result.current[1](['berlin']))

    expect(instance('ephemeral')).toBeUndefined()
    expect(result.current[0]).toEqual(['berlin'])

    act(() => useDashboardStore.getState().pinInstance(DASHBOARD, 'world-clock', 'ephemeral'))

    expect(instance('ephemeral')?.data).toEqual({ selectedIds: ['berlin'] })
    expect(result.current[0]).toEqual(['berlin'])
  })
})

describe('useHasWidgetData', () => {
  it('turns on once a field is saved and off after a reset', () => {
    const { result } = renderHook(() => useHasWidgetData('clock'))
    expect(result.current).toBe(false)

    act(() => useDashboardStore.getState().setWidgetData('clock', 'selectedIds', ['utc']))
    expect(result.current).toBe(true)

    act(() => useDashboardStore.getState().resetWidgetData('clock'))
    expect(result.current).toBe(false)
    expect(instance('clock')).not.toHaveProperty('data')
  })
})

describe('useWidgetData while widget data is off', () => {
  it('starts from the default, keeps edits in memory and leaves saved data alone', () => {
    useDashboardStore.getState().setWidgetData('clock', 'selectedIds', ['paris'])
    useWidgetDataSettings.getState().setEnabled(false)
    const { result } = renderHook(() => useWidgetData<string[]>('clock', 'selectedIds', ['utc']))
    expect(result.current[0]).toEqual(['utc'])

    act(() => result.current[1]((previous) => [...previous, 'tokyo']))

    expect(result.current[0]).toEqual(['utc', 'tokyo'])
    expect(instance('clock')?.data).toEqual({ selectedIds: ['paris'] })

    act(() => useWidgetDataSettings.getState().setEnabled(true))
    expect(result.current[0]).toEqual(['paris'])
  })

  it('saves nothing when an overlay instance gets pinned', () => {
    useWidgetDataSettings.getState().setEnabled(false)
    const { result } = renderHook(() => useWidgetData<string[]>('overlay', 'selectedIds', ['utc']))
    act(() => result.current[1](['paris']))

    act(() => useDashboardStore.getState().pinInstance(DASHBOARD, 'world-clock', 'overlay'))

    expect(instance('overlay')).not.toHaveProperty('data')
  })
})

describe('listWidgetData', () => {
  it('lists only instances holding data, with their dashboard', () => {
    useDashboardStore.getState().setWidgetData('clock', 'selectedIds', ['paris'])

    const entries = listWidgetData(useDashboardStore.getState().dashboards)

    expect(entries).toEqual([
      { dashboardId: DASHBOARD, dashboardName: 'Dash', instance: expect.objectContaining({ instanceId: 'clock' }) },
    ])
  })
})
