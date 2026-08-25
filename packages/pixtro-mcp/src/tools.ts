import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  type AnchorName,
  BODIES,
  type Body,
  CANVAS,
  CLIP_NAMES,
  createEngine,
  DEFAULT_LIBRARY,
  defineLibrary,
  describeLibrary,
  EMPTY_BASE,
  type Engine,
  formatStoryboard,
  type Genome,
  LibraryError,
  type Part,
  parseStoryboard,
  playableClips,
  playableStories,
  SLOT_CHARS,
  STORIES,
  STORY_NAMES,
  STORYBOARD_SCHEMA,
  type Storyboard,
  type StoryName,
  TRAIT_SLOTS,
  type TraitSlot,
  tile,
  toAscii,
  toGIF,
  toPNG,
  toRGBA,
  validateStory,
} from 'pixtro'

/**
 * Tool logic, deliberately kept free of any MCP types.
 *
 * Every function here is an ordinary async call returning plain data, so the
 * whole surface is unit-testable without a transport, a client, or a model.
 * `server.ts` is the only file that knows MCP exists.
 *
 * A toolset is bound to one library, and that library can grow: `createBody`
 * and `createPart` add to it. The stdio server keeps one toolset for the life
 * of the process; the web chat keeps one per session, so a body the agent drew
 * in turn one is still there in turn five.
 *
 * `freehand` swaps the base the additions layer onto. Off, they land on the
 * built-in set and the agent picks from a blob family it did not draw. On, they
 * land on `EMPTY_BASE` and there is nothing to pick from at all — which is the
 * only reliable way to stop a request for a character turning into the nearest
 * built-in silhouette wearing a hat.
 */

export type ToolImage = { data: string; mimeType: string }
export type ToolResult = { text: string; images?: ToolImage[] }

/** Parts added on top of the built-ins. Plain JSON, so it can live anywhere. */
export type LibraryAdditions = {
  body?: Record<string, Body>
  eyes?: Record<string, Part>
  mouth?: Record<string, Part>
  accessory?: Record<string, Part>
}

const png = (bytes: Uint8Array): ToolImage => ({
  data: Buffer.from(bytes).toString('base64'),
  mimeType: 'image/png',
})

/** How many animation frames to put in a contact sheet before truncating. */
const MAX_FILMSTRIP_FRAMES = 24

export type MascotInput = {
  seed?: string | undefined
  prompt?: string | undefined
  body?: string | undefined
  eyes?: string | undefined
  mouth?: string | undefined
  accessory?: string | undefined
  palette?: string | undefined
}

export type AnimateInput = MascotInput & {
  /** A built-in storyboard name, or an inline storyboard object. */
  story?: string | undefined
  storyboard?: unknown
  scale?: number | undefined
  path?: string | undefined
}

export type Point = { x: number; y: number }

export type CreateBodyInput = {
  name: string
  /** Rows of `SLOT_CHARS`. Width and height are taken from these. */
  px: string[]
  /** Top-left placement on the 32×32 canvas. */
  x: number
  y: number
  /** Canvas coordinates, not part-local. */
  anchors: { face: Point; mouth: Point; top: Point }
  tags?: string[] | undefined
  weight?: number | undefined
}

export type CreatePartInput = {
  slot: 'eyes' | 'mouth' | 'accessory'
  name: string
  px: string[]
  anchor: AnchorName
  align?: 'top' | 'bottom' | undefined
  dx?: number | undefined
  dy?: number | undefined
  tags?: string[] | undefined
  weight?: number | undefined
}

export type ToolsetOptions = {
  /** Parts created earlier, e.g. restored from a stored session. */
  additions?: LibraryAdditions | undefined
  /** Called with the full set of additions whenever a part is created. */
  onChange?: ((additions: LibraryAdditions) => void) | undefined
  /** Drop the built-in parts entirely: everything has to be drawn first. */
  freehand?: boolean | undefined
}

export type Toolset = ReturnType<typeof createToolset>

