import { defineConfig } from 'tsdown'

export default defineConfig((options) => ({
  entry: {
    index: 'src/index.ts',
    core: 'src/core/index.ts',
    cli: 'src/cli.ts',
  },
  format: 'esm',
  dts: true,
  target: 'node22',
  // `core` must stay dependency-free so it can drop straight into a browser
  // bundle. Only the codecs are allowed to pull anything in.
  external: ['fast-png', 'gifenc'],

  // In `turbo dev` this watcher runs alongside the consumers of `dist/`. Two
  // rules keep it from pulling the floor out from under them:
  //
  // - Never clean in watch mode. A rebuild that empties `dist/` first leaves a
  //   window where `import 'pixtro'` resolves to nothing, and the MCP server
  //   or the web app will start inside it.
  // - Ignore `.turbo/`. Turbo writes its logs there, inside this package, and
  //   without this every turbo log line becomes a rebuild. (`watch: 'src'`
  //   would be neater, but the CLI's `--watch` flag overrides it with `true`;
  //   `ignoreWatch` applies either way.)
  clean: !options.watch,
  ignoreWatch: ['.turbo', 'dist', 'node_modules'],
}))
