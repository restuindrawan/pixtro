import { subscribeRun } from '@/lib/chat/bus'
import { isLoopbackRequest } from '@/lib/chat/local'
import * as store from '@/lib/chat/store'
import type { RunEvent } from '@/lib/chat/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TERMINAL = new Set(['done', 'error', 'stopped'])

/**
 * Server-sent events for one run.
 *
 * Replays everything the store already has, then live-taps the bus. A client
 * that connects late — or refreshes mid-turn — gets the full sequence either
 * way, because the store and the bus carry the same numbered events.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLoopbackRequest(request.headers)) {
    return new Response('pixtro chat only answers requests to localhost', { status: 403 })
  }

  const { id } = await params
  if (!store.getRun(id)) return new Response('Not found', { status: 404 })

  const encoder = new TextEncoder()
  let closeStream: () => void = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let unsubscribe: () => void = () => {}
      let heartbeat: ReturnType<typeof setInterval> | null = null

      const close = () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      closeStream = close

      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // the client went away
          close()
        }
      }
      const send = (event: RunEvent) => write(`data: ${JSON.stringify(event)}\n\n`)

      // 1. Replay.
      const history = store.listEvents(id)
      for (const event of history) send(event)
      const lastSeq = history.at(-1)?.seq ?? -1

      // Already finished? Say so and stop.
      const run = store.getRun(id)
      if (run && TERMINAL.has(run.status)) {
        send({
          seq: lastSeq + 1,
          ts: new Date().toISOString(),
          type: 'status',
          payload: { status: run.status, final: true },
        })
        close()
        return
      }

      // 2. Live tap. Anything the replay already covered is skipped by seq.
      unsubscribe = subscribeRun(id, (event) => {
        if (closed || event.seq <= lastSeq) return
        send(event)
        const status = (event.payload as { status?: string } | null)?.status
        if (event.type === 'status' && status && TERMINAL.has(status)) setTimeout(close, 50)
      })

      heartbeat = setInterval(() => write(': ping\n\n'), 15_000)
    },
    cancel() {
      closeStream()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