export function createToolset(options: ToolsetOptions = {}) {
  const freehand = options.freehand === true
  const base = freehand ? EMPTY_BASE : DEFAULT_LIBRARY
  let additions: LibraryAdditions = structuredClone(options.additions ?? {})

  // In freehand mode there is a real window with no library at all — before the
  // first body exists, `defineLibrary` refuses to build one. Holding the failure
  // rather than throwing at construction keeps `list_parts` and `part_format`
  // answerable, which are exactly the two tools an agent needs at that point.
  let engine: Engine | null = null
  let libraryError: string | null = null

  const build = () => {
    try {
      engine = createEngine(defineLibrary(additions, base))
      libraryError = null
    } catch (error) {
      engine = null
      libraryError = asMessage(error)
    }
  }
  build()

  const rebuild = () => {
    build()
    options.onChange?.(structuredClone(additions))
  }

  /**
   * The liveliest built-in storyboard this library can actually play.
   *
   * `alive` blinks, and blinking swaps in the `blink` eyes — which a library
   * built from nothing does not have. Defaulting to it blind would throw in the
   * caller's own renderer rather than here.
   */
  function defaultStory(): StoryName {
    const playable = new Set<string>(playableStories(live().library))
    return (['alive', 'idle', 'still'] as StoryName[]).find((name) => playable.has(name)) ?? 'still'
  }

  /** The engine, or an error that says what to draw first. */
  function live(): Engine {
    if (engine) return engine
    throw new Error(
      `This library has nothing in it yet (${libraryError}). Freehand mode is on, so there are no built-in parts to fall back on — read part_format, then draw a body with create_body before rendering anything.`,
    )
  }

  /**
   * `name` if the library has it, otherwise something it does have — preferring
   * a part drawn in this session over an empty placeholder. Previews name
   * built-in parts, and in freehand mode those are not there.
   */
  function preferred(slot: TraitSlot, name: string): string {
    const have = live().names(slot)
    if (have.includes(name)) return name
    const drawn = slot === 'palette' ? [] : Object.keys(additions[slot] ?? {})
    return drawn.at(-1) ?? (have[0] as string)
  }

  const describeGenome = (genome: Genome) =>
    TRAIT_SLOTS.map((slot) => `${slot}=${genome[slot]}`).join(' ')

  function overridesOf(input: MascotInput) {
    const out: Record<string, string> = {}
    for (const slot of TRAIT_SLOTS) {
      const value = input[slot]
      if (typeof value === 'string' && value) out[slot] = value
    }
    return out
  }

  /** Resolve a mascot from any combination of prompt, seed, and explicit traits. */
  function resolveGenome(input: MascotInput): { genome: Genome; how: string } {
    const overrides = overridesOf(input)
    if (input.prompt) {
      const read = live().interpret(input.prompt)
      const genome = live().fromPrompt(input.prompt, overrides)
      const matched = read.matches.map((m) => `${m.slot}=${m.name}`).join(' ')
      const ignored = read.unused.length ? `; no match for: ${read.unused.join(', ')}` : ''
      return {
        genome,
        how: `prompt "${input.prompt}" → ${matched || '(nothing matched)'}${ignored}`,
      }
    }
    const seed = input.seed || 'pixtro'
    return { genome: live().generate(seed, overrides), how: `seed "${seed}"` }
  }

  // --- read-only tools ----------------------------------------------------------

  function listParts(): ToolResult {
    // Filtered, not listed wholesale: half the built-ins swap in the `blink` or
    // `sleepy` eyes, and offering one this library cannot play is offering an
    // error. With no engine yet there is nothing playable at all.
    const clips = engine
      ? [
          `Built-in animation clips: ${playableClips(engine.library).join(', ')}`,
          `Built-in storyboards: ${playableStories(engine.library).join(', ')}`,
          ...(freehand
            ? [
                'The rest of the built-ins swap in parts this library does not have — draw eyes',
                'named "blink" and "sleepy" to unlock them, or write your own storyboard.',
              ]
            : []),
        ]
      : [
          `Built-in animation clips exist (${CLIP_NAMES.join(', ')}) but most swap in parts,`,
          'so which of them are playable depends on what you draw.',
        ]

    if (!engine) {
      return {
        text: [
          'This library is empty. Freehand mode is on: the built-in bodies, faces and',
          'accessories are not loaded, and nothing can be rendered until you draw a body.',
          '',
          'Read part_format, then call create_body. create_part adds eyes, mouths and',
          'accessories on top of it.',
          '',
          `Palettes are still built in: ${Object.keys(base.palette).join(', ')}`,
          ...clips,
        ].join('\n'),
      }
    }

    const custom = new Set(
      Object.entries(additions).flatMap(([slot, parts]) =>
        Object.keys(parts ?? {}).map((name) => `${slot}:${name}`),
      ),
    )
    const slots = TRAIT_SLOTS.map((slot) => {
      const rollable = new Set(live().rollable(slot))
      const entries = live()
        .names(slot)
        .map((name) => {
          const marks = []
          if (custom.has(`${slot}:${name}`)) marks.push('created in this session')
          if (!rollable.has(name)) marks.push('never rolled; explicit use only')
          return marks.length ? `${name} (${marks.join('; ')})` : name
        })
      return `${slot}: ${entries.join(', ')}`
    })

    const combos = TRAIT_SLOTS.reduce((total, slot) => total * live().rollable(slot).length, 1)

    return {
      text: [
        freehand
          ? 'Freehand mode: no built-in parts. Everything below was drawn in this session.'
          : 'pixtro parts and palettes:',
        ...slots.map((line) => `  ${line}`),
        '',
        ...clips,
        '',
        `${combos.toLocaleString()} distinct mascots are reachable from a seed alone.`,
        'Any trait left unspecified is derived deterministically from the seed.',
        freehand
          ? 'Anything that is not here does not exist yet — draw it with create_body or create_part.'
          : 'If no body fits what was asked for, design one with create_body.',
      ].join('\n'),
    }
  }

  function storyboardFormat(): ToolResult {
    return {
      text: [
        'A storyboard is JSON. Beats play in sequence; tracks inside a beat run in parallel.',
        '',
        describeLibrary(live().library),
        '',
        'Keyframes hold their pose until the next keyframe by default. An "ease" of',
        '"easeOut", "easeIn", "easeInOut" or "linear" tweens dx/dy between two keys',
        'instead of snapping; it has no effect on "part" or "hidden", which always snap.',
        'Prefer a curve over "linear" for anything with weight — rounding to whole',
        'pixels turns the curve into spacing, and even spacing reads as machinery.',
        '',
        'JSON Schema:',
        JSON.stringify(STORYBOARD_SCHEMA, null, 2),
        '',
        'Example (the built-in "wake" storyboard):',
        formatStoryboard(STORIES.wake),
      ].join('\n'),
    }
  }

  function partFormat(): ToolResult {
    const blob = BODIES.blob
    return {
      text: [
        'Parts are pixel art written as rows of characters. One character is one pixel.',
        '',
        'Alphabet:',
        '  .  transparent       S  accent shadow      (hats, props)',
        '  o  outline           B  accent base',
        '  s  body shadow       H  accent highlight',
        '  b  body base         i  ink  — eyes, mouths; darker than outline',
        '  h  body highlight    w  tinted white — eye shine',
        '',
        `The canvas is ${CANVAS}×${CANVAS}. A body is placed by its top-left corner (x, y) and must fit.`,
        'Every row must be the same length; width and height are taken from the rows.',
        '',
        'Shading rule — this is what makes a part look like it belongs with the others:',
        '  light comes from the UPPER LEFT. Highlights (h) hug the top-left contour in a',
        '  band 1–4 px wide, tapering toward the bottom. Shadows (s) pool along the',
        '  lower-right and along the bottom row above the outline. The base (b) fills the',
        '  rest. Use a single outline (o) around the whole silhouette; never pure black.',
        '',
        'Bodies declare three anchors in CANVAS coordinates (not row/column of the part):',
        '  face   where the eyes are centered; eyes hang down from here',
        '  mouth  where the mouth is centered',
        "  top    where hats sit; a hat's bottom edge lands here and sinks by its own dy",
        'Put `face` where the head has room for a 9–11 px wide pair of eyes, and `top` a',
        'row or two below the very top so a hat brim meets body rather than air.',
        '',
        'Drawing a character rather than a single mass — a knight, a robot, a standing cat:',
        '  give it a head, a torso, arms and legs. A body that is one blob with a themed hat',
        '  on it is the failure mode here; if the ask is a person, the silhouette has to be a',
        '  person before any accessory goes on.',
        '  Proportions: two heads tall. A 13–15 px head over a body of roughly the same',
        '  height, on a 26–27 px tall part. That is not a stylistic preference — eyes are',
        '  9–11 px wide and center on `face`, so a realistically small 8 px head physically',
        '  cannot wear the face parts. Draw narrower eyes with create_part first if you want',
        '  a lankier figure.',
        '  Materials: the body ramp (o/s/b/h) for skin, the accent ramp (S/B/H) for clothing,',
        '  armour, boots. Keeping them apart is what makes a figure read as dressed, and it',
        '  makes an accent-ramp hat or helm match the outfit in every palette for free.',
        '  Separate the arms from the torso with a column of outline, or they merge into it.',
        '',
        'Eyes, mouths and accessories are parts: rows plus an `anchor` to attach to, an',
        'optional `align` ("top" puts the part\'s top edge on the anchor, "bottom" its',
        'bottom edge — use "bottom" for hats), and dx/dy nudges. Make face parts an odd',
        'width so they center cleanly. Use S/B/H for hats so they read as a different',
        'material from the body in every palette.',
        '',
        'Give every part `tags` — they are how prompts find it — and a `weight` (default 1,',
        '0 = only used when asked for by name).',
        '',
        freehand
          ? `Example of the format — this is the "blob" body from pixtro's own set. It is not`
          : `Example: the built-in "blob" body, ${blob.w}×${blob.h} placed at (${blob.x}, ${blob.y}):`,
        ...(freehand
          ? ['available in this session; it is here to show the shape of the input.']
          : []),
        JSON.stringify(
          {
            name: 'blob',
            x: blob.x,
            y: blob.y,
            anchors: blob.anchors,
            tags: blob.tags,
            px: blob.px,
          },
          null,
          2,
        ),
        '',
        'What you get back from create_body is a render with a default face, plus the',
        'rows as text. Look at it. If the shading reads wrong or the face sits badly,',
        'adjust and call create_body again with the same name to replace it.',
      ].join('\n'),
    }
  }

  // --- rendering tools ----------------------------------------------------------

  async function generateMascot(
    input: MascotInput & { scale?: number | undefined; path?: string | undefined },
  ): Promise<ToolResult & { genome: Genome }> {
    const { genome, how } = resolveGenome(input)
    const scale = clampScale(input.scale ?? 8)
    const image = live().render(genome, { scale })

    const lines = [
      `Mascot from ${how}`,
      `Genome: seed="${genome.seed}" ${describeGenome(genome)}`,
      `Rendered at ${image.w}×${image.h} (32×32 sprite, ${scale}× nearest-neighbour).`,
    ]
    if (input.path) lines.push(`Saved to ${await writeArtifact(input.path, toPNG(image))}`)
    return { text: lines.join('\n'), images: [png(toPNG(image))], genome }
  }

  async function renderAnimation(
    input: AnimateInput,
  ): Promise<ToolResult & { genome: Genome; story: StoryName | Storyboard }> {
    const { genome, how } = resolveGenome(input)

    let story: StoryName | Storyboard
    let label: string
    if (input.storyboard !== undefined) {
      // Throws with a JSON path on bad input; that message is the repair hint.
      story = parseStoryboard(input.storyboard)
      validateStory(story, live().library)
      label = 'inline storyboard'
    } else {
      const name = (input.story ?? defaultStory()) as StoryName
      if (!STORY_NAMES.includes(name)) {
        throw new Error(`unknown story "${name}" — built-ins are: ${STORY_NAMES.join(', ')}`)
      }
      const playable = playableStories(live().library)
      if (!playable.includes(name)) {
        throw new Error(
          `built-in story "${name}" swaps in parts this library does not have. ` +
            `Playable here: ${playable.join(', ')}. Anything else needs a custom storyboard, ` +
            'or eyes drawn under the names it swaps in — see storyboard_format.',
        )
      }
      story = name
      label = `built-in "${name}"`
    }

    const scale = clampScale(input.scale ?? 6)
    const frames = live().renderStory(genome, story, { scale })

    const lines = [
      `Animation: ${label}`,
      `Mascot from ${how}`,
      `Genome: seed="${genome.seed}" ${describeGenome(genome)}`,
      `${frames.length} frames over ${Math.round(live().storyDuration(story))}ms.`,
      `Frame durations (ms): ${frames.map((f) => f.ms).join(', ')}`,
    ]
    if (input.path) {
      lines.push(
        `Saved GIF to ${await writeArtifact(input.path, toGIF(frames, live().paletteFor(genome)))}`,
      )
    }

    // A GIF is useless to a model — it cannot watch one. A contact sheet of
    // every distinct frame is what makes the motion reviewable.
    const shown = frames.slice(0, MAX_FILMSTRIP_FRAMES)
    if (shown.length < frames.length) {
      lines.push(`Contact sheet shows the first ${shown.length} of ${frames.length} frames.`)
    }
    const palette = live().paletteFor(genome)
    const sheet = tile(
      shown.map((frame) => toRGBA(frame.grid, palette)),
      Math.min(8, shown.length),
      2 * scale,
    )
    return { text: lines.join('\n'), images: [png(toPNG(sheet))], genome, story }
  }

  // --- authoring tools ----------------------------------------------------------

  /**
   * Add a body. Validation is the engine's own, so the error names the row and
   * the character; the render that comes back is for the agent's eyes.
   */
  function createBody(input: CreateBodyInput): ToolResult & { name: string; body: Body } {
    const name = cleanName(input.name)
    const px = input.px.map(String)
    const body: Body = {
      w: px[0]?.length ?? 0,
      h: px.length,
      px,
      x: Math.round(input.x),
      y: Math.round(input.y),
      anchors: {
        face: point(input.anchors?.face, 'anchors.face'),
        mouth: point(input.anchors?.mouth, 'anchors.mouth'),
        top: point(input.anchors?.top, 'anchors.top'),
      },
      tags: input.tags ?? [],
      weight: input.weight ?? 1,
    }

    // Trial-define first so a bad body never lands in the live library.
    const trial = { ...additions, body: { ...additions.body, [name]: body } }
    try {
      defineLibrary(trial, base)
    } catch (error) {
      throw new Error(`${asMessage(error)}\n\n${ALPHABET_HINT}`)
    }
    additions = trial
    rebuild()

    // Preview with a neutral face so the shading and anchors can be judged. The
    // named parts are the built-in ones; in freehand mode they do not exist, so
    // whatever this session has drawn stands in for them.
    const genome = live().generate(`preview-${name}`, {
      body: name,
      eyes: preferred('eyes', 'oval'),
      mouth: preferred('mouth', 'smile'),
      accessory: preferred('accessory', 'none'),
      palette: 'ember',
    })
    const image = live().render(genome, { scale: 6 })
    const warnings = lightingWarnings(body)

    return {
      text: [
        `Created body "${name}" (${body.w}×${body.h} at ${body.x},${body.y}). It is now available to generate_mascot and render_animation.`,
        ...(warnings.length ? ['', 'Shading notes:', ...warnings.map((w) => `  - ${w}`)] : []),
        '',
        'As authored:',
        toAscii(live().compose(genome)),
      ].join('\n'),
      images: [png(toPNG(image))],
      name,
      body,
    }
  }

  function createPart(input: CreatePartInput): ToolResult & { name: string; part: Part } {
    const slot = input.slot
    if (slot !== 'eyes' && slot !== 'mouth' && slot !== 'accessory') {
      throw new Error(`slot must be eyes, mouth or accessory, got ${JSON.stringify(slot)}`)
    }
    const name = cleanName(input.name)
    const px = input.px.map(String)
    const part: Part = {
      w: px[0]?.length ?? 0,
      h: px.length,
      px,
      anchor: input.anchor,
      ...(input.align ? { align: input.align } : {}),
      ...(input.dx !== undefined ? { dx: Math.round(input.dx) } : {}),
      ...(input.dy !== undefined ? { dy: Math.round(input.dy) } : {}),
      tags: input.tags ?? [],
      weight: input.weight ?? 1,
    }

    const trial = { ...additions, [slot]: { ...additions[slot], [name]: part } }
    try {
      defineLibrary(trial, base)
    } catch (error) {
      throw new Error(`${asMessage(error)}\n\n${ALPHABET_HINT}`)
    }
    additions = trial
    rebuild()

    const genome = live().generate(`preview-${slot}-${name}`, {
      body: preferred('body', 'blob'),
      eyes: slot === 'eyes' ? name : preferred('eyes', 'oval'),
      mouth: slot === 'mouth' ? name : preferred('mouth', 'none'),
      accessory: slot === 'accessory' ? name : preferred('accessory', 'none'),
      palette: 'ember',
    })
    const image = live().render(genome, { scale: 6 })

    return {
      text: [
        `Created ${slot} "${name}" (${part.w}×${part.h}). It is now available by name, and to prompts through its tags.`,
        '',
        `On the "${genome.body}" body:`,
        toAscii(live().compose(genome)),
      ].join('\n'),
      images: [png(toPNG(image))],
      name,
      part,
    }
  }

  return {
    get engine() {
      return live()
    },
    get library() {
      return live().library
    },
    /** True when the built-ins are switched off and only drawn parts exist. */
    get freehand() {
      return freehand
    },
    /** False in freehand mode until the first body is drawn. */
    get ready() {
      return engine !== null
    },
    get additions(): LibraryAdditions {
      return structuredClone(additions)
    },
    resolveGenome,
    defaultStory,
    listParts,
    storyboardFormat,
    partFormat,
    generateMascot,
    renderAnimation,
    createBody,
    createPart,
  }
}

