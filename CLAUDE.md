# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

bun workspaces + Turborepo. bun installs and runs scripts; **Node 24 is still the runtime** (next, vitest, and the type-stripped CLI all execute on Node). Run from the repo root:

```bash
bun run dev       # builds the engine, then serves the web toy
bun run build     # engine → dist/, then a production Next build against it
bun run test      # vitest across the workspace
bun run typecheck # tsc --noEmit per package
bun run check     # Biome format + lint, workspace-wide (writes fixes)
bun run check:ci  # same, read-only — what CI runs
bun run changeset # record a version bump for a published package
```

Shared devDependency versions (`typescript`, `vitest`, `tsdown`, `@types/node`) live in the
`workspaces.catalog` block of the root `package.json`; packages reference them as `catalog:`. Bump there.

Engine-only, from the root:

```bash
bun run --filter pixtro cli gen dwi-01                    # render in the terminal
bun run --filter pixtro cli gen --prompt "a sleepy wizard" # prompt → traits
bun run --filter pixtro cli anim dwi-01 --story wake      # storyboard → GIF
bun run --filter pixtro cli sheet -n 32 -o sheet.png      # the art quality gate
bun run --filter pixtro cli list                          # parts, palettes, clips, stories
bun run --filter pixtro cli gen --library ./examples/my-parts.ts --prompt "a dapper ghost"
```

Single test / single case:

```bash
cd packages/pixtro
bunx vitest run test/codecs.test.ts
bunx vitest run test/codecs.test.ts -t "GIF89a"
bunx vitest run -u                                   # update ASCII art snapshots
```

`packages/pixtro`'s `dev` script is `tsdown --watch`, not the CLI — use `cli` to run the CLI.
`packages/pixtro-mcp` has no `dev` script on purpose: a stdio MCP server has no client inside
`turbo dev`, so it is `start` instead and stays out of the dev graph.

`bun install` runs no dependency lifecycle scripts unless the package is in `trustedDependencies`.
Nothing here needs one; if a future dependency does, add it there rather than globally trusting.

## Architecture

### Everything is a palette slot index until the last step

Parts are authored as *slot indices*, composed as slot indices, and only become RGBA at the very
end (`core/render.ts`). Consequences that shape the whole codebase:

- Any part works with any palette for free. Recoloring provably cannot alter shape — there is a
  test asserting exactly that.
- The GIF encoder takes our buffer verbatim. `gifenc` wants indices, so there is **no quantization
  step** — do not add one.
- Upscaling happens on the *index* grid before colorization, so nearest-neighbour is exact by
  construction. Never scale RGBA, and never rely on `image-rendering` or canvas smoothing hints.
  That guarantee only holds while the canvas is drawn at the size it is displayed at, so
  `MascotCanvas` measures its container and re-rasterizes at a smaller *whole* scale when the
  sprite does not fit — a phone gets a 7× sprite, not a 12× one squeezed by CSS. The picker keeps
  the scale you chose (exports honor it) and says what it is showing.

The ten slots and their authoring characters live in `core/types.ts` (`SLOT`, `SLOT_CHARS`).

### One vocabulary, everywhere

`PartLibrary` keys, `Traits` keys, and animation track targets are deliberately the same strings
(`body`, `eyes`, `mouth`, `accessory`, plus `palette` for traits). There is no translation layer
between the registry, a genome, and a storyboard — keep it that way when adding anything.

Trait values are plain `string`, not a union of built-in names, because a library supplied at
runtime can contain anything. Validation is therefore runtime and must stay thorough: `generate`
rejects unknown names, `validateLibrary` checks parts on load, `validateStory` checks part swaps.

### Parts are self-describing

`tags` and `weight` live **on the part**, not in a central table. This is what makes a runtime
library work: a user's part arrives carrying its own roll odds and its own prompt vocabulary, and
nothing central has to be edited to accept it. `weight: 0` means override-only — reachable by an
explicit override or a storyboard swap, never by the seed roll (that is how `blink` eyes work).

### Bind a library, don't thread it

`createEngine(library)` returns the whole surface bound to one library. Prefer it over passing
`library` to `generate`, `compose`, `render`, and every story call — forgetting it in one place
silently mixes a custom genome with default parts, and that surfaces as a wrong picture rather
than an error. `defaultEngine` is the built-in-library instance; the free `generate`/`render`
exports come from it.

