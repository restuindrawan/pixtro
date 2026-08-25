import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The Agent SDK spawns the Claude Code binary as a subprocess. It must stay a
  // real node_modules import on the server, never get bundled by Turbopack.
  serverExternalPackages: ['@anthropic-ai/claude-agent-sdk'],
}

export default nextConfig
