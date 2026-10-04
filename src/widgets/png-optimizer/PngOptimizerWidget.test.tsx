import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OptimizeResult } from './optimizePng'
import { runOptimizer } from './runOptimizer'
import PngOptimizerWidget from './PngOptimizerWidget'

// The real optimizer runs in a Web Worker jsdom doesn't provide; its logic
// is covered by optimizePng.test.ts, so the widget is tested against the
// module boundary instead.
vi.mock('./runOptimizer', () => ({ runOptimizer: vi.fn() }))
const mockedRunOptimizer = vi.mocked(runOptimizer)

let instance = 0
function renderWidget() {
  instance += 1
  return render(<PngOptimizerWidget instanceId={`png-${instance}`} mode="grid" />)
}

function result(overrides: Partial<OptimizeResult> = {}): OptimizeResult {
  return {
    bytes: new Uint8Array(600),
    originalSize: 1000,
    alreadyOptimal: false,
    animated: false,
    removedChunks: ['tEXt', 'tIME'],
    before: { colorType: 6, bitDepth: 8, interlaced: false },
    after: { colorType: 3, bitDepth: 4, interlaced: false },
    filter: 'None',
    ...overrides,
  }
}

function pngFile(name = 'logo.png', size = 1000): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' })
}

function dropFile(file: File) {
  fireEvent.drop(screen.getByText(/drop a png here/i), { dataTransfer: { files: [file] } })
}

beforeEach(() => {
  mockedRunOptimizer.mockReset().mockResolvedValue(result())
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

describe('PngOptimizerWidget', () => {
  it('starts on an empty drop zone', () => {
    renderWidget()
    expect(screen.getByText(/drop a png here/i)).toBeInTheDocument()
  })

  it('shows the savings and what changed for a dropped file', async () => {
    renderWidget()
    dropFile(pngFile())

    expect(await screen.findByText('(-40%)')).toBeInTheDocument()
    expect(screen.getByText('RGBA 8-bit to Indexed 4-bit')).toBeInTheDocument()
    expect(screen.getByText('Removed tEXt, tIME')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('download', 'logo.png')
    expect(mockedRunOptimizer).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      { keepColorProfile: true },
      expect.any(AbortSignal),
    )
  })

  it('says so when the file is already optimal', async () => {
    mockedRunOptimizer.mockResolvedValue(
      result({ alreadyOptimal: true, bytes: new Uint8Array(1000), removedChunks: [] }),
    )
    renderWidget()
    dropFile(pngFile())

    expect(await screen.findByText(/already optimal/i)).toBeInTheDocument()
    expect(screen.queryByText(/-\d+%/)).not.toBeInTheDocument()
  })

  it('reports an error from the optimizer', async () => {
    mockedRunOptimizer.mockRejectedValue(new Error('This file is not a PNG.'))
    renderWidget()
    dropFile(pngFile('photo.jpg'))

    expect(await screen.findByText('This file is not a PNG.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument()
  })

  it('re-runs with the color profile stripped when asked', async () => {
    const user = userEvent.setup()
    renderWidget()
    dropFile(pngFile())
    await screen.findByText('(-40%)')

    await user.click(screen.getByRole('button', { name: 'Strip' }))

    expect(mockedRunOptimizer).toHaveBeenLastCalledWith(
      expect.any(Uint8Array),
      { keepColorProfile: false },
      expect.any(AbortSignal),
    )
  })

  it('cancels a run that is no longer wanted', async () => {
    const user = userEvent.setup()
    let signal: AbortSignal | undefined
    mockedRunOptimizer.mockImplementation((_bytes, _options, abortSignal) => {
      signal = abortSignal
      return new Promise(() => {})
    })
    renderWidget()
    dropFile(pngFile())
    expect(await screen.findByText(/optimizing/i)).toBeInTheDocument()
    await vi.waitFor(() => expect(signal).toBeDefined())

    await user.click(screen.getByRole('button', { name: /remove image/i }))

    expect(signal!.aborted).toBe(true)
    expect(screen.getByText(/drop a png here/i)).toBeInTheDocument()
  })

  it('names a non-PNG download with a .png extension', async () => {
    renderWidget()
    dropFile(pngFile('screenshot'))

    expect(await screen.findByRole('link', { name: /download/i })).toHaveAttribute('download', 'screenshot.png')
  })
})