### Two formats for one storyboard

`Storyboard` (in memory) allows `beat.clip` to be a string, an inline clip, or an array of either.
`StoryboardJSON` (on the wire) is flat: `clips` and/or `tracks` + `duration`, every field a plain
scalar. The union is pleasant in TypeScript and miserable in a JSON Schema, where it needs `oneOf`
and both models and hand-editors get it wrong.

`parseStoryboard` folds wire → memory; `toStoryboardJSON` / `formatStoryboard` go back. **Every
storyboard that did not come from source goes through `parseStoryboard`** — `--story file.json`,
the web editor's textarea, and the MCP server's tool input all share that one gate. Errors carry a
JSON path (`beats[1].tracks.eyes[0].ease`) because a model has to be able to act on them too.

Unknown top-level keys are ignored on purpose, so hand-edited files can carry a `_comment`.

### Storyboards: tracks parallel, beats serial

`Keyframe` → `Clip` (parallel tracks, fixed duration) → `Storyboard` (beats in sequence). A beat's
`clip` may be an array, which layers clips by merging their tracks. All plain JSON-serializable
data, like parts.

Sampling in `core/story.ts` is **event-driven, not fixed-rate**: it samples where something could
change (keyframe times, beat boundaries, plus ~33fps through tweened spans only), then collapses
runs of identical pose sets into one longer frame. That is why a two-second hold costs one GIF
frame. Don't replace it with a fixed frame rate.

Dedupe compares a small resolved pose key, not pixels — comparing upscaled grids would be
megabytes per frame. `renderStory` then runs a *second* collapse that does compare pixels, on the
unscaled 32×32 grid, because only it knows the genome: a mascot with no accessory should not spend
frames on a clip that lags one.

**Frame boundaries snap to 10ms and no frame is shorter than 20ms.** A GIF delay is written in
hundredths of a second and decoders clamp anything under two of them up to a tenth, so a stray
14ms frame does not play for 14ms — it plays for 100 and takes the animation with it. The snap is
on the boundaries rather than the durations, so nothing drifts and a clip still ends when it says.

### Animating inside a 32-pixel box

`ease` is `hold`, `linear`, `easeIn`, `easeOut` or `easeInOut`; part swaps always step. Three
things about the built-in clips are not obvious from reading them, and all three were learned the
hard way:

- **There is almost no room to move.** `tall` and `hero` wearing the `hat` already touch the top of
  the canvas and `hero` sits one pixel off the bottom, so looping motion lives in `dy` 0..+1 — it
  settles rather than floats — and only accent clips reach -2, briefly. `packages/pixtro` has no
  test for this; measure with `compose` before widening any range.
- **A one-pixel move has no curve.** An ease over a single pixel only decides *when* the one step
  happens, and a plain `hold` key says that more clearly. The curves earn their keep on the moves
  that cross real distance — the launch in `bounce`, the entrance in `riseUp` — where rounding
  turns the curve into *spacing*, which is the thing that reads as weight.
- **Drag sinks, it does not lift.** Accessories sit flush on the head, so an accessory left a pixel
  *above* the body opens a gap and reads as the hat coming off. Lag the accessory on the way up
  only, where it merely sinks into the head. `test/story.test.ts` pins both halves of this.

A tween starts the instant its previous key passes, so holding a pose across a tween needs a
second key at the same offset — that is what the paired keys in `bounce` are for, and without them
the anticipation is over before it registers.

### The art library is plain text

Parts in `core/parts/` are arrays of strings drawn from `SLOT_CHARS`. This is deliberate: art
diffs in a PR, needs no build step, no binary assets, no loader. Tests are ASCII snapshots, so an
art regression is a readable text diff.

Two invariants when editing parts:

- Light comes from the **upper left** in every body — highlights hug the top-left contour, shadows
  pool along the lower right. Break this and the set stops reading as one family.
- Bodies declare `anchors` (`face`, `mouth`, `top`) in **canvas coordinates**, not part-local ones.
  Parts attach to an anchor, so accessories of different heights sit correctly on the same head.
  `align: 'bottom'` measures up from the anchor.

