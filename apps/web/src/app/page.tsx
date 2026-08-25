import { redirect } from 'next/navigation'

/**
 * There is one app, and it is the chat.
 *
 * There used to be a studio here — a seed box, trait dropdowns, an export row —
 * driven by hand. It is gone: everything it did an agent does through the MCP
 * tools, and the panel beside the conversation still draws the result live and
 * still exports it. Keeping a second, human-driven front end meant a second
 * surface to design for, and it was the only half of this app that could run
 * anywhere — it needed no model, so nothing stopped it being deployed.
 *
 * The chat keeps its own URLs, so a session link stays a session link.
 */
export default function Page() {
  redirect('/chat')
}
