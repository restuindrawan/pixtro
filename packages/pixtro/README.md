# pixtro

Retro pixel mascot generation engine. Deterministic, seed-driven, hand-authored parts.

A seed string goes in, a 32×32 sprite comes out. The same seed always produces the same
mascot, so seeds are shareable and results are reproducible.

```
pixtro gen dwi-01
pixtro gen --prompt "a sleepy wizard blob"
pixtro anim dwi-01 --story wake -o wake.gif
pixtro anim dwi-01 --story ./my-story.json -o custom.gif
pixtro sheet -n 32 -o sheet.png
```

## Why it works this way

**It's a constraint system, not an image generator.** At 32×32 with ten palette slots, every
pixel is a deliberate decision. Diffusion models produce blurry, non-grid-aligned mush at this
resolution. Composing hand-authored parts gives you unlimited variation where every single
result stays on-model.

**Parts are indexed, never colored.** A part stores palette *slot* indices, not RGB. Palette is
applied at the very last step, so every part works with every palette for free — no re-authoring,
no tinting hacks, and recoloring provably cannot change the shape.

**Parts are plain text.** They diff in a pull request, review like code, need no build step, no
binary assets, and no asset loader. You can author a new eye variant in thirty seconds.

## The part format

```ts
export const eyes_sleepy: Part = {
  anchor: 'face',
  w: 11,
  h: 2,
  dy: 1,
  px: [
    'iii.....iii',
    '.i.......i.',
  ],
}
```

| char | slot | | char | slot |
|---|---|---|---|---|
| `.` | transparent | | `S` | accent shadow |
| `o` | outline | | `B` | accent base |
| `s` | body shadow | | `H` | accent highlight |
| `b` | body base | | `i` | ink (facial features) |
| `h` | body highlight | | `w` | tinted white |

Light comes from the upper left in every body, so highlights hug the top-left curve and shadows
pool along the lower right. Keep that consistent or the set stops looking like one family.

Bodies declare **anchors** (`face`, `mouth`, `top`) in canvas coordinates. Parts attach to an
anchor rather than to absolute positions, so a 3px halo and a 6px antenna both sit correctly on
the same head without either part knowing the body's dimensions.

Most bodies are one closed mass. `hero` is the exception — a chibi figure with a head, torso,
arms and legs — and it is drawn on **both** ramps: the head is skin on `o/s/b/h`, everything
below the chin is clothing on `S/B/H`. That is what makes it read as dressed, and it is why an
accent-ramp `helm` or `crown` matches its outfit in every palette. Its proportions are set by a
hard constraint rather than taste: face parts are 9–11px wide and center on `face`, so a head
under ~13px cannot wear them. Two heads tall is the smallest figure the existing face set fits.

## Palettes

Generated palettes usually look cheap because `lerp(color, black)` produces muddy shadows. pixtro
instead rotates **shadows toward a cool anchor (265°) and highlights toward a warm one (50°)**,
always taking the shorter way around the wheel. That's direction-agnostic, so green shadows go
teal and red shadows go magenta with no special cases — and it's the single rule that makes a
generated ramp read as hand-picked.

Seven generated palettes plus a fixed four-tone Game Boy set. Add one by appending to `PALETTES`,
or ship your own in a runtime library.

## Prompts

```
pixtro gen --prompt "a sleepy wizard blob"
  → body=blob eyes=sleepy accessory=hat palette=dusk
```

Every part and palette carries `tags`, and a prompt is scored against them. No model call: the
decision a prompt actually has to make here is "pick one of four eyes", and a lexicon does that
offline, instantly, deterministically, and with no API key.

The important property is that **it extends itself**. Tags live on the part, so a part you supply
at runtime is promptable the moment you add it — nothing central needs editing.

A prompt *narrows* a mascot rather than fully specifying one. Slots it doesn't mention are rolled
from a seed derived from the prompt itself, so the same words always give the same mascot.

```ts
engine.interpret('a sleepy wizard blob')
// { traits: { body: 'blob', eyes: 'sleepy', accessory: 'hat', palette: 'dusk' },
//   matches: [...], unused: [] }
```