`hero` is the one body that is not a single closed mass, and the one that uses **both** ramps: the
head is skin on `o/s/b/h`, everything below the chin is clothing on the accent ramp `S/B/H`. That
split is what makes a figure read as dressed, and it is why an accent-ramp `helm` or `crown`
matches its outfit in every palette. Its chibi proportions are forced, not stylistic — face parts
are 9–11px wide and center on `face`, so a head under ~13px cannot wear them. Any new figure needs
either a head that wide or its own narrower eyes.

`test/parts.test.ts` catches short rows, wrong declared widths, and stray characters, and crosses
every body with every pair of eyes to fail if ink lands off the body — that last one is what pins
the head-width constraint down. `compose()` also throws at runtime on an unknown character.

To add a built-in part: add it to `core/parts/` with `tags` and a `weight`, then run `cli sheet`
and look at it. Users add parts at runtime instead, via `defineLibrary` or `--library` — see
`packages/pixtro/examples/my-parts.ts`.

Give every part `tags`. They cost nothing and they are the only way `interpret` learns a
vocabulary; a part without them is unreachable from a prompt.

### Prompt interpretation

`core/interpret.ts` scores prompt tokens against part tags. It is deliberately **not** a model
call — the decision is "pick one of four eyes", and a lexicon does it offline, deterministically,
with no API key, and extends itself through custom parts' tags.

Ties resolve to declaration order so results stay deterministic. `unused` reports only tokens that
matched *nothing anywhere* — a token whose candidate lost a tie was still understood, and listing
it as ignored misleads.

### Palette rule

`core/palette.ts` rotates shadows toward a cool anchor (265°) and highlights toward a warm one
(50°), always the shorter way around the wheel. This is direction-agnostic on purpose — green
shadows go teal, red shadows go magenta, no special cases. A naive `lerp(color, black)` ramp reads
as muddy; do not "simplify" it back to one.

### `pixtro/core` must stay browser-safe

Two entry points, split in `tsdown.config.ts`:

- `pixtro/core` — zero dependencies, no Node builtins, no DOM. `apps/web` imports this and draws
  every mascot client-side, so no image is ever sent to the browser.
- `pixtro` — core plus the PNG/GIF codecs. `apps/web` loads it via dynamic `import()` behind the
  GIF button only.

`core/` must never import from `codecs/`. If you add a dependency, it belongs in `codecs/`.

### Workspace wiring

`turbo.json` gives `build`, `test`, `typecheck`, and `dev` all `dependsOn: ["^build"]`, so
`apps/web` always compiles against freshly built `dist` rather than source. **A library change is
not visible to the web app until the library rebuilds.** The upside is that the published
`exports` map is exercised on every dev run.

## Gotchas

**`gifenc` resolves to different shapes in different runtimes.** It ships CJS + ESM + a `browser`
field with no `exports` map. Node's named-export detection fails on its esbuild output (so Node
needs the *default*), while bundlers get a different interop namespace. `codecs/gif.ts` probes for
the function across both shapes, **on first call rather than at module scope** — bundlers
initialize wrapped CJS lazily, so the namespace can still be empty during module evaluation. Don't
collapse this back to a plain import; it will pass in Node and throw in the browser.

**No `enum`, no decorators, no parameter properties.** Node strips types rather than compiling
them, so the syntax has to survive erasure. `erasableSyntaxOnly` in the engine's `tsconfig.json`
enforces it. Use `as const` objects and union types.

**`as const satisfies` narrows to literal types.** Reading optional fields off such a table (e.g.
`CLIPS`) requires widening back to the interface first — see `core/animate.ts`.

**Codec bugs only reproduce in the right runtime.** The engine's tests cover the Node path only.
Changes to `codecs/` or to anything the web app imports need an actual browser check.

**Storyboard validation is two layers, and both matter.** A JSON Schema can check shape; it
cannot know whether `part: "sleepy"` names an eyes part *this library* has. `parseStoryboard`
does shape, `validateStory` does meaning. In the MCP server the SDK enforces the schema before
the handler runs, so only semantic errors reach pixtro — do not collapse the two.

