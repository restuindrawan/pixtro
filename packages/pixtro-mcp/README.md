# pixtro-mcp

MCP server for [pixtro](../pixtro). Lets any agent generate pixel mascots and author their
animations.

**pixtro is the tool, not the caller.** There is no model and no API key in this package —
whichever agent connects already has a model, so authoring an animation costs pixtro nothing.

## Setup

```bash
claude mcp add pixtro -- npx -y pixtro-mcp
```

Or by hand, in any MCP client config:

```json
{
  "mcpServers": {
    "pixtro": { "command": "npx", "args": ["-y", "pixtro-mcp"] }
  }
}
```

From a checkout, point at the built server instead:

```json
{
  "mcpServers": {
    "pixtro": { "command": "node", "args": ["/abs/path/to/packages/pixtro-mcp/dist/server.js"] }
  }
}
```

## Tools

| tool | what it does |
|---|---|
| `list_parts` | Every part, palette, clip and built-in storyboard in the library |
| `storyboard_format` | The storyboard JSON schema, what each track moves, and a worked example |
| `generate_mascot` | A mascot from a prompt, seed, or explicit traits — returned as a PNG |
| `render_animation` | Animate a mascot; returns the frames as a contact sheet |
| `part_format` | How to draw a part: the alphabet, the light rule, anchors, a worked example |
| `create_body` | Draw a new body silhouette and add it to the library for this session |
| `create_part` | Draw new eyes, a mouth, or an accessory |

`generate_mascot` and `render_animation` both take an optional `path` to also save the artifact
(PNG / animated GIF) to disk.

## The agent can draw

When nothing built-in fits — a mushroom, a star, a fish — the agent reads `part_format` and
draws one with `create_body`: rows of the same ten-character alphabet the built-ins use, plus
anchors. It gets back a render with a default face and the rows as text, looks at it, and
revises under the same name until it reads. The body is then available to `generate_mascot`
and `render_animation` for the rest of the session.

Validation is the engine's own, so a bad row is rejected with the row and the character. Soft
shading checks come back as notes: a body lit from the wrong side still renders, but the agent
hears that it will not match the set.

## Freehand

Set `PIXTRO_FREEHAND=1` and the built-in parts are not loaded at all. `list_parts` comes back
empty, `generate_mascot` refuses until a body exists, and the connected agent has to draw
everything with `create_body` / `create_part`. Use it when you want the agent's own art rather
than pixtro's blob family recombined.

```json
{ "command": "npx", "args": ["-y", "pixtro-mcp"], "env": { "PIXTRO_FREEHAND": "1" } }
```

## Two things that make this work well for an agent

**Results come back as images.** An agent can't evaluate `{"frames": 22}` — it needs to see the
sprite. `generate_mascot` returns the PNG directly.

**Animations come back as a contact sheet, not a GIF.** A model cannot watch a GIF. Laying every
distinct frame out in a grid is what makes the motion actually reviewable: the agent sees each
pose and can tell whether the animation reads correctly, then revise the storyboard.

## Errors are repair instructions

Storyboards are validated in two layers, and both name the exact keyframe:

```
# schema layer, before the handler runs
data/storyboard/beats/0/tracks/all/0/ease must be equal to one of the allowed values

# library layer, which no schema could express
storyboard swaps in eyes "wings", which this library does not have
  (has: dot, oval, sleepy, sparkle, blink)
```

The second is the important one. A JSON Schema can check that `part` is a string; it cannot know
which parts this library actually contains. That check lives in the handler, and its message lists
the valid names so the agent can fix its own output in one turn.

## Development

```bash
bun run start   # node src/server.ts — speaks MCP over stdio
bun run test    # drives the real server over a real stdio pipe
bun run build   # tsdown → dist/
```

The tool logic lives in `src/tools.ts` and knows nothing about MCP — it's plain async functions
returning plain data, so it's testable without a transport. `src/server.ts` is the only file that
imports the SDK.

## License

MIT
