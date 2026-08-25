import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ChatUnavailable } from '@/components/chat/chat-unavailable'
import { ChatWorkspace } from '@/components/chat/chat-workspace'
import { chatAvailability } from '@/lib/chat/local'
import { sessionDetail, sessionSummaries } from '@/lib/chat/queries'

export const dynamic = 'force-dynamic'

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const availability = chatAvailability(await headers())
  if (!availability.ok) return <ChatUnavailable reason={availability.reason} />

  const { sessionId } = await params
  const detail = sessionDetail(sessionId)

  /**
   * An unknown session is the normal case, not an error: the store lives in
   * memory, so every chat URL goes stale the moment the dev server restarts.
   * A 404 would leave an open tab or a bookmark with nowhere to go, so send it
   * to the index, which picks up the newest chat or starts a fresh one.
   */
  if (!detail) redirect('/chat')

  return <ChatWorkspace sessionId={sessionId} sessions={sessionSummaries()} {...detail} />
}
