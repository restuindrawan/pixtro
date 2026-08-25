import { beforeEach, describe, expect, it } from 'vitest'
import { subscribeRun } from '@/lib/chat/bus'
import { sessionDetail, sessionSummaries } from '@/lib/chat/queries'
import { abortRun, enqueue, registerAbort } from '@/lib/chat/queue'
import * as store from '@/lib/chat/store'

beforeEach(() => store.resetStore())

describe('store', () => {
  it('titles a session from its first message only', () => {
    const session = store.createSession()
    store.maybeTitleSession(session.id, 'make me a wizard\nplease')
    store.maybeTitleSession(session.id, 'something else')
    expect(store.getSession(session.id)?.title).toBe('make me a wizard')
  })

  it('numbers events per run from zero', () => {
    const session = store.createSession()
    const { run } = store.addTurn(session.id, 'hi', 'opus')
    store.appendEvent(run.id, 'text', { text: 'a' })
    store.appendEvent(run.id, 'text', { text: 'b' })
    expect(store.listEvents(run.id).map((event) => event.seq)).toEqual([0, 1])
  })

  it('reports the active run while one is queued or running', () => {
    const session = store.createSession()
    const { run } = store.addTurn(session.id, 'hi', 'opus')
    expect(store.activeRun(session.id)?.id).toBe(run.id)
    store.setRunStatus(run.id, 'done')
    expect(store.activeRun(session.id)).toBeUndefined()
  })
})

describe('queries', () => {
  it('interleaves user turns with their run events, in order', () => {
    const session = store.createSession()
    const a = store.addTurn(session.id, 'first', 'opus')
    store.appendEvent(a.run.id, 'text', { text: 'reply one' })
    store.setRunStatus(a.run.id, 'done')
    const b = store.addTurn(session.id, 'second', 'opus')
    store.appendEvent(b.run.id, 'tool', { name: 'mcp__pixtro__generate_mascot', input: {} })
    store.appendEvent(b.run.id, 'artifact', { label: 'x', genome: {}, story: 'alive' })

    const detail = sessionDetail(session.id)
    expect(detail?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'tool'])
    expect(detail?.artifact).toMatchObject({ label: 'x' })
    expect(detail?.activeRunId).toBe(b.run.id)
  })

  it('summarises session status from its runs', () => {
    const session = store.createSession()
    const { run } = store.addTurn(session.id, 'x', 'opus')
    expect(sessionSummaries()[0]?.status).toBe('running')
    store.setRunStatus(run.id, 'error', 'nope')
    expect(sessionSummaries()[0]?.status).toBe('error')
  })

  it('returns null for an unknown session', () => {
    expect(sessionDetail('nope')).toBeNull()
  })
})

describe('queue', () => {
  it('runs jobs one at a time, in order', async () => {
    const order: string[] = []
    const job = (name: string, ms: number) => () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          order.push(name)
          resolve()
        }, ms),
      )
    // The slow job is queued first; if jobs ran concurrently the fast one would win.
    enqueue(job('slow', 30))
    enqueue(job('fast', 1))
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(order).toEqual(['slow', 'fast'])
  })

  it('keeps going after a job throws', async () => {
    const order: string[] = []
    enqueue(async () => {
      throw new Error('boom')
    })
    enqueue(async () => {
      order.push('after')
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(order).toEqual(['after'])
  })

  it('aborts a registered run and reports unknown ones', () => {
    const controller = new AbortController()
    const unregister = registerAbort('r1', controller)
    expect(abortRun('r1')).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    unregister()
    expect(abortRun('r1')).toBe(false)
  })
})

describe('bus', () => {
  it('delivers to subscribers of that run only', async () => {
    const { emitRunEvent } = await import('@/lib/chat/bus')
    const got: number[] = []
    const off = subscribeRun('a', (event) => got.push(event.seq))
    emitRunEvent('a', { seq: 1, ts: '', type: 'text', payload: {} })
    emitRunEvent('b', { seq: 2, ts: '', type: 'text', payload: {} })
    off()
    emitRunEvent('a', { seq: 3, ts: '', type: 'text', payload: {} })
    expect(got).toEqual([1])
  })
})

describe('stale session urls', () => {
  /**
   * The store is in memory, so every chat URL goes stale when the dev server
   * restarts. `sessionDetail` returning null is the normal case for a
   * bookmark or a left-open tab, and the page redirects on it rather than
   * treating it as a 404 — see app/chat/[sessionId]/page.tsx.
   */
  it('reports an unknown session as absent rather than throwing', () => {
    expect(sessionDetail('a-session-from-a-previous-server')).toBeNull()
  })

  it('still resolves a session that does exist', () => {
    const session = store.createSession()
    expect(sessionDetail(session.id)).not.toBeNull()
  })
})

describe('freehand mode', () => {
  it('is off by default and rides along on the session detail', () => {
    const session = store.createSession()
    expect(session.freehand).toBe(false)
    expect(sessionDetail(session.id)?.freehand).toBe(false)
  })

  /**
   * The mode is baked into the system prompt the CLI was started with, so a
   * resumed engine session would keep working from the old instructions. The
   * next turn has to start cold; `coldPrompt` recaps the conversation into it.
   */
  it('drops the engine session when the mode changes', () => {
    const session = store.createSession()
    store.setEngineSessionId(session.id, 'engine-1')

    expect(store.setSessionFreehand(session.id, true)).toBe(true)
    expect(store.getSession(session.id)?.freehand).toBe(true)
    expect(store.getSession(session.id)?.engineSessionId).toBeNull()
  })

  it('leaves the engine session alone when the mode is already what was asked for', () => {
    const session = store.createSession('new chat', true)
    store.setEngineSessionId(session.id, 'engine-1')

    expect(store.setSessionFreehand(session.id, true)).toBe(false)
    expect(store.getSession(session.id)?.engineSessionId).toBe('engine-1')
  })
})
