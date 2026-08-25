'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/lib/chat/types'
import { ChatMessageRow } from './chat-message'

const MODELS = ['opus', 'sonnet', 'haiku'] as const
export type ModelAlias = (typeof MODELS)[number]

const SUGGESTIONS = [
  'make me a sleepy wizard blob',
  'a retro knight standing guard, then make it nod',
  'design a royal robot and give it an entrance animation',
]

export function ChatConversation({
  messages,
  running,
  model,
  onModel,
  freehand,
  onFreehand,
  onSend,
  onStop,
  onSessions,
  onStudio,
  studioFresh,
}: {
  messages: ChatMessage[]
  running: boolean
  model: ModelAlias
  onModel: (model: ModelAlias) => void
  /** Built-in parts hidden: the agent draws every mascot from scratch. */
  freehand: boolean
  onFreehand: (freehand: boolean) => void
  onSend: (text: string) => void
  onStop: () => void
  /**
   * The other two panes. They are columns of their own on a wide screen and
   * overlays on a narrow one, so the buttons that reach them live in this
   * header — the only bar a phone has room for.
   */
  onSessions: () => void
  onStudio: () => void
  /** A render landed while the studio overlay was closed. */
  studioFresh: boolean
}) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Follow the conversation as it grows, the way every chat does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new row
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, running])

  const submit = () => {
    const text = draft.trim()
    if (!text || running) return
    setDraft('')
    onSend(text)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-edge border-b px-3 py-2.5 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onSessions}
          aria-label="sessions"
          className="-ml-1 shrink-0 rounded-md p-1.5 text-muted hover:text-chalk lg:hidden"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="size-4"
            fill="currentColor"
            shapeRendering="crispEdges"
          >
            <path d="M1 2h10v1.5H1zM1 5.25h10v1.5H1zM1 8.5h10v1.5H1z" />
          </svg>
        </button>
        <span className="text-xs uppercase tracking-widest text-muted max-lg:hidden">chat</span>
        <label
          title="Hide the built-in bodies, faces and hats. The agent has to draw every part it uses, from nothing. Switching starts a fresh engine session."
          className={`ml-auto flex cursor-pointer items-center gap-1.5 text-xs ${
            freehand ? 'text-ember' : 'text-muted'
          } ${running ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <input
            type="checkbox"
            checked={freehand}
            disabled={running}
            onChange={(event) => onFreehand(event.target.checked)}
            className="size-3 accent-ember"
          />
          freehand
        </label>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
          <span className="max-sm:sr-only">model</span>
          <select
            value={model}
            onChange={(event) => onModel(event.target.value as ModelAlias)}
            className="rounded border border-edge bg-panel px-2 py-1 text-xs text-chalk outline-none focus:border-ember"
          >
            {MODELS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onStudio}
          className="relative shrink-0 rounded-md border border-edge bg-panel px-2.5 py-1.5 text-xs hover:border-ember hover:text-ember lg:hidden"
        >
          studio
          {studioFresh && (
            <>
              <span
                aria-hidden="true"
                className="-right-1 -top-1 absolute size-2 rounded-full bg-ember"
              />
              <span className="sr-only"> — new render</span>
            </>
          )}
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted">
              {freehand
                ? 'Freehand: nothing is built in. The agent draws every part it uses, then shows you.'
                : 'Describe a mascot. The agent renders it, looks at it, and shows you.'}
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSend(suggestion)}
                  className="rounded-md border border-edge bg-panel px-3 py-1.5 text-xs text-muted hover:border-ember hover:text-chalk"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <ChatMessageRow key={message.id} message={message} />)
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex gap-2 border-edge border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3"
      >
        <textarea
          aria-label="message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={running ? 'thinking…' : 'describe a mascot, or ask for an animation'}
          rows={2}
          disabled={running}
          className="min-w-0 flex-1 resize-none rounded-md border border-edge bg-panel px-3 py-2 text-base outline-none placeholder:text-muted/60 focus:border-ember disabled:opacity-60 sm:text-sm"
        />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-md border border-edge bg-panel px-4 text-sm hover:border-red-400 hover:text-red-400"
          >
            stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim()}
            className="shrink-0 rounded-md bg-ember px-4 text-sm font-bold text-ink disabled:opacity-40"
          >
            send
          </button>
        )}
      </form>
    </div>
  )
}
