import { afterEach, describe, expect, it } from 'vitest'
import { chatAvailability, hostnameOf, isLoopbackRequest } from '@/lib/chat/local'

const headersOf = (entries: Record<string, string>) => new Headers(entries)

describe('hostnameOf', () => {
  it.each([
    ['localhost:3000', 'localhost'],
    ['LOCALHOST', 'localhost'],
    ['127.0.0.1:3000', '127.0.0.1'],
    ['[::1]:3000', '[::1]'],
    ['[::1]', '[::1]'],
    ['pixtro.vercel.app', 'pixtro.vercel.app'],
  ])('%s → %s', (host, expected) => {
    expect(hostnameOf(host)).toBe(expected)
  })
})

describe('isLoopbackRequest', () => {
  it('accepts the three loopback spellings', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) {
      expect(isLoopbackRequest(headersOf({ host })), host).toBe(true)
    }
  })

  it('rejects any other host', () => {
    expect(isLoopbackRequest(headersOf({ host: 'pixtro.vercel.app' }))).toBe(false)
    expect(isLoopbackRequest(headersOf({ host: '192.168.0.208:3000' }))).toBe(false)
  })

  /**
   * Next.js injects x-forwarded-* on every request, including direct ones, so
   * their presence proves nothing. This is the exact header set a direct
   * localhost request carries in the dev server; it has to pass.
   */
  it('accepts the headers Next adds to a direct localhost request', () => {
    expect(
      isLoopbackRequest(
        headersOf({
          host: 'localhost:3000',
          'x-forwarded-for': '::1',
          'x-forwarded-host': 'localhost:3000',
          'x-forwarded-port': '3000',
          'x-forwarded-proto': 'http',
        }),
      ),
    ).toBe(true)
    expect(
      isLoopbackRequest(headersOf({ host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1' })),
    ).toBe(true)
  })

  /**
   * The important case. A tunnel or reverse proxy forwards to localhost, so
   * the Host header looks fine — but the forwarded-for chain carries the real
   * client address, and that is the tell.
   */
  it('rejects a loopback host that arrived through a proxy', () => {
    expect(
      isLoopbackRequest(headersOf({ host: 'localhost:3000', 'x-forwarded-for': '203.0.113.9' })),
    ).toBe(false)
    expect(
      isLoopbackRequest(
        headersOf({ host: 'localhost:3000', 'x-forwarded-for': '203.0.113.9, ::1' }),
      ),
    ).toBe(false)
    expect(
      isLoopbackRequest(headersOf({ host: 'localhost:3000', 'x-forwarded-host': 'pixtro.app' })),
    ).toBe(false)
  })

  it('rejects a missing host header', () => {
    expect(isLoopbackRequest(headersOf({}))).toBe(false)
  })
})

describe('chatAvailability', () => {
  const saved = { ...process.env }
  afterEach(() => {
    delete process.env.PIXTRO_CHAT
    Object.assign(process.env, saved)
  })

  /**
   * There is no host-platform check any more — nothing here is meant to be
   * deployed. What used to guarantee has to still hold through the loopback
   * test alone: a request that reached a localhost-looking origin by way of a
   * proxy is refused, which is every deployment and every tunnel.
   */
  it('refuses a request that arrived through a proxy at a loopback host', () => {
    const result = chatAvailability(
      headersOf({ host: 'localhost:3000', 'x-forwarded-for': '203.0.113.9, ::1' }),
    )
    expect(result.ok).toBe(false)
  })

  it('can be switched off explicitly', () => {
    process.env.PIXTRO_CHAT = 'off'
    expect(chatAvailability(headersOf({ host: 'localhost:3000' })).ok).toBe(false)
  })

  it('explains a non-local request', () => {
    const result = chatAvailability(headersOf({ host: 'example.com' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/localhost/)
  })
})
