import { eventsToMessages, latestArtifact, timeLabel } from './events'
import * as store from './store'
import type { Artifact, ChatMessage, SessionSummary } from './types'

/**
 * Build the chat pages' props from the store.
 *
 * Everything the client renders is pre-shaped here — labels formatted, rows
 * mapped — so the components stay free of store types and of any date logic
 * that could disagree between server and client render.
 */

export function sessionSummaries(): SessionSummary[] {
  return store.listSessions().map((session) => {
    const active = store.activeRun(session.id)
    const latest = store.listRuns(session.id).at(-1)
    return {
      id: session.id,
      title: session.title,
      updatedLabel: timeLabel(session.updatedAt),
      status: active ? 'running' : latest?.status === 'error' ? 'error' : 'idle',
    }
  })
}

export type SessionDetail = {
  messages: ChatMessage[]
  artifact: Artifact | null
  artifactKey: string
  activeRunId: string | null
  freehand: boolean
}

export function sessionDetail(sessionId: string): SessionDetail | null {
  const session = store.getSession(sessionId)
  if (!session) return null

  const messages: ChatMessage[] = []
  let artifact: Artifact | null = null
  let artifactKey = 'none'

  for (const turn of store.listTurns(sessionId)) {
    messages.push({ id: turn.id, role: 'user', at: timeLabel(turn.createdAt), text: turn.text })
    const events = store.listEvents(turn.runId)
    messages.push(...eventsToMessages(turn.runId, events))
    const found = latestArtifact(events)
    if (found) {
      artifact = found
      artifactKey = `${turn.runId}-${events.length}`
    }
  }

  return {
    messages,
    artifact,
    artifactKey,
    activeRunId: store.activeRun(sessionId)?.id ?? null,
    freehand: session.freehand,
  }
}