`unused` lists only words that matched *nothing anywhere* — a word whose part lost a tie was still
understood, and saying otherwise sends you rewording a prompt that already worked.

## Bring your own parts

A library is plain data, and it's swappable at runtime:

```ts
import { createEngine, defineLibrary } from 'pixtro/core'

const engine = createEngine(defineLibrary({
  accessory: {
    tophat: {
      tags: ['tophat', 'formal', 'dapper'],   // now reachable from a prompt
      weight: 2,                              // and from the seed roll
      anchor: 'top', align: 'bottom', dy: 2,
      w: 13, h: 6,
      px: ['....ooooo....', /* ... */],
    },
  },
}))
```

`defineLibrary` layers your slots over the built-ins, so "one extra hat" is a short file rather
than a fork of the whole default set. Pass a complete library to replace them outright.

From the CLI, `--library` takes a `.ts`, `.js` or `.json` file — see
[`examples/my-parts.ts`](examples/my-parts.ts):

```
pixtro gen --library ./examples/my-parts.ts --prompt "a dapper angry ghost"
```

Everything is validated on load, and failures name the part and the row — `accessory "tophat": row
3 is 11 characters, expected w=13`. Bad input is expected here rather than exceptional, and a
thrown error is far easier to diagnose than a silent misdraw.

Prefer `createEngine(library)` over passing a library to each call: forgetting it in one place
would quietly mix a custom genome with the default parts, and that failure surfaces as a wrong
picture rather than an error.

## Storyboards

Three layers, smallest to largest:

| | |
|---|---|
| **Keyframe** | a pose for one target at one moment |
| **Clip** | parallel tracks over a fixed duration — "bob while blinking" |
| **Storyboard** | beats played in sequence — "sleep, then stir, then bounce" |

Tracks run in parallel, beats run in series. That split is what lets you *story* an animation:
author small reusable clips, then arrange them.

```ts
const wake = {
  beats: [
    { clip: 'sleeping' },
    { clip: 'stir' },
    { clip: 'bounce', repeat: 2 },
    { clip: ['bob', 'blinkTwice'], hold: 300 },   // an array layers clips together
  ],
}
engine.renderStory(genome, wake, { scale: 8 })    // → [{ grid, ms }, ...]
```

A track targets `all` (the whole sprite) or one slot, and a keyframe can offset it (`dx`/`dy`),
swap the part shown (`part: 'blink'`), or hide it. `ease` defaults to `hold` — stepped, which is
what a part swap wants, since there is no such thing as half a sprite swap. `linear`, `easeIn`,
`easeOut` and `easeInOut` tween `dx`/`dy` and round to whole pixels.

Reach for a curve over `linear` for anything with weight. Rounding turns the curve into *spacing*:
a three-pixel `easeOut` puts two pixels down almost at once and takes its time over the last,
which is what a hand animator would have drawn. Equal spacing is the thing that reads as
machinery.

**Sampling is event-driven, not fixed-rate.** Frames are taken at every moment something *could*
change — keyframe times, beat boundaries, plus a ~33fps walk through tweened spans only — and runs
of identical poses collapse into one longer frame. A two-second hold costs one frame, not sixty,
which is what keeps exported GIFs small. `renderStory` then drops any frame that composes to the
same pixels as the one before it, which is how a mascot with no hat pays nothing for a clip that
lags one.

Frame boundaries are snapped to 10ms and no frame is shorter than 20ms, because a GIF delay is
written in hundredths of a second and decoders clamp anything under two of them up to a tenth.

Built-in clips: `bob`, `bounce`, `blinkTwice`, `sleeping`, `stir`, `look`, `nod`, `riseUp`.
Built-in stories: `still`, `idle`, `blink`, `alive`, `wake`, `curious`, `entrance`.

### Storyboards are files

The built-ins are a starting point, not a menu. Dump one, edit it, feed it back:

```bash
pixtro anim dwi-01 --story wake --save-story mine.json
pixtro anim dwi-01 --story ./mine.json -o custom.gif
```

The on-disk format is deliberately flatter than the in-memory type — a beat has an optional list
of built-in `clips` to layer and an optional set of inline `tracks`:

