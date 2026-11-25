import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFlowStore } from '@/flow/useFlowStore'
import IconPickerWidget from './IconPickerWidget'

async function renderWidget() {
  const user = userEvent.setup()
  render(<IconPickerWidget instanceId="test" mode="grid" />)
  // The icon set arrives through a dynamic import.
  await screen.findByRole('group', { name: 'Icons' }, { timeout: 5000 })
  return user
}

function grid() {
  return screen.getByRole('group', { name: 'Icons' })
}

describe('IconPickerWidget', () => {
  // Transforming ~1,900 icon modules takes a few seconds on a cold run.
  beforeAll(async () => {
    await import('./iconCatalog')
  }, 60_000)

  it('loads the icon set and starts on the default icon', async () => {
    await renderWidget()

    expect(screen.getByText(/^\d{4} icons$/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'sparkles preview' })).toBeInTheDocument()
    expect(screen.getByText('SVG 64 px, PNG 128 px')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lucide' })).toHaveAttribute('href', 'https://lucide.dev')
  })

  it('filters icons by name and selects one', async () => {
    const user = await renderWidget()

    await user.type(screen.getByLabelText('Search icons'), 'heart crack')
    expect(
      within(grid())
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['heart-crack'])

    await user.click(within(grid()).getByRole('button', { name: 'heart-crack' }))
    expect(within(grid()).getByRole('button', { name: 'heart-crack' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'heart-crack preview' })).toBeInTheDocument()
  })

  it('says when nothing matches', async () => {
    const user = await renderWidget()
    await user.type(screen.getByLabelText('Search icons'), 'zzzz-no-icon')
    expect(screen.getByText(/No icons match/)).toBeInTheDocument()
  })

  it('copies the styled SVG code', async () => {
    const user = await renderWidget()

    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#ff0000' } })
    fireEvent.change(screen.getByLabelText('Size (px)'), { target: { value: '32' } })
    fireEvent.change(screen.getByLabelText('Stroke width'), { target: { value: '1.5' } })
    await user.click(screen.getByRole('button', { name: 'Copy SVG' }))

    const svg = await navigator.clipboard.readText()
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="32" height="32" viewBox="0 0 24 24"/)
    expect(svg).toContain('stroke="#ff0000"')
    expect(svg).toContain('stroke-width="1.5"')
    expect(svg).toContain('<path d="')
    expect(svg.trim().endsWith('</svg>')).toBe(true)
  })

  it('publishes the SVG as its flow output', async () => {
    await renderWidget()
    expect(useFlowStore.getState().outputs.test).toMatch(/^<svg /)
  })

  it('moves the selection with arrow keys', async () => {
    const user = await renderWidget()
    await user.type(screen.getByLabelText('Search icons'), 'arrow-down')
    const buttons = within(grid()).getAllByRole('button')
    await user.click(buttons[0])
    await user.keyboard('{ArrowRight}')
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports a failed PNG copy when images cannot be copied', async () => {
    const user = await renderWidget()
    // Like a browser without image clipboard support.
    vi.stubGlobal('ClipboardItem', undefined)
    await user.click(screen.getByRole('button', { name: 'Copy PNG' }))
    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('downloads the SVG under the icon’s name', async () => {
    const user = await renderWidget()
    const createObjectURL = vi.fn(() => 'blob:icon')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('sparkles.svg')
    })

    await user.click(screen.getByRole('button', { name: 'Download SVG' }))

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:icon')
    click.mockRestore()
    vi.unstubAllGlobals()
  })
})
