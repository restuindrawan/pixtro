# Contributing

```bash
bun install
bun run dev       # engine builds, then the chat serves on :3000
bun run check     # Biome format + lint (writes fixes)
bun run typecheck
bun run test
```

bun 1.3 (`packageManager`) installs and runs scripts; Node 24 (`.nvmrc`) is the runtime that
`next`, `vitest`, and the type-stripped CLI execute on. You need both.

## Layout

| path | what |
|---|---|
| `packages/pixtro` | the engine + CLI, published to npm |
| `packages/pixtro-mcp` | MCP server, published to npm |
| `apps/web` | the local chat, a Next.js app; private, and not deployable |

Shared devDependency versions live in `workspaces.catalog` in the root `package.json`; packages
reference them as `"typescript": "catalog:"`. Bump there, not in each package.

## Adding art

Parts are plain text in `packages/pixtro/src/core/parts/`. Give every part `tags` and a
`weight`, then run the contact sheet and look at it:

```bash
bun run --filter pixtro cli sheet -n 32 -o sheet.png
```

Tests are ASCII snapshots; an art regression is a readable diff. `CLAUDE.md` has the invariants
(light from the upper left, anchors in canvas coordinates).

## Changes that touch a published package

Add a changeset so the release notes and version bump are recorded with the change:

```bash
bun run changeset
```

Pick the package(s), a bump level, and write a line for the changelog. CI runs
`check:ci`, `typecheck`, `test`, and `build` on every PR.

## Conventions worth knowing

- No `enum`, decorators, or parameter properties — Node strips types rather than compiling
  them, and `erasableSyntaxOnly` enforces it.
- `pixtro/core` has zero dependencies and must stay browser-safe. New dependencies go in
  `codecs/`.
- Codec and browser changes need an actual browser check; the engine's tests cover Node only.
