import type { Artifact, ChatMessage, RunEvent } from './types'

/**
 * Pure mappers from run events to conversation view models.
 *
 * Shared by the server (replaying stored events into the page's initial props)
 * and the client (receiving the same shapes live over SSE). Because both sides
 * run the same functions, history and the live turn render identically by
 * construction — there is no second code path to drift.
 */

/** `mcp__pixtro__render_animation` reads better as `render_animation`. */
export function toolLabel(name: string): string {
  return name.replace(/^mcp__[^_]+__/, '')
}

export function timeLabel(ts: string): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** One-line summary of a tool call for the conversation's tool rows. */
export function describeTool(name: string, input: unknown): string {
  const i = asRecord(input)
  const label = toolLabel(name)

  if (label === 'generate_mascot') {
    if (typeof i.prompt === 'string' && i.prompt) return `"${i.prompt}"`
    const pinned = ['body', 'eyes', 'mouth', 'accessory', 'palette']
      .filter((slot) => typeof i[slot] === 'string')
      .map((slot) => `${slot}=${i[slot]}`)
    const seed = typeof i.seed === 'string' ? `seed ${i.seed}` : ''
    return [seed, ...pinned].filter(Boolean).join(' ') || 'from seed'
  }
  if (label === 'render_animation') {
    const board = asRecord(i.storyboard)
    if (Array.isArray(board.beats)) {
      const n = board.beats.length
      return `custom storyboard, ${n} beat${n === 1 ? '' : 's'}`
    }
    return typeof i.story === 'string' ? `built-in "${i.story}"` : 'built-in "alive"'
  }
  if (label === 'list_parts') return 'what this library contains'
  if (label === 'storyboard_format') return 'how to write a storyboard'
  if (label === 'part_format') return 'how to draw a part'
  if (label === 'create_body') {
    const rows = Array.isArray(i.px) ? i.px : []
    const w = typeof rows[0] === 'string' ? rows[0].length : '?'
    return `"${i.name}" — ${w}×${rows.length}`
  }
  if (label === 'create_part') return `${i.slot} "${i.name}"`

  const compact = JSON.stringify(input ?? {})
  return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact
}

/**
 * Map one run event onto a conversation row. Returns null for events the
 * conversation does not show: artifacts go to the studio panel, status drives
 * the composer, system messages are engine noise.
 */
export function eventToMessage(
  runId: string,
  event: RunEvent,
  opts: { live?: boolean } = {},
): ChatMessage | null {
  const id = `${runId}-${event.seq}`
  const at = timeLabel(event.ts)
  const payload = asRecord(event.payload)

  if (event.type === 'text') {
    const text = String(payload.text ?? '').trim()
    if (!text) return null
    return { id, role: 'assistant', at, text }
  }

  if (event.type === 'tool') {
    const name = String(payload.name ?? 'tool')
    return {
      id,
      role: 'tool',
      at,
      tool: toolLabel(name),
      detail: describeTool(name, payload.input),
      // Tool events are recorded when the call is made; only the newest one in
      // a live run can still be in flight.
      status: opts.live ? 'running' : 'done',
    }
  }

  if (event.type === 'error') {
    return {
      id,
      role: 'tool',
      at,
      tool: 'error',
      detail: String(payload.message ?? 'Run failed.'),
      status: 'error',
    }
  }

  return null
}

export function eventsToMessages(runId: string, events: readonly RunEvent[]): ChatMessage[] {
  const rows: ChatMessage[] = []
  for (const event of events) {
    const row = eventToMessage(runId, event)
    if (row) rows.push(row)
  }
  return rows
}

/** The newest thing the agent rendered, or null. */
export function latestArtifact(events: readonly RunEvent[]): Artifact | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.type === 'artifact') return event.payload as Artifact
  }
  return null
}
