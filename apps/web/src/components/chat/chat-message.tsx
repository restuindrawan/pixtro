import type { ChatMessage } from '@/lib/chat/types'

/**
 * The three row kinds. Tool rows are a single compact line on purpose: the
 * *result* of a tool call is never shown here as text, because it shows up as
 * the mascot in the studio panel instead.
 */
export function ChatMessageRow({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-ember/15 px-3.5 py-2.5 text-sm leading-relaxed">
          {message.text}
        </div>
      </div>
    )
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex gap-3">
        <Avatar />
        <div className="min-w-0 flex-1 whitespace-pre-wrap pt-1 text-sm leading-relaxed">
          {message.text}
        </div>
      </div>
    )
  }

  const tone =
    message.status === 'error'
      ? 'text-red-400'
      : message.status === 'running'
        ? 'text-ember'
        : 'text-muted'

  return (
    <div className={`flex items-center gap-2 pl-9 text-xs ${tone}`}>
      <StatusGlyph status={message.status} />
      <span className="font-bold">{message.tool}</span>
      <span className="truncate">{message.detail}</span>
    </div>
  )
}

function Avatar() {
  // A 3×3 pixel blob in the house palette. Cheap, and on-brand.
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 6 6"
      shapeRendering="crispEdges"
      className="mt-1 shrink-0"
    >
      <path d="M2 1h2v1h1v2h-1v1h-2v-1h-1v-2h1z" fill="#d97757" />
      <path d="M2 3h1v1h-1zM4 3h1v1h-1z" fill="#14121a" />
    </svg>
  )
}

function StatusGlyph({ status }: { status: 'running' | 'done' | 'error' }) {
  // `role="img"` is what lets a bare glyph carry a name; a generic <span> cannot.
  if (status === 'running') {
    return (
      <span
        role="img"
        aria-label="running"
        className="inline-block size-2 animate-pulse rounded-full bg-ember"
      />
    )
  }
  return (
    <span role="img" aria-label={status === 'error' ? 'failed' : 'done'}>
      {status === 'error' ? '✕' : '✓'}
    </span>
  )
}
