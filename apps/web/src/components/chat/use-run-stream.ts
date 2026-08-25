'use client'

import { useEffect, useState } from 'react'
import type { Artifact, RunEvent, RunStatus } from '@/lib/chat/types'

/**
 * Live tap on one run.
 *
 * The route replays the run's stored events first and then pushes new ones, so
 * a viewer that joins late — or refreshes mid-turn — still sees the whole turn.
 * Events are deduplicated by `seq` because a reconnect replays from zero.
 */
export function useRunStream(runId: string | null) {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [status, setStatus] = useState<RunStatus | null>(null)

  useEffect(() => {
    setEvents([])
    setArtifact(null)
    setStatus(null)
    if (!runId) return

    const seen = new Set<number>()
    const source = new EventSource(`/api/runs/${runId}/stream`)

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent
      if (seen.has(event.seq)) return
      seen.add(event.seq)

      if (event.type === 'artifact') {
        setArtifact(event.payload as Artifact)
        return
      }
      if (event.type === 'status') {
        const next = (event.payload as { status?: RunStatus }).status
        if (next) setStatus(next)
        if (next && next !== 'running' && next !== 'queued') source.close()
        return
      }
      setEvents((previous) => [...previous, event])
    }

    source.onerror = () => source.close()
    return () => source.close()
  }, [runId])

  return { events, artifact, status }
}
