import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Drives the real server over a real stdio pipe.
 *
 * The tool logic is covered directly in `tools.test.ts`; what this file exists
 * to prove is the wiring — that the SDK bindings, the JSON Schema conversion,
 * and the content-block shapes are right. Those are exactly the parts that
 * cannot be verified by importing a function.
 */

const SERVER = fileURLToPath(new URL('../src/server.ts', import.meta.url))

type ContentBlock = { type: string; text?: string; data?: string; mimeType?: string }
type RpcResult = {
  serverInfo?: { name: string }
  tools?: { name: string }[]
  content?: ContentBlock[]
  isError?: boolean
}
type RpcResponse = { id?: number; result?: RpcResult; error?: { message: string } }

async function callServer(requests: object[]): Promise<RpcResponse[]> {
  const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] })
  const responses: RpcResponse[] = []
  let buffer = ''
  let stderr = ''

  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  const done = new Promise<void>((resolveDone, rejectDone) => {
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk)
      let index = buffer.indexOf('\n')
      while (index !== -1) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line) responses.push(JSON.parse(line))
        index = buffer.indexOf('\n')
      }
      // Notifications carry no id, so count only the ones we asked for.
      const answered = responses.filter((message) => message.id !== undefined).length
      if (answered >= requests.filter((r) => 'id' in r).length) resolveDone()
    })
    child.on('error', rejectDone)
    child.on('exit', (code) => {
      if (code !== 0 && responses.length === 0) {
        rejectDone(new Error(`server exited ${code}\n${stderr}`))
      } else resolveDone()
    })
    setTimeout(
      () => rejectDone(new Error(`timed out\nstdout: ${buffer}\nstderr: ${stderr}`)),
      25_000,
    )
  })

  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`)

  try {
    await done
  } finally {
    child.kill()
  }
  return responses
}

const handshake = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'pixtro-test', version: '1.0.0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
]

const byId = (responses: RpcResponse[], id: number) => responses.find((r) => r.id === id)

describe('stdio server', () => {
  it('completes a handshake and advertises every tool', async () => {
    const responses = await callServer([
      ...handshake,
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ])

    const init = byId(responses, 1)
    expect(init?.error).toBeUndefined()
    expect(init?.result?.serverInfo?.name).toBe('pixtro')

    const names = (byId(responses, 2)?.result?.tools ?? []).map((t) => t.name)
    expect(names.sort()).toEqual(
      [
        'create_body',
        'create_part',
        'generate_mascot',
        'list_parts',
        'part_format',
        'render_animation',
        'storyboard_format',
      ].sort(),
    )
  }, 30_000)

  it('returns a mascot as an image block', async () => {
    const responses = await callServer([
      ...handshake,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'generate_mascot',
          arguments: { prompt: 'a sleepy wizard blob', scale: 4 },
        },
      },
    ])

    const result = byId(responses, 2)?.result
    expect(result?.isError).toBeFalsy()
    const image = result?.content?.find((block) => block.type === 'image')
    expect(image?.mimeType).toBe('image/png')
    // PNG magic survives the base64 round trip.
    expect(
      Buffer.from(image?.data ?? '', 'base64')
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG')

    const text = result?.content?.find((block) => block.type === 'text')?.text
    expect(text).toContain('eyes=sleepy')
    expect(text).toContain('accessory=hat')
  }, 30_000)

  it('accepts a custom storyboard and returns a reviewable contact sheet', async () => {
    const responses = await callServer([
      ...handshake,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'render_animation',
          arguments: {
            seed: 'dwi-01',
            scale: 3,
            storyboard: {
              beats: [
                {
                  duration: 400,
                  tracks: {
                    all: [
                      { at: 0, dy: 8 },
                      { at: 300, dy: 0, ease: 'linear' },
                    ],
                  },
                },
                { clips: ['bob', 'blinkTwice'] },
              ],
            },
          },
        },
      },
    ])

    const result = byId(responses, 2)?.result
    expect(result?.isError).toBeFalsy()
    const text = result?.content?.find((block) => block.type === 'text')?.text
    expect(text).toContain('inline storyboard')
    expect(text).toMatch(/\d+ frames over \d+ms/)
    expect(result?.content?.some((block) => block.type === 'image')).toBe(true)
  }, 30_000)

  /**
   * Storyboards are validated in two layers, and both have to point at the
   * offending keyframe for an agent to be able to repair its own output.
   *
   * The SDK checks the JSON Schema before the handler runs, so shape errors
   * never reach pixtro. Meaning — "is `sleepy` actually an eyes part in this
   * library?" — is beyond what a schema can express, so `validateStory` catches
   * that inside the handler.
   */
  async function errorFor(storyboard: unknown): Promise<string> {
    const responses = await callServer([
      ...handshake,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'render_animation', arguments: { seed: 'x', storyboard } },
      },
    ])
    const response = byId(responses, 2)
    return (
      response?.error?.message ??
      response?.result?.content?.find((b) => b.type === 'text')?.text ??
      ''
    )
  }

  it('rejects a malformed keyframe at the schema layer, naming the path', async () => {
    const message = await errorFor({
      beats: [{ duration: 100, tracks: { all: [{ at: 0, ease: 'bouncy' }] } }],
    })
    expect(message).toContain('beats/0/tracks/all/0/ease')
  }, 30_000)

  it('rejects a part the library does not have, which no schema could catch', async () => {
    const message = await errorFor({
      beats: [{ duration: 100, tracks: { eyes: [{ at: 0, part: 'wings' }] } }],
    })
    expect(message).toContain('eyes "wings"')
    expect(message).toContain('dot, oval, sleepy, sparkle, blink')
  }, 30_000)

  it('rejects an unknown clip name', async () => {
    expect(await errorFor({ beats: [{ clips: ['wiggle'] }] })).toContain('unknown clip "wiggle"')
  }, 30_000)
})
