/** Runs optimizePng off the main thread: deflate level 9 over every filter
 * strategy of a large image takes long enough to freeze the dashboard. */

import { optimizePng } from './optimizePng'
import type { WorkerRequest, WorkerResponse } from './runOptimizer'

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { bytes, options } = event.data
  let response: WorkerResponse
  try {
    response = { ok: true, result: optimizePng(bytes, options) }
  } catch (cause) {
    response = { ok: false, error: cause instanceof Error ? cause.message : 'Optimization failed.' }
  }
  self.postMessage(response, { transfer: response.ok ? [response.result.bytes.buffer] : [] })
})
