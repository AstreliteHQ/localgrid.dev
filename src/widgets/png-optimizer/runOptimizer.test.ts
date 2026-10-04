import { describe, expect, it } from 'vitest'
import { runOptimizer } from './runOptimizer'

describe('runOptimizer', () => {
  it('rejects right away when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runOptimizer(new Uint8Array(8), { keepColorProfile: true }, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
