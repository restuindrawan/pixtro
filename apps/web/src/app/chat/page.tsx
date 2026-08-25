import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ChatUnavailable } from '@/components/chat/chat-unavailable'
import { chatAvailability } from '@/lib/chat/local'
import * as store from '@/lib/chat/store'

export const dynamic = 'force-dynamic'

/** Land on the newest chat, making one if there is none. */
export default async function ChatIndex() {
  const availability = chatAvailability(await headers())
  if (!availability.ok) return <ChatUnavailable reason={availability.reason} />

  const newest = store.listSessions()[0] ?? store.createSession()
  redirect(`/chat/${newest.id}`)
}
