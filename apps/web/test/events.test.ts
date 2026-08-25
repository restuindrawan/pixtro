import { describe, expect, it } from 'vitest'
import {
  describeTool,
  eventsToMessages,
  eventToMessage,
  latestArtifact,
  toolLabel,
} from '@/lib/chat/events'
import type { RunEvent } from '@/lib/chat/types'

const at = (seq: number, type: RunEvent['type'], payload: unknown): RunEvent => ({
  seq,
  ts: '2026-08-22T10:30:00.000Z',
  type,
  payload,
})

describe('toolLabel', () => {
  it('strips the MCP server prefix', () => {
    expect(toolLabel('mcp__pixtro__render_animation')).toBe('render_animation')
    expect(toolLabel('list_parts')).toBe('list_parts')
  })
})

describe('describeTool', () => {
  it('shows the prompt for a prompted mascot', () => {
    expect(describeTool('mcp__pixtro__generate_mascot', { prompt: 'a sleepy wizard' })).toBe(
      '"a sleepy wizard"',
    )
  })

  it('shows pinned traits and seed otherwise', () => {
    expect(describeTool('generate_mascot', { seed: 'dwi-01', eyes: 'sparkle' })).toBe(
      'seed dwi-01 eyes=sparkle',
    )
    expect(describeTool('generate_mascot', {})).toBe('from seed')
  })

  it('counts beats of a custom storyboard', () => {
    expect(describeTool('render_animation', { storyboard: { beats: [{}, {}, {}] } })).toBe(
      'custom storyboard, 3 beats',
    )
    expect(describeTool('render_animation', { story: 'wake' })).toBe('built-in "wake"')
  })
})

describe('eventToMessage', () => {
  it('maps text to an assistant row', () => {
    expect(eventToMessage('r1', at(0, 'text', { text: 'hello' }))).toMatchObject({
      id: 'r1-0',
      role: 'assistant',
      text: 'hello',
    })
  })

  it('drops empty text', () => {
    expect(eventToMessage('r1', at(0, 'text', { text: '   ' }))).toBeNull()
  })

  it('marks only a live tool row as running', () => {
    const event = at(3, 'tool', { name: 'mcp__pixtro__generate_mascot', input: {} })
    expect(eventToMessage('r1', event)).toMatchObject({ status: 'done' })
    expect(eventToMessage('r1', event, { live: true })).toMatchObject({ status: 'running' })
  })

  it('maps an error to a failed tool row', () => {
    expect(eventToMessage('r1', at(0, 'error', { message: 'boom' }))).toMatchObject({
      role: 'tool',
      tool: 'error',
      detail: 'boom',
      status: 'error',
    })
  })

  it('hides artifacts, status and system events from the conversation', () => {
    expect(eventToMessage('r1', at(0, 'artifact', {}))).toBeNull()
    expect(eventToMessage('r1', at(1, 'status', { status: 'running' }))).toBeNull()
    expect(eventToMessage('r1', at(2, 'system', { text: 'x' }))).toBeNull()
  })

  /**
   * The id scheme is the contract between the live stream and the stored
   * replay: both must produce the same id for the same event, or the merge in
   * the workspace would show a row twice as the run settles.
   */
  it('keys rows by run and seq so replay and live agree', () => {
    const event = at(7, 'text', { text: 'same' })
    expect(eventToMessage('run', event)?.id).toBe(eventsToMessages('run', [event])[0]?.id)
  })
})

describe('latestArtifact', () => {
  it('returns the newest artifact event', () => {
    const events = [
      at(0, 'artifact', { label: 'first' }),
      at(1, 'text', { text: 'x' }),
      at(2, 'artifact', { label: 'second' }),
      at(3, 'status', { status: 'done' }),
    ]
    expect(latestArtifact(events)).toMatchObject({ label: 'second' })
    expect(latestArtifact([])).toBeNull()
  })
})
