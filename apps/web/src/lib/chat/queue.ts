/**
 * Serial run queue. Never spawn two agents at once.
 *
 * A promise chain rather than a queue library: the only guarantee needed is
 * "one at a time, in order", and a chain gives that in four lines. Kept on
 * `globalThis` so HMR does not start a second, parallel chain.
 */

const globalForQueue = globalThis as unknown as {
  pixtroRunQueue?: { tail: Promise<void>; pending: number }
}

function queue() {
  if (!globalForQueue.pixtroRunQueue) {
    globalForQueue.pixtroRunQueue = { tail: Promise.resolve(), pending: 0 }
  }
  return globalForQueue.pixtroRunQueue
}

/** Schedule a job after every job already queued. Never rejects the chain. */
export function enqueue(job: () => Promise<void>): void {
  const q = queue()
  q.pending += 1
  q.tail = q.tail.then(job, job).finally(() => {
    q.pending -= 1
  })
}

export function queueDepth(): number {
  return queue().pending
}

// --- cancellation ---------------------------------------------------------------

const globalForAborts = globalThis as unknown as { pixtroRunAborts?: Map<string, AbortController> }

function aborts(): Map<string, AbortController> {
  if (!globalForAborts.pixtroRunAborts) globalForAborts.pixtroRunAborts = new Map()
  return globalForAborts.pixtroRunAborts
}

export function registerAbort(runId: string, controller: AbortController): () => void {
  aborts().set(runId, controller)
  return () => aborts().delete(runId)
}

/** Returns false if the run was not in flight. */
export function abortRun(runId: string): boolean {
  const controller = aborts().get(runId)
  if (!controller) return false
  controller.abort()
  return true
}