**`turbo dev` runs `pixtro:build` and `pixtro:dev` (tsdown watch) against the same `dist/`.** The
tsdown configs therefore never `clean` in watch mode and `ignoreWatch` `.turbo/` — otherwise a
turbo log write triggers a rebuild that empties `dist/` while a consumer is importing it
(`ERR_MODULE_NOT_FOUND` on `pixtro/dist/index.js`). Keep both settings if you touch those configs.

**`apps/web/AGENTS.md` and `apps/web/CLAUDE.md` are generated** and re-added by `next dev` on every
run. Commit them with your work or they will keep reappearing as uncommitted changes.

## MCP server

`packages/pixtro-mcp` exposes pixtro as MCP tools. **pixtro is the tool, not the caller** — there
is no model and no API key anywhere in this repo. An agent that connects already has a model.

Two design points worth preserving:

- `src/tools.ts` knows nothing about MCP — plain async functions returning plain data, so the tool
  surface is testable without a transport. `src/server.ts` is the only file importing the SDK.
- `render_animation` returns a **contact sheet**, not a GIF. A model cannot watch a GIF; a grid of
  every distinct frame is what makes the motion reviewable so the agent can revise its storyboard.

The SDK is `@modelcontextprotocol/server` v2 (`serveStdio`, `registerTool`, `fromJsonSchema`) —
**not** the older `@modelcontextprotocol/sdk` with `McpServer`+`StdioServerTransport`.

`test/stdio.test.ts` drives the real server over a real pipe; that is the only way the SDK
bindings and content-block shapes get verified.

## Chat (`apps/web/src/lib/chat`, `/chat`)

A retroz-style chat that drives pixtro through the **local Claude Code CLI** via
`@anthropic-ai/claude-agent-sdk`. The binary is bundled with the SDK; what must exist on the
machine is a *login* (`~/.claude`, or `ANTHROPIC_API_KEY`). That is what makes it local-only.

**The chat is the whole app.** There was a studio at `/` — seed box, trait dropdowns, export row,
driven by hand — and it is gone; `/` redirects. Everything it did an agent does through the MCP
tools, and the panel beside the conversation still draws the result live and still exports it.
Two consequences worth keeping in mind before adding UI here: there is no longer a hand-driven
surface to design for or keep in sync, and the studio was the only half of this app that could
run anywhere, because it was the only half that needed no model. Don't reintroduce one.

Shape, borrowed from retroz:

- **Server action to send, SSE to receive.** `sendChatMessage` stores the turn, queues the run,
  and returns a `runId` in ~20ms; the client opens `EventSource('/api/runs/:id/stream')`.
- **Persist-then-emit through one `record()`.** The store (`store.ts`) is the replay source, the
  bus (`bus.ts`) is the live tap. The stream route replays the store then subscribes, so a
  refresh mid-turn loses nothing.
- **Pure mappers shared by server and client** (`events.ts`). Row ids are `${runId}-${seq}`
  on both sides, so when `router.refresh()` swaps stream rows for stored rows nothing jumps.
- **Tool inputs drive the UI.** `render_animation` records an `artifact` event carrying the
  resolved genome + storyboard; the studio panel redraws it with `pixtro/core` and loads the
  storyboard into the editor. No image is ever sent to the browser.
- **One serial queue.** Never two CLI spawns at once.

Where it deliberately differs from retroz:

- **No `bypassPermissions`.** `tools: []` removes every built-in, `allowedTools` lists only
  `mcp__pixtro__*`, `permissionMode: 'dontAsk'` denies the rest. The agent cannot touch the
  filesystem or shell.
- **A real loopback gate** (`local.ts`). Retroz relies on architecture alone; here every action
  and the stream route check the request, and the page degrades to an explanation. Since the chat
  is the only thing here, that gate is the whole app's boundary. There is no host-platform check
  (`VERCEL` and friends) — nothing here is meant to be deployed, and a request that arrived from
  a deployment or a tunnel fails the loopback test anyway, which `test/local.test.ts` pins.
- **In-memory store**, not Postgres. Survives HMR and page refresh via `globalThis`; not a server
  restart. Everything goes through `store.ts`, so `node:sqlite` is a one-file swap.

Tools are `pixtro-mcp/tools` (same functions as the stdio server) wrapped in `tools.ts`. The
storyboard input schema is `z.fromJSONSchema(STORYBOARD_SCHEMA)` — one schema, all transports.

### One pane at a time on a phone