```json
{
  "beats": [
    { "duration": 700, "tracks": {
        "all": [{ "at": 0, "dy": 34 }, { "at": 500, "dy": 0, "ease": "easeOut" }]
    }},
    { "clips": ["bounce"], "repeat": 2 },
    { "clips": ["bob", "blinkTwice"], "hold": 400 }
  ]
}
```

Every field is a plain scalar, array, or object — no unions. The in-memory type allows `clip` to be
a string *or* an inline clip *or* an array of either, which is pleasant in TypeScript and miserable
in a JSON Schema, where it needs `oneOf` and both models and hand-editors get it wrong.

See [`examples/my-story.json`](examples/my-story.json). `parseStoryboard` is the single gate for
anything that did not come from source, and it reports a JSON path
(`beats[1].tracks.eyes[0].ease`) so the message is actionable by whoever — or whatever — has to
fix it. Unknown top-level keys are ignored, so a `_comment` field is fine.

Storyboards are plain JSON-serializable data, so they can live in a file, ship over the wire, or
be built in a UI — the same reason parts are authored as text.

## API

```ts
import { defaultEngine, generate, render, toPNG } from 'pixtro'

const mascot = generate('dwi-01')                            // → Genome
const image = render(mascot, { scale: 8 })                   // → { w, h, data }
const png = toPNG(image)                                     // → Uint8Array

generate('dwi-01', { eyes: 'sparkle', palette: 'gameboy' })  // override rolled traits
defaultEngine.fromPrompt('a sleepy wizard blob')             // → Genome
```

`generate` is total and deterministic: any string works, and overriding one trait leaves the
others untouched — `--palette moss` recolors a mascot rather than replacing it. Unknown trait
names throw rather than rendering a hole in the sprite.

```ts
import { compose, toAscii } from 'pixtro/core'  // zero dependencies, browser-safe
```

`pixtro/core` has no dependencies and no Node builtins, so it drops into a browser bundle
untouched. Only the codecs pull anything in.

## CLI

| command | what it does |
|---|---|
| `gen [seed]` | one mascot; with no `--out` it draws in your terminal |
| `anim [seed]` | animated GIF — `--story <name\|file.json>`, `--save-story <path>` |
| `sheet` | contact sheet of many mascots on one image |
| `list` | every part, palette, clip and story, plus the combination count |

`--prompt` and `--library` work on all of them.

`sheet` is the quality gate. With a small library you can put a large share of the whole output
space on one image — if any cell looks wrong, you fix the part, not the generator.

## Adding a part

1. Add it to `src/core/parts/{bodies,faces,accessories}.ts`.
2. Add a weight in `WEIGHTS` in `src/core/genome.ts` (leave it out to make it override-only, the
   way `blink` eyes are).
3. `pixtro sheet -n 32 -o sheet.png` and look at it.

`bun run test` catches short rows, wrong declared widths, and stray characters before they reach a
render.

## Development

Run these from this directory, or from the repo root with `bun run --filter pixtro <script>`.

```
bun run cli gen dwi-01   # node src/cli.ts — Node 24 strips types, so no build step
bun run dev              # tsdown --watch, for the web app to consume
bun run test             # vitest
bun run build            # tsdown → dist/
```

Formatting and linting are workspace-wide: `bun run check` at the repo root.

Requires Node 22+. Node's type stripping can't do runtime codegen, so **no `enum`, no decorators,
no parameter properties** — `tsconfig.json` sets `erasableSyntaxOnly` to enforce that. Use
`as const` objects and union types instead.

## Tests are text

Because parts are authored as text and the composer outputs text, art regressions show up as a
readable diff:

```
- .....ohhhhbbbbbbbbbbbbbssso.....
+ .....ohhhbbbbbbbbbbbbbbssso.....
```

No image-diff tooling, no binary fixtures in git, no perceptual threshold to tune.

## Roadmap

- More parts — the library is deliberately small at v1; every combination has been eyeballed
- `prompt → genome` mapping, so "a sleepy wizard blob" picks traits and the deterministic
  renderer still draws it (the right place for a model, unlike `prompt → pixels`)
- Web toy and avatar API, both on top of the unchanged `pixtro/core`

## License

MIT
