import type { Genome, StoryboardJSON } from 'pixtro/core'
import type { LibraryAdditions } from 'pixtro-mcp/tools'

export type { LibraryAdditions }

/**
 * Chat domain types.
 *
 * Two layers, kept apart on purpose: the *records* a run produces (sessions,
 * turns, events) and the *view models* the conversation renders. The mappers in
 * `events.ts` go from one to the other, and they are the only place that knows
 * both shapes — which is what lets replayed history and a live stream render
 * identically.
 */

export type RunStatus = 'queued' | 'running' | 'done' | 'error' | 'stopped'

export type RunEventType = 'text' | 'tool' | 'artifact' | 'parts' | 'error' | 'system' | 'status'

export type RunEvent = {
  readonly seq: number
  readonly ts: string
  readonly type: RunEventType
  readonly payload: unknown
}

export type ChatSession = {
  readonly id: string
  readonly title: string
  readonly createdAt: string
  readonly updatedAt: string
  /**
   * The Claude Code session behind this chat. Continuity is the engine's own
   * session resumed each turn, not a message array we replay — the CLI keeps
   * the transcript, tool results and all.
   */
  readonly engineSessionId: string | null
  /**
   * Parts the agent drew in this chat. Layered over the built-ins for every
   * turn, so a body created early is still there later — and shipped with
   * each artifact so the browser can draw it too.
   */
  readonly parts: LibraryAdditions
  /**
   * Hide the built-in parts from the agent, so every mascot in this chat is one
   * it drew. Per session rather than global: a chat is where the user decides
   * whether they want the blob family or a blank page.
   */
  readonly freehand: boolean
}

export type ChatRun = {
  readonly id: string
  readonly sessionId: string
  readonly status: RunStatus
  /** Claude Code model alias the turn was sent with. */
  readonly model: string
  readonly createdAt: string
  readonly error: string | null
}

/** One user message. Each one starts exactly one run. */
export type ChatTurn = {
  readonly id: string
  readonly sessionId: string
  readonly runId: string
  readonly text: string
  readonly createdAt: string
}

/**
 * What a tool call produced, in a form the client can re-render itself.
 *
 * Not an image: the studio panel has `pixtro/core` and can draw a genome plus
 * a storyboard at any scale, animate it, and hand the storyboard JSON to the
 * editor for tweaking. Shipping pixels would lose all of that.
 */
export type Artifact = {
  readonly genome: Genome
  /** A built-in name, or the wire-format storyboard the agent wrote. */
  readonly story: string | StoryboardJSON
  readonly label: string
  /** Custom parts the genome may depend on. Absent means built-ins only. */
  readonly parts?: LibraryAdditions | undefined
  /**
   * Drawn in freehand mode, so `parts` is the *whole* library rather than a
   * layer on top of the built-ins. The canvas has to compose it the same way
   * the server did or a genome naming the empty `none` eyes will not resolve.
   */
  readonly freehand?: boolean | undefined
}

// --- view models --------------------------------------------------------------

export type ToolStatus = 'running' | 'done' | 'error'

export type ChatMessage =
  | { readonly id: string; readonly role: 'user'; readonly at: string; readonly text: string }
  | { readonly id: string; readonly role: 'assistant'; readonly at: string; readonly text: string }
  | {
      readonly id: string
      readonly role: 'tool'
      readonly at: string
      readonly tool: string
      readonly detail: string
      readonly status: ToolStatus
    }

export type SessionSummary = {
  readonly id: string
  readonly title: string
  readonly updatedLabel: string
  readonly status: 'idle' | 'running' | 'error'
}
