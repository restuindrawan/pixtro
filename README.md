# pixtro

Retro pixel mascot generation engine. A seed string goes in, a 32×32 sprite comes out — the same
seed always produces the same mascot, in the browser and on the command line alike.

```
.
├── packages/pixtro       the engine + CLI  (published)
├── packages/pixtro-mcp   MCP server        (published)
└── apps/web              the local chat    (private)
```

## Quick start

```bash
bun install
bun run dev        # builds the engine, then serves the local chat
```

Or drive the engine on its own:

```bash
bun run --filter pixtro cli gen dwi-01                     # draws in your terminal
bun run --filter pixtro cli gen --prompt "a sleepy wizard blob"
bun run --filter pixtro cli anim dwi-01 --story wake -o wake.gif
bun run --filter pixtro cli sheet -n 32 -o sheet.png       # contact sheet
```

Three things beyond "seed in, sprite out":

- **Prompts.** Parts carry tags, and a prompt is scored against them — offline, deterministic, no
  API key. A prompt narrows a mascot; unmentioned slots still come from a seed.
- **Your own parts.** A part library is plain data, swappable at runtime via `defineLibrary` or
  `--library ./my-parts.ts`. Custom parts bring their own tags, so they're promptable immediately.
- **Storyboards.** Keyframes compose into clips (parallel tracks) and clips into beats (a
  sequence), so animations are authored rather than hardcoded. Edit them as JSON beside the
  conversation, or load a file with `--story ./mine.json`.
- **An MCP server.** `claude mcp add pixtro -- npx -y pixtro-mcp` lets any agent generate mascots
  and author animations. pixtro is the tool, not the caller: no API key, no per-call cost. See
  [`packages/pixtro-mcp`](packages/pixtro-mcp).
- **A local chat, and nothing else.** `bun run dev` then open it: describe a mascot, the agent
  renders it, looks at it, and animates it — with its storyboard dropped into an editor beside the
  conversation to tweak, and PNG/GIF export there too. It can also draw new parts when nothing
  built-in fits, and the **freehand** switch in the header turns the built-ins off entirely, so
  every part in that chat is one the agent drew. There is no hand-driven UI next to it: everything
  it used to offer, an agent does through the MCP tools. Chat runs on your own Claude Code login,
  so it only works on your machine — it answers requests to localhost and refuses everything
  else.

## Workspace commands

| command | what it does |
|---|---|
| `bun run dev` | engine builds first, then `next dev` |
| `bun run build` | engine → `dist/`, then a production Next build against it |
| `bun run test` | vitest across the workspace |
| `bun run typecheck` | `tsc --noEmit` in each package |
| `bun run check` | Biome format + lint, everything |

Task ordering is Turborepo's (`turbo.json`): `build`, `test`, `typecheck`, and `dev` all declare
`dependsOn: ["^build"]`, so the web app is always compiled against a freshly built engine rather
than against stale `dist` output. That also means the published `exports` map gets exercised on
every run — a broken entry point fails the dev server, not a user.

## How the two fit together

`apps/web` depends on `pixtro` as `workspace:*` and imports **`pixtro/core`**, which has zero
dependencies and no Node builtins. That entry point is browser-safe by construction, so the toy
renders entirely client-side with no server round-trip and no polyfills.

The heavier `pixtro` entry point (which pulls in the PNG and GIF encoders) is loaded lazily, and
only when a visitor actually exports an animation. PNG export skips the library encoder entirely
and uses the browser's own `canvas.toBlob`.

See [`packages/pixtro/README.md`](packages/pixtro/README.md) for the engine itself: the text-based
part format, the palette rule, and how to add parts.

## Requirements

Node 22+ and bun 1.3+. bun installs and runs scripts; Node is the runtime. Node's type stripping runs the engine's TypeScript directly, so there is no
build step during development — which also means **no `enum`, no decorators, no parameter
properties**. `erasableSyntaxOnly` enforces it.

## License

MIT