The three columns collapse below `lg`: the conversation is the page, and the rail and the studio
are overlays reached from the two buttons the chat header grows. Both are component state rather
than routes — the back button belongs to the conversation, and a dismissed drawer should leave the
chat exactly where it was. Because the studio can be closed when a render lands, its button
carries a dot until you have seen the current artifact.

`ChatRail` takes an `onNavigate` so the drawer can close itself: picking a session stays on the
same route, so nothing else would tell it to get out of the way.

Two things that bite on a real phone and are easy to undo by accident: the shell is `h-dvh`, not
`h-screen`, or the composer sits under the browser's own toolbar; and every field you *type* into
is 16px below `sm`, because iOS zooms the viewport on focus for anything smaller and does not zoom
back out. `<select>` is exempt — it opens a picker, not a keyboard.

### Freehand mode

A per-session switch (`ChatSession.freehand`, the checkbox in the chat header) that decides which
base the session's parts layer onto: `DEFAULT_LIBRARY` normally, `EMPTY_BASE` in freehand. It is
one argument threaded from the store through `createPixtroMcp` into `createToolset`, not a second
code path.

`EMPTY_BASE` (in `core/library.ts`) is palettes plus an empty `none` for eyes/mouth/accessory —
and **no bodies at all**, so `defineLibrary` refuses to build a library until the agent draws one.
That refusal is deliberate: it is what tells the agent it has nothing yet instead of quietly
rendering a blank 32×32. `createToolset` therefore holds `Engine | null` and every rendering tool
goes through `live()`, which throws a message naming `create_body`. `list_parts` and `part_format`
deliberately still answer in that state — they are the two tools an agent needs at exactly that
moment.

Two things that ride along with the mode:

- **The artifact carries a `freehand` flag.** In normal mode the browser layers `artifact.parts`
  over the built-ins; in freehand there is nothing underneath, and a genome naming the empty
  `none` eyes would not resolve. `chat-canvas.tsx` picks the base from the flag.
- **Toggling drops `engineSessionId`.** The mode is baked into the system prompt the CLI was
  started with, so a resumed session would keep the old instructions. The next turn starts cold
  and `coldPrompt` recaps the conversation into it. `setChatFreehand` refuses mid-run, because the
  toolset that turn is holding is bound to one library.

The stdio server has the same switch via `PIXTRO_FREEHAND=1` — an MCP client config can set an env
var but cannot pass argv.

### The agent can draw

`create_body` / `create_part` let the agent author pixel rows when nothing built-in fits. The
loop is validate → render → the agent looks → revise with the same name. Three things hold it up:

- **`createToolset` owns a growing library.** Parts live on the chat session (`session.parts`),
  are layered over the built-ins every turn, and ride along in every `artifact` event so the
  browser can draw a body it has never seen. The canvas marks such a mascot "drawn in this chat",
  because those parts live nowhere else and do not survive a server restart.
- **A rejected part never lands.** `createBody` trial-defines the whole library before
  committing. The error names the row and character; that message is all the agent gets.
- **`lightingWarnings` are notes, not errors.** A body lit from the wrong side still renders,
  but the agent hears about it while the rows are still in hand.

`w`/`h` are derived from the rows, never declared — one fewer thing to get inconsistent.

Gotchas:

- **Next injects `x-forwarded-*` on every request**, including direct localhost ones. The gate
  checks their *values* are loopback, not their presence. `local.test.ts` pins the exact header
  set a direct request carries.
- **`env` on `query()` replaces the subprocess env** rather than merging. Spread `process.env`.
- The `mcp__pixtro__` prefix in `ALLOWED_TOOLS` must match the server name exactly.
- Conversation memory is the CLI's own session (`resume`), not a message array. On a failed
  resume the executor records a `system` event and restarts cold with `coldPrompt()`.
- **Don't drop stream rows on settle.** `chat-workspace.tsx` keeps the stream/optimistic rows
  until `props.messages` contains the server's copy of the turn. Clearing them as soon as the
  run finishes flashes the conversation back to its pre-turn state until `router.refresh()`
  lands.

## Trademark

The mascot design grammar is influenced by Claude's mascot — soft blob, minimal face, warm
palette. Take the grammar, not the character; do not add parts that reproduce it closely.
