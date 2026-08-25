import { defineConfig } from 'tsdown'

export default defineConfig((options) => ({
  entry: { server: 'src/server.ts', tools: 'src/tools.ts' },
  format: 'esm',
  dts: true,
  target: 'node22',
  external: ['@modelcontextprotocol/server', 'pixtro'],
  // See packages/pixtro/tsdown.config.ts for why these matter under `turbo dev`.
  clean: !options.watch,
  ignoreWatch: ['.turbo', 'dist', 'node_modules'],
}))
