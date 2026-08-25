import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * The local-only gate.
 *
 * The app works by spawning the Claude Code CLI on the machine running the dev
 * server, authenticated with whoever is logged in there. That is inherently a
 * laptop feature, and since the chat is the only thing here, it is the whole
 * app's boundary rather than one route's. Retroz gets the same property purely
 * by architecture; here it is also checked, so a copy of this reachable from
 * anywhere else refuses rather than exposing a subprocess spawn to it.
 *
 * Two layers: `isLoopbackRequest` is cheap and runs on every action and stream
 * request; `chatAvailability` adds the credential check the page uses to decide
 * what to render.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Hostname from a Host header: strips the port, keeps IPv6 brackets intact. */
export function hostnameOf(host: string): string {
  const trimmed = host.trim().toLowerCase()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    return end === -1 ? trimmed : trimmed.slice(0, end + 1)
  }
  return trimmed.replace(/:\d+$/, '')
}

/** A client address as it appears in X-Forwarded-For: bare, sometimes with a port. */
function isLoopbackAddress(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  if (LOOPBACK.has(trimmed)) return true
  // IPv4-mapped IPv6, and bracketed or port-suffixed forms.
  return LOOPBACK.has(hostnameOf(trimmed)) || trimmed === '::ffff:127.0.0.1'
}

/**
 * True only for a request that arrived directly at a loopback address.
 *
 * Next.js sets `x-forwarded-*` on every request, including ones that came
 * straight from the browser — so the mere presence of those headers says
 * nothing. What matters is their *values*: a real proxy or tunnel puts the
 * remote client's address in `x-forwarded-for`, which is the tell.
 *
 * Headers are client-controlled, so this guards against accidental exposure
 * rather than acting as a security boundary. The real boundary is that a
 * deployed environment has no logged-in CLI to spawn.
 */
export function isLoopbackRequest(headers: Headers): boolean {
  const host = headers.get('host')
  if (!host || !LOOPBACK.has(hostnameOf(host))) return false

  const forwardedHost = headers.get('x-forwarded-host')
  if (forwardedHost && !LOOPBACK.has(hostnameOf(forwardedHost))) return false

  // Every hop in the chain has to be local. One public address anywhere
  // means the request crossed a proxy.
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor && !forwardedFor.split(',').every(isLoopbackAddress)) return false

  return true
}

export type Availability = { ok: true } | { ok: false; reason: string }

/** Whether the CLI has somewhere to get credentials from. A heuristic. */
export function hasLocalCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true
  // Claude Code keeps its state here on every platform. On macOS the token is
  // in the Keychain, so the directory is the best signal we can read.
  return existsSync(join(homedir(), '.claude'))
}

export function chatAvailability(headers: Headers): Availability {
  if (process.env.PIXTRO_CHAT === 'off') {
    return { ok: false, reason: 'Chat is disabled (PIXTRO_CHAT=off).' }
  }
  // No host-platform check any more: there is nothing here to deploy, and a
  // request that did arrive from one fails the loopback test below anyway.
  if (!isLoopbackRequest(headers)) {
    return {
      ok: false,
      reason: 'This only answers requests to localhost. Open it at http://localhost instead.',
    }
  }
  if (!hasLocalCredentials()) {
    return {
      ok: false,
      reason:
        'No Claude login found. Install Claude Code and run `claude` once to sign in, or set ANTHROPIC_API_KEY.',
    }
  }
  return { ok: true }
}
