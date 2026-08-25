import type {
  ChatRun,
  ChatSession,
  ChatTurn,
  LibraryAdditions,
  RunEvent,
  RunEventType,
  RunStatus,
} from './types'

/**
 * In-memory store, kept on `globalThis` so it survives Next's HMR reloads.
 *
 * This is the one place pixtro's chat departs from retroz, which persists to
 * Postgres. Chat here is a local-only toy: state outlives a page refresh (the
 * dev server holds it) but not a server restart. Everything goes through these
 * functions, so swapping in `node:sqlite` later is a change to one file.
 */

type State = {
  sessions: Map<string, ChatSession>
  runs: Map<string, ChatRun>
  turns: ChatTurn[]
  events: Map<string, RunEvent[]>
}

const globalForStore = globalThis as unknown as { pixtroChatStore?: State }

function state(): State {
  if (!globalForStore.pixtroChatStore) {
    globalForStore.pixtroChatStore = {
      sessions: new Map(),
      runs: new Map(),
      turns: [],
      events: new Map(),
    }
  }
  return globalForStore.pixtroChatStore
}

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID().slice(0, 12)

// --- sessions -----------------------------------------------------------------

export function createSession(title = 'new chat', freehand = false): ChatSession {
  const session: ChatSession = {
    id: id(),
    title,
    createdAt: now(),
    updatedAt: now(),
    engineSessionId: null,
    parts: {},
    freehand,
  }
  state().sessions.set(session.id, session)
  return session
}

export function getSession(sessionId: string): ChatSession | undefined {
  return state().sessions.get(sessionId)
}

export function listSessions(): ChatSession[] {
  return [...state().sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function patchSession(sessionId: string, patch: Partial<ChatSession>): void {
  const current = state().sessions.get(sessionId)
  if (current) state().sessions.set(sessionId, { ...current, ...patch, updatedAt: now() })
}

export function setEngineSessionId(sessionId: string, engineSessionId: string): void {
  patchSession(sessionId, { engineSessionId })
}

export function clearEngineSessionId(sessionId: string): void {
  patchSession(sessionId, { engineSessionId: null })
}

export function setSessionParts(sessionId: string, parts: LibraryAdditions): void {
  patchSession(sessionId, { parts })
}

/**
 * Switch a chat between the built-in library and a blank page.
 *
 * The engine session goes with it: the mode is baked into the system prompt the
 * CLI was started with, so resuming would leave the agent working from the old
 * one. Dropping it makes the next turn start cold, which `coldPrompt` recaps —
 * the conversation survives, the stale instructions do not.
 */
export function setSessionFreehand(sessionId: string, freehand: boolean): boolean {
  const session = state().sessions.get(sessionId)
  if (!session || session.freehand === freehand) return false
  patchSession(sessionId, { freehand, engineSessionId: null })
  return true
}

/** The first message names the chat, the way most chat UIs do. */
export function maybeTitleSession(sessionId: string, text: string): void {
  const session = state().sessions.get(sessionId)
  if (session?.title !== 'new chat') return
  const head = text.trim().split('\n')[0] ?? ''
  patchSession(sessionId, {
    title: head.length > 48 ? `${head.slice(0, 45)}…` : head || 'new chat',
  })
}

// --- turns and runs ------------------------------------------------------------

export function addTurn(
  sessionId: string,
  text: string,
  model: string,
): { turn: ChatTurn; run: ChatRun } {
  const run: ChatRun = {
    id: id(),
    sessionId,
    status: 'queued',
    model,
    createdAt: now(),
    error: null,
  }
  const turn: ChatTurn = { id: id(), sessionId, runId: run.id, text, createdAt: now() }
  state().runs.set(run.id, run)
  state().turns.push(turn)
  state().events.set(run.id, [])
  patchSession(sessionId, {})
  return { turn, run }
}

export function listTurns(sessionId: string): ChatTurn[] {
  return state().turns.filter((turn) => turn.sessionId === sessionId)
}

export function getRun(runId: string): ChatRun | undefined {
  return state().runs.get(runId)
}

export function listRuns(sessionId: string): ChatRun[] {
  return [...state().runs.values()]
    .filter((run) => run.sessionId === sessionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function setRunStatus(runId: string, status: RunStatus, error: string | null = null): void {
  const run = state().runs.get(runId)
  if (run) state().runs.set(runId, { ...run, status, error })
}

/** The run a session is currently waiting on, if any. */
export function activeRun(sessionId: string): ChatRun | undefined {
  return listRuns(sessionId).find((run) => run.status === 'queued' || run.status === 'running')
}

// --- events ---------------------------------------------------------------------

export function appendEvent(runId: string, type: RunEventType, payload: unknown): RunEvent {
  const list = state().events.get(runId) ?? []
  const event: RunEvent = { seq: list.length, ts: now(), type, payload }
  list.push(event)
  state().events.set(runId, list)
  return event
}

export function listEvents(runId: string): RunEvent[] {
  return [...(state().events.get(runId) ?? [])]
}

/** Test hook. */
export function resetStore(): void {
  globalForStore.pixtroChatStore = undefined
}
