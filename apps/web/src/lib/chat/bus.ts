import { EventEmitter } from 'node:events'
import type { RunEvent } from './types'

/**
 * In-process pub/sub so the SSE route can stream live run events.
 *
 * The store is the source of truth for replay; this is only the live tap. A
 * subscriber that connects late replays the store first and then listens here,
 * which is why a refresh mid-run loses nothing.
 */

const globalForBus = globalThis as unknown as { pixtroRunBus?: EventEmitter }

function bus(): EventEmitter {
  if (!globalForBus.pixtroRunBus) {
    globalForBus.pixtroRunBus = new EventEmitter()
    globalForBus.pixtroRunBus.setMaxListeners(0)
  }
  return globalForBus.pixtroRunBus
}

export function emitRunEvent(runId: string, event: RunEvent): void {
  bus().emit(runId, event)
}

export function subscribeRun(runId: string, handler: (event: RunEvent) => void): () => void {
  bus().on(runId, handler)
  return () => bus().off(runId, handler)
}