// --- helpers ----------------------------------------------------------------------

const ALPHABET_HINT = `Allowed characters are ${SLOT_CHARS} — call part_format for what each one means.`

function cleanName(raw: unknown): string {
  const name = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!name) throw new Error('name must contain at least one letter or digit')
  if (name.length > 32) throw new Error('name must be 32 characters or fewer')
  return name
}

function point(value: Point | undefined, where: string): Point {
  if (!value || typeof value.x !== 'number' || typeof value.y !== 'number') {
    throw new Error(`${where} must be { x, y } in canvas coordinates`)
  }
  return { x: Math.round(value.x), y: Math.round(value.y) }
}

const asMessage = (error: unknown) =>
  error instanceof LibraryError || error instanceof Error ? error.message : String(error)

/**
 * Soft checks on the light direction. These are notes, not errors: a body that
 * breaks the rule still renders, it just will not match the rest of the set,
 * and the agent should hear that while it still has the rows in hand.
 */
function lightingWarnings(body: Body): string[] {
  const warnings: string[] = []
  const centroid = (char: string) => {
    let n = 0
    let sx = 0
    let sy = 0
    body.px.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === char) {
          n++
          sx += x
          sy += y
        }
      }
    })
    return n ? { n, x: sx / n, y: sy / n } : null
  }
  const h = centroid('h')
  const s = centroid('s')
  const o = centroid('o')
  const filled = body.px.join('').replace(/\./g, '').length

  if (!h) warnings.push('no highlight (h) pixels — add a band along the top-left contour')
  if (!s) warnings.push('no shadow (s) pixels — pool some along the lower-right and bottom')
  if (h && s && !(h.x < s.x && h.y < s.y)) {
    warnings.push(
      'highlights are not up-left of shadows — light should come from the upper left like every other body',
    )
  }
  if (!o)
    warnings.push('no outline (o) — every body has a single-pixel outline around its silhouette')
  if (h && h.n > filled * 0.45)
    warnings.push('highlight covers most of the body — it should be a band, not a fill')
  return warnings
}

async function writeArtifact(path: string, bytes: Uint8Array): Promise<string> {
  const full = resolve(path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, bytes)
  return full
}

function clampScale(scale: number): number {
  const n = Math.round(scale)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 16)
}

// --- default toolset, for the stdio server and anyone who wants the plain functions ---

const defaults = createToolset()

export const resolveGenome = defaults.resolveGenome
export const listParts = defaults.listParts
export const storyboardFormat = defaults.storyboardFormat
export const partFormat = defaults.partFormat
export const generateMascot = defaults.generateMascot
export const renderAnimation = defaults.renderAnimation
export const createBody = defaults.createBody
export const createPart = defaults.createPart
export { DEFAULT_LIBRARY }
