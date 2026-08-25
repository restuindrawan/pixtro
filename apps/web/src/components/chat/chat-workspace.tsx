'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { sendChatMessage, setChatFreehand, stopChatRun } from '@/lib/chat/actions'
import { eventToMessage, timeLabel } from '@/lib/chat/events'
import type { Artifact, ChatMessage, SessionSummary } from '@/lib/chat/types'
import { ChatCanvas } from './chat-canvas'
import { ChatConversation, type ModelAlias } from './chat-conversation'
import { ChatRail } from './chat-rail'
import { useRunStream } from './use-run-stream'

export type ChatWorkspaceProps = {
  sessionId: string
  sessions: SessionSummary[]
  /** Every row from finished runs, built server-side from the store. */
  messages: ChatMessage[]
  /** The newest render across the session, or null. */
  artifact: Artifact | null
  artifactKey: string
  /** A run still in flight when the page loaded, so the stream can pick it up. */
  activeRunId: string | null
  /** Built-in parts hidden for this chat: the agent draws everything itself. */
  freehand: boolean
}

export function ChatWorkspace(props: ChatWorkspaceProps) {
  const router = useRouter()
  const [runId, setRunId] = useState<string | null>(props.activeRunId)
  const [turnId, setTurnId] = useState<string | null>(null)
  const [pending, setPending] = useState<ChatMessage[]>([])
  const [model, setModel] = useState<ModelAlias>('opus')
  const [failure, setFailure] = useState<string | null>(null)
  const stream = useRunStream(runId)

  /**
   * Narrow screens get one pane at a time: the conversation, with the rail and
   * the studio as overlays over it. Both are plain state rather than routes —
   * a chat you dismissed a drawer on should be exactly where you left it, and
   * the back button belongs to the conversation.
   */
  const [rail, setRail] = useState(false)
  const [studio, setStudio] = useState(false)

  /**
   * The mode is server state, but the checkbox has to move on click. Held
   * locally until the server's value catches up, then dropped — the same shape
   * the optimistic message rows use.
   */
  const [modeDraft, setModeDraft] = useState<boolean | null>(null)
  const freehand = modeDraft ?? props.freehand
  useEffect(() => {
    if (modeDraft !== null && modeDraft === props.freehand) setModeDraft(null)
  }, [modeDraft, props.freehand])

  const running =
    runId !== null &&
    stream.status !== 'done' &&
    stream.status !== 'error' &&
    stream.status !== 'stopped'

  /**
   * True once the server's own rows for the current turn are in `props` — the
   * signal that the stream and optimistic copies can be dropped. Until then
   * they stay, or the conversation would flash back to its pre-turn state in
   * the gap between the run finishing and `router.refresh()` landing.
   */
  const serverHasTurn =
    turnId !== null
      ? props.messages.some((message) => message.id === turnId)
      : runId !== null && props.messages.some((message) => message.id.startsWith(`${runId}-`))

  /**
   * One id-keyed map over three sources. Server rows win over optimistic ones,
   * and the live stream's rows are keyed the same way the server will key them
   * once the run is stored — so when the refresh lands, nothing jumps.
   */
  const messages = useMemo(() => {
    const merged = new Map<string, ChatMessage>()
    for (const message of props.messages) merged.set(message.id, message)
    if (!serverHasTurn) {
      for (const message of pending) if (!merged.has(message.id)) merged.set(message.id, message)
    }
    if (runId) {
      const last = stream.events.at(-1)
      for (const event of stream.events) {
        const row = eventToMessage(runId, event, { live: event === last && running })
        if (row && !merged.has(row.id)) merged.set(row.id, row)
      }
    }
    return [...merged.values()]
  }, [props.messages, pending, runId, stream.events, running, serverHasTurn])

  // Once the run settles, ask for the server rows; once they are here, let go
  // of the stream copy.
  const settled = runId !== null && stream.status !== null && !running
  useEffect(() => {
    if (settled) router.refresh()
  }, [settled, router])
  useEffect(() => {
    if (settled && serverHasTurn) {
      setRunId(null)
      setTurnId(null)
      setPending([])
    }
  }, [settled, serverHasTurn])

  const send = useCallback(
    async (text: string) => {
      setFailure(null)
      const optimisticId = `pending-${Date.now()}`
      setPending((previous) => [
        ...previous,
        { id: optimisticId, role: 'user', at: timeLabel(new Date().toISOString()), text },
      ])
      try {
        const next = await sendChatMessage({ sessionId: props.sessionId, text, model })
        setRunId(next.runId)
        setTurnId(next.turnId)
      } catch (error) {
        setPending((previous) => previous.filter((message) => message.id !== optimisticId))
        setFailure(error instanceof Error ? error.message : String(error))
      }
    },
    [props.sessionId, model],
  )

  const stop = useCallback(() => {
    if (runId) void stopChatRun(runId)
  }, [runId])

  const changeMode = useCallback(
    async (next: boolean) => {
      setFailure(null)
      setModeDraft(next)
      try {
        await setChatFreehand({ sessionId: props.sessionId, freehand: next })
        router.refresh()
      } catch (error) {
        setModeDraft(null)
        setFailure(error instanceof Error ? error.message : String(error))
      }
    },
    [props.sessionId, router],
  )

  // The stream's artifact is newer than anything the page loaded with. The key
  // has to change only when the *artifact* does — not on every event — or the
  // editor would remount mid-run and drop whatever the user was typing.
  const artifact = stream.artifact ?? props.artifact
  const artifactKey = stream.artifact
    ? `${runId}-${stream.artifact.genome.seed}-${JSON.stringify(stream.artifact.story).length}`
    : props.artifactKey

  // With the studio hidden behind a button, a render that lands while it is
  // closed would go unannounced. Anything on screen counts as seen.
  const [seenKey, setSeenKey] = useState<string | null>(null)
  useEffect(() => {
    if (studio) setSeenKey(artifactKey)
  }, [studio, artifactKey])

  const canvas = <ChatCanvas artifact={artifact} artifactKey={artifactKey} />

  return (
    // `dvh`, not `vh`: mobile browsers count their own collapsing toolbars out
    // of the former and not the latter, and `vh` puts the composer under them.
    <main className="flex h-dvh flex-col lg:grid lg:grid-cols-[14rem_minmax(0,1fr)_22rem] lg:divide-x lg:divide-edge">
      <aside className="hidden min-h-0 p-4 lg:block">
        <ChatRail sessions={props.sessions} activeId={props.sessionId} />
      </aside>

      <section className="flex min-h-0 flex-1 flex-col">
        <ChatConversation
          messages={messages}
          running={running}
          model={model}
          onModel={setModel}
          freehand={freehand}
          onFreehand={(next) => void changeMode(next)}
          onSend={(text) => void send(text)}
          onStop={stop}
          onSessions={() => setRail(true)}
          onStudio={() => setStudio(true)}
          studioFresh={artifact !== null && artifactKey !== seenKey}
        />
        {failure && (
          <p role="alert" className="shrink-0 border-edge border-t px-4 py-2 text-xs text-red-400">
            {failure}
          </p>
        )}
      </section>

      <aside className="hidden min-h-0 overflow-y-auto p-4 lg:block">{canvas}</aside>

      {rail && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            aria-label="close sessions"
            onClick={() => setRail(false)}
            className="absolute inset-0 bg-ink/80"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-edge border-r bg-ink p-4">
            <ChatRail
              sessions={props.sessions}
              activeId={props.sessionId}
              onNavigate={() => setRail(false)}
            />
          </div>
        </div>
      )}

      {studio && (
        <div className="fixed inset-0 z-30 flex flex-col bg-ink lg:hidden">
          <header className="flex shrink-0 items-center gap-3 border-edge border-b px-4 py-2.5">
            <span className="text-xs uppercase tracking-widest text-muted">studio</span>
            <button
              type="button"
              onClick={() => setStudio(false)}
              className="ml-auto rounded-md border border-edge bg-panel px-3 py-1.5 text-xs hover:border-ember hover:text-ember"
            >
              back to chat
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {canvas}
          </div>
        </div>
      )}
    </main>
  )
}
