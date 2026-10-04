/** Main-thread entry point for the optimizer: one short-lived worker per
 * file, terminated as soon as it answers or the caller loses interest. */

import type { OptimizeOptions, OptimizeResult } from './optimizePng'

export interface WorkerRequest {
  bytes: Uint8Array
  options: OptimizeOptions
}

export type WorkerResponse = { ok: true; result: OptimizeResult } | { ok: false; error: string }

/** Optimizes `bytes` in a Web Worker. Aborting `signal` terminates the
 * worker, so a replaced or removed file stops burning CPU right away. Falls
 * back to the main thread where workers are unavailable. */
export async function runOptimizer(
  bytes: Uint8Array,
  options: OptimizeOptions,
  signal: AbortSignal,
): Promise<OptimizeResult> {
  // An abort listener added to an already aborted signal never fires, so a
  // file removed while it was still being read would otherwise be optimized
  // in full and thrown away.
  if (signal.aborted) throw new DOMException('Optimization cancelled.', 'AbortError')
  if (typeof Worker === 'undefined') {
    const { optimizePng } = await import('./optimizePng')
    return optimizePng(bytes, options)
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./optimizePng.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => {
      worker.terminate()
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      finish()
      reject(new DOMException('Optimization cancelled.', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort)
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      finish()
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.error))
    })
    worker.addEventListener('error', () => {
      finish()
      reject(new Error('The optimizer stopped unexpectedly.'))
    })
    const request: WorkerRequest = { bytes, options }
    worker.postMessage(request, [bytes.buffer])
  })
}
