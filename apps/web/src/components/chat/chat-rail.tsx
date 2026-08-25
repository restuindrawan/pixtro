'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { createChatSession } from '@/lib/chat/actions'
import type { SessionSummary } from '@/lib/chat/types'

export function ChatRail({
  sessions,
  activeId,
  onNavigate,
}: {
  sessions: SessionSummary[]
  activeId: string
  /**
   * Called whenever the rail takes you somewhere. On a narrow screen the rail
   * is a drawer over the chat, and picking a session stays on the same route —
   * so nothing else would tell it to get out of the way.
   */
  onNavigate?: (() => void) | undefined
}) {
  const router = useRouter()
  const [creating, startCreate] = useTransition()

  return (
    <nav className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight hover:text-ember">
          pixtro
        </Link>
        <span className="text-[10px] uppercase tracking-widest text-muted">local</span>
      </div>

      <button
        type="button"
        disabled={creating}
        onClick={() =>
          startCreate(async () => {
            const { sessionId } = await createChatSession()
            router.push(`/chat/${sessionId}`)
            onNavigate?.()
          })
        }
        className="rounded-md border border-edge bg-panel py-1.5 text-sm hover:border-ember hover:text-ember disabled:opacity-50"
      >
        + new chat
      </button>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {sessions.map((session) => (
          <li key={session.id}>
            <Link
              href={`/chat/${session.id}`}
              onClick={onNavigate}
              aria-current={session.id === activeId ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                session.id === activeId
                  ? 'bg-panel text-chalk'
                  : 'text-muted hover:bg-panel/60 hover:text-chalk'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${
                  session.status === 'running'
                    ? 'animate-pulse bg-ember'
                    : session.status === 'error'
                      ? 'bg-red-400'
                      : 'bg-edge'
                }`}
              />
              <span className="truncate">{session.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted">
                {session.updatedLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-relaxed text-muted">
        Runs your local Claude Code login. Nothing leaves this machine except the model call the CLI
        makes.
      </p>
    </nav>
  )
}
