import { tmpdir } from 'node:os'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { emitRunEvent } from './bus'
import { coldPrompt, systemPrompt } from './prompt'
import { registerAbort } from './queue'
import * as store from './store'
import { ALLOWED_TOOLS, createPixtroMcp, MCP_NAME } from './tools'
import type { RunEventType, RunStatus } from './types'

/**
 * Execute one chat turn on the local Claude Code engine.
 *
 * This is the only place the Agent SDK is called. Everything the run produces
 * goes through `record`, which stores the event and then emits it — the store
 * is what the SSE route replays, the bus is what it live-taps. Both sides see
 * the same sequence, so a client that connects late loses nothing.
 */

export type ChatModel = 'opus' | 'sonnet' | 'haiku'

/** Anything not a valid alias falls back to the most capable option. */
export function normalizeModel(value: unknown): ChatModel {
  return value === 'sonnet' || value === 'haiku' ? value : 'opus'
}

export async function executeTurn(runId: string): Promise<void> {
  const run = store.getRun(runId)
  if (run?.status !== 'queued') return
  const session = store.getSession(run.sessionId)
  if (!session) return

  const record = (type: RunEventType, payload: unknown) => {
    emitRunEvent(runId, store.appendEvent(runId, type, payload))
  }
  const finish = (status: RunStatus, error: string | null = null) => {
    store.setRunStatus(runId, status, error)
    record('status', { status, final: true })
  }

  store.setRunStatus(runId, 'running')
  record('status', { status: 'running' })

  const controller = new AbortController()
  const unregister = registerAbort(runId, controller)

  const turns = store.listTurns(session.id)
  const latestTurn = turns.at(-1)
  if (!latestTurn || latestTurn.runId !== runId) {
    unregister()
    finish('error', 'Run has no message.')
    return
  }
  // Re-bound as definite values so the inner `runOnce` sees them that way;
  // TypeScript does not carry narrowing into a hoisted function.
  const latest = latestTurn
  const sessionId = session.id

  // Prior assistant replies, one per earlier turn, for the cold-start recap.
  const assistantTexts = turns.slice(0, -1).map((turn) =>
    store
      .listEvents(turn.runId)
      .filter((event) => event.type === 'text')
      .map((event) => String((event.payload as { text?: string }).text ?? ''))
      .join('\n')
      .trim(),
  )

  const model = normalizeModel(run.model)

  try {
    // Resume the engine's own session when there is one. If that fails (the
    // CLI prunes old sessions), start cold with the conversation recapped.
    const canResume = Boolean(session.engineSessionId) && turns.length > 1
    try {
      await runOnce(canResume ? session.engineSessionId : null)
    } catch (error) {
      if (!canResume || controller.signal.aborted) throw error
      record('system', { text: 'Previous engine session unavailable — starting a fresh one.' })
      store.clearEngineSessionId(session.id)
      await runOnce(null)
    }
  } catch (error) {
    if (controller.signal.aborted) {
      finish('stopped')
    } else {
      const message = error instanceof Error ? error.message : String(error)
      record('error', { message })
      finish('error', message)
    }
  } finally {
    unregister()
  }

  async function runOnce(resume: string | null): Promise<void> {
    // The session's library: parts the agent drew earlier, with new ones
    // written straight back so the next turn — and the next reload — has them.
    // Read fresh: the mode can have been toggled since the run was queued.
    const freehand = store.getSession(sessionId)?.freehand === true
    const mcp = createPixtroMcp({
      freehand,
      parts: store.getSession(sessionId)?.parts ?? {},
      onParts: (parts) => {
        store.setSessionParts(sessionId, parts)
        record('parts', {
          slots: Object.fromEntries(
            Object.entries(parts).map(([k, v]) => [k, Object.keys(v ?? {})]),
          ),
        })
      },
      onArtifact: (artifact) => record('artifact', artifact),
    })

    // `env` replaces the subprocess environment outright rather than merging,
    // so PATH and HOME have to be carried across by hand.
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value
    }

    const response = query({
      prompt: resume ? latest.text : coldPrompt(turns, assistantTexts),
      options: {
        model,
        resume: resume ?? undefined,
        systemPrompt: systemPrompt({ freehand }),
        // The agent gets pixtro's tools and nothing else: no filesystem, no
        // shell. `tools: []` removes every built-in, `allowedTools` pre-approves
        // ours, and `dontAsk` denies anything that is somehow still asked for.
        tools: [],
        allowedTools: ALLOWED_TOOLS,
        permissionMode: 'dontAsk',
        mcpServers: { [MCP_NAME]: mcp },
        cwd: tmpdir(),
        maxTurns: 24,
        abortController: controller,
        includePartialMessages: false,
        env,
      },
    })

    let sessionSaved = false
    let sawResult = false

    for await (const message of response) {
      if (message.type === 'system') {
        if (!sessionSaved && 'session_id' in message && message.session_id) {
          sessionSaved = true
          store.setEngineSessionId(sessionId, message.session_id)
        }
        continue
      }

      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            record('text', { text: block.text })
          } else if (block.type === 'tool_use') {
            record('tool', { name: block.name, input: summarizeInput(block.input) })
          }
        }
        continue
      }

      if (message.type === 'result') {
        sawResult = true
        const ok = message.subtype === 'success' && !message.is_error
        if (ok) {
          finish('done')
        } else {
          const detail =
            message.subtype === 'success'
              ? 'Run reported an error.'
              : `Run ended: ${message.subtype}`
          record('error', { message: detail })
          finish('error', detail)
        }
      }
    }

    if (!sawResult && !controller.signal.aborted) {
      throw new Error('Run ended without a result message.')
    }
  }
}

/**
 * Shrink a tool input before it is stored. A storyboard is the only input that
 * can get large, and the event log only needs enough of it to label the row —
 * the artifact event carries the full thing for the studio panel.
 */
function summarizeInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input
  const record = input as Record<string, unknown>
  const board = record.storyboard
  if (board && typeof board === 'object' && Array.isArray((board as { beats?: unknown }).beats)) {
    return {
      ...record,
      storyboard: { beats: (board as { beats: unknown[] }).beats.map(() => ({})) },
    }
  }
  return input
}
