'use server'

import { headers } from 'next/headers'
import { executeTurn, normalizeModel } from './executor'
import { isLoopbackRequest } from './local'
import { abortRun, enqueue } from './queue'
import * as store from './store'

/**
 * Mutations are server actions; only the stream is a route handler.
 *
 * Sending a message does not wait for the agent. It records the turn, queues
 * the run, and returns the run id so the client can open the event stream
 * immediately — the same split retroz uses, and the reason a slow turn never
 * blocks the UI or hits a request timeout.
 */

async function assertLocal(): Promise<void> {
  if (!isLoopbackRequest(await headers())) {
    throw new Error('pixtro chat only answers requests to localhost')
  }
}

export async function createChatSession(freehand = false): Promise<{ sessionId: string }> {
  await assertLocal()
  return { sessionId: store.createSession('new chat', freehand).id }
}

/**
 * Switch a chat between the built-in library and a blank page.
 *
 * Refused mid-run: the toolset the turn is holding is bound to one library, and
 * swapping the mode under it would leave the agent naming parts that vanished.
 */
export async function setChatFreehand(input: {
  sessionId: string
  freehand: boolean
}): Promise<{ changed: boolean }> {
  await assertLocal()
  if (!store.getSession(input.sessionId)) throw new Error('unknown session')
  if (store.activeRun(input.sessionId)) throw new Error('finish the current turn first')
  return { changed: store.setSessionFreehand(input.sessionId, input.freehand) }
}

export async function sendChatMessage(input: {
  sessionId: string
  text: string
  model?: string
}): Promise<{ runId: string; turnId: string }> {
  await assertLocal()

  const text = input.text.trim()
  if (!text) throw new Error('message is empty')
  if (!store.getSession(input.sessionId)) throw new Error('unknown session')
  if (store.activeRun(input.sessionId)) throw new Error('a turn is already running')

  store.maybeTitleSession(input.sessionId, text)
  const { turn, run } = store.addTurn(input.sessionId, text, normalizeModel(input.model))
  enqueue(() => executeTurn(run.id))
  return { runId: run.id, turnId: turn.id }
}

export async function stopChatRun(runId: string): Promise<{ stopped: boolean }> {
  await assertLocal()
  return { stopped: abortRun(runId) }
}
