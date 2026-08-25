#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { toGIF } from './codecs/gif.ts'
import { toPNG } from './codecs/png.ts'
import { createEngine, type Engine } from './core/engine.ts'
import type { Traits } from './core/genome.ts'
import {
  DEFAULT_LIBRARY,
  defineLibrary,
  type PartLibrary,
  TRAIT_SLOTS,
  validateLibrary,
} from './core/library.ts'
import { tile, toAscii, toRGBA } from './core/render.ts'
import { CLIP_NAMES, STORIES, STORY_NAMES, type Storyboard, type StoryName } from './core/story.ts'
import { formatStoryboard, parseStoryboardText } from './core/storyboard-json.ts'
import type { Described } from './core/types.ts'
import { termPreview } from './term.ts'

const USAGE = `
pixtro — retro pixel mascot generation engine

  pixtro gen [seed]              render one mascot
  pixtro anim [seed]             render an animated mascot
  pixtro sheet                   render a contact sheet of many mascots
  pixtro list                    show every part, palette, clip and story
  pixtro help

Options
  -o, --out <path>       write to a file
  -s, --scale <n>        integer pixel multiplier            (default: 8)
  -n, --count <n>        how many mascots to render          (default: 1, sheet: 24)
      --cols <n>         columns on a contact sheet          (default: 6)
      --ascii            print the slot grid as text instead of color
  -p, --prompt <text>    describe the mascot you want
  -l, --library <path>   load extra parts from a .ts/.js/.json file
      --story <name|path>  built-in story name, or a .json storyboard file
      --save-story <path>  write the resolved storyboard out as editable JSON
      --body <name>      override a rolled trait
      --eyes <name>
      --mouth <name>
      --accessory <name>
      --palette <name>

With no --out, the mascot is drawn straight into your terminal.

Examples
  pixtro gen dwi-01
  pixtro gen --prompt "a sleepy wizard blob"
  pixtro gen dwi-01 --palette gameboy -o mascot.png -s 12
  pixtro anim dwi-01 --story wake -o wake.gif
  pixtro anim dwi-01 --story alive --save-story mine.json   # then edit and reuse
  pixtro anim dwi-01 --story ./mine.json -o custom.gif
  pixtro sheet -n 32 -o sheet.png          # the quality gate
  pixtro gen --library ./my-parts.ts --accessory tophat
`.trimStart()

const OPTIONS = {
  out: { type: 'string', short: 'o' },
  scale: { type: 'string', short: 's' },
  count: { type: 'string', short: 'n' },
  cols: { type: 'string' },
  prompt: { type: 'string', short: 'p' },
  library: { type: 'string', short: 'l' },
  story: { type: 'string' },
  'save-story': { type: 'string' },
  ascii: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  body: { type: 'string' },
  eyes: { type: 'string' },
  mouth: { type: 'string' },
  accessory: { type: 'string' },
  palette: { type: 'string' },
} as const

type Values = Record<string, unknown>

function intOption(raw: unknown, fallback: number, label: string): number {
  if (typeof raw !== 'string') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${label} must be a positive integer, got "${raw}"`)
  }
  return value
}

/** Only pass through the trait flags that were actually supplied. */
function overridesFrom(values: Values): Partial<Traits> {
  const out: Record<string, string> = {}
  for (const slot of TRAIT_SLOTS) {
    const value = values[slot]
    if (typeof value === 'string') out[slot] = value
  }
  return out as Partial<Traits>
}

/**
 * Load a user's parts.
 *
 * A module may default-export either a whole `PartLibrary` or just the slots it
 * adds; the latter is layered onto the built-ins so "one extra hat" stays a
 * short file. JSON is accepted too, since a library is plain data.
 */
async function loadLibrary(path: string | undefined): Promise<PartLibrary> {
  if (!path) return DEFAULT_LIBRARY
  const url = pathToFileURL(resolve(path)).href
  const imported = (await import(url, {
    with: path.endsWith('.json') ? { type: 'json' } : {},
  })) as {
    default?: unknown
    library?: unknown
  }
  const value = imported.library ?? imported.default ?? imported
  if (!value || typeof value !== 'object') {
    throw new Error(`${path} did not export a library object`)
  }

  const candidate = value as Partial<PartLibrary>
  // A complete library replaces the defaults; a partial one extends them.
  const complete = TRAIT_SLOTS.every(
    (slot) => candidate[slot] && typeof candidate[slot] === 'object',
  )
  if (complete) {
    validateLibrary(candidate as PartLibrary)
    return candidate as PartLibrary
  }
  return defineLibrary(candidate)
}

const randomSeed = () => crypto.randomUUID().slice(0, 8)

async function writeOut(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
  console.log(`  ${path}`)
}

const describe = (genome: Record<string, string>): string =>
  TRAIT_SLOTS.map((slot) => genome[slot]).join('/')

async function cmdGen(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: OPTIONS, allowPositionals: true })
  const engine = createEngine(await loadLibrary(values.library))
  const scale = intOption(values.scale, 8, 'scale')
  const count = intOption(values.count, 1, 'count')
  const overrides = overridesFrom(values)

  if (values.prompt) {
    const read = engine.interpret(values.prompt)
    const genome = engine.fromPrompt(values.prompt, overrides)
    const matched = read.matches.map((m) => `${m.slot}=${m.name}`).join(' ')
    console.log(
      `\n"${values.prompt}"\n  → ${matched || 'nothing matched, rolling from the prompt'}`,
    )
    if (read.unused.length) console.log(`  ignored: ${read.unused.join(', ')}`)
    await emit(engine, genome, values, scale)
    return
  }

  const seeds =
    count > 1 || positionals.length === 0
      ? Array.from({ length: count }, (_, i) => positionals[i] ?? randomSeed())
      : [positionals[0] as string]

  for (const seed of seeds) {
    await emit(engine, engine.generate(seed, overrides), values, scale, seeds.length > 1)
  }
}

async function emit(
  engine: Engine,
  genome: ReturnType<Engine['generate']>,
  values: Values,
  scale: number,
  many = false,
): Promise<void> {
  const out = typeof values.out === 'string' ? values.out : undefined
  const grid = engine.compose(genome, { scale: out ? scale : 1 })

  if (!out) {
    console.log(`\n${genome.seed}  ${describe(genome)}`)
    console.log(values.ascii ? toAscii(grid) : termPreview(grid, engine.paletteFor(genome)))
    return
  }
  const path = many ? join(out, `${genome.seed}.png`) : out
  await writeOut(path, toPNG(toRGBA(grid, engine.paletteFor(genome))))
}

/**
 * Resolve `--story` to a storyboard: a built-in name, or a path to a JSON file.
 *
 * Only something that looks like a path is read from disk, so a typo'd built-in
 * name reports the list of names rather than a confusing file-not-found.
 */
async function loadStory(
  value: string | undefined,
): Promise<{ story: StoryName | Storyboard; label: string }> {
  const name = value ?? 'alive'
  if (STORY_NAMES.includes(name as StoryName)) return { story: name as StoryName, label: name }
  if (!/[/\\.]/.test(name)) {
    throw new Error(
      `unknown story "${name}" — expected one of: ${STORY_NAMES.join(', ')}, or a path to a .json file`,
    )
  }
  return { story: parseStoryboardText(await readFile(resolve(name), 'utf8')), label: name }
}

async function cmdAnim(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: OPTIONS, allowPositionals: true })
  const engine = createEngine(await loadLibrary(values.library))
  const { story, label } = await loadStory(values.story)

  const genome = values.prompt
    ? engine.fromPrompt(values.prompt, overridesFrom(values))
    : engine.generate(positionals[0] ?? randomSeed(), overridesFrom(values))
  const scale = intOption(values.scale, 8, 'scale')
  const frames = engine.renderStory(genome, story, { scale })

  // Dumping the resolved storyboard is what turns a built-in into a starting
  // point: render one, save it, edit the JSON, feed it back with --story.
  if (typeof values['save-story'] === 'string') {
    const path = values['save-story']
    const resolved = typeof story === 'string' ? STORIES[story] : story
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${formatStoryboard(resolved)}\n`)
    console.log(`  ${path}`)
  }

  if (!values.out) {
    const palette = engine.paletteFor(genome)
    for (const frame of engine.renderStory(genome, story)) {
      console.log(`\n${genome.seed}  ${label}  ${frame.ms}ms`)
      console.log(termPreview(frame.grid, palette))
    }
    return
  }

  await writeOut(values.out, toGIF(frames, engine.paletteFor(genome)))
  console.log(
    `  ${label}: ${frames.length} frames over ${Math.round(engine.storyDuration(story))}ms`,
  )
}

async function cmdSheet(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: OPTIONS, allowPositionals: true })
  const engine = createEngine(await loadLibrary(values.library))
  const count = intOption(values.count, 24, 'count')
  const cols = intOption(values.cols, 6, 'cols')
  const scale = intOption(values.scale, 4, 'scale')
  const overrides = overridesFrom(values)

  const seeds = Array.from({ length: count }, (_, i) => positionals[i] ?? randomSeed())
  const images = seeds.map((seed) => {
    const genome = engine.generate(seed, overrides)
    return toRGBA(engine.compose(genome, { scale }), engine.paletteFor(genome))
  })

  if (typeof values.out !== 'string') {
    console.log(seeds.join(' '))
    throw new Error('sheet needs --out (it is too wide for a terminal preview)')
  }
  await writeOut(values.out, toPNG(tile(images, cols, 2 * scale)))
  console.log(`  ${count} mascots, ${cols} columns`)
}

async function cmdList(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: OPTIONS, allowPositionals: true })
  const engine = createEngine(await loadLibrary(values.library))

  for (const slot of TRAIT_SLOTS) {
    const entries = Object.entries(engine.library[slot]).map(([name, entry]) => {
      const weight = (entry as Described).weight ?? 1
      return weight === 0 ? `${name}(override-only)` : name
    })
    console.log(`${slot.padEnd(11)} ${entries.join(', ')}`)
  }
  console.log(`${'clips'.padEnd(11)} ${CLIP_NAMES.join(', ')}`)
  console.log(`${'stories'.padEnd(11)} ${STORY_NAMES.join(', ')}`)

  const combos = TRAIT_SLOTS.reduce((total, slot) => total * engine.rollable(slot).length, 1)
  console.log(`\n${combos.toLocaleString()} distinct mascots from the seed roll`)
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case 'gen':
      return cmdGen(rest)
    case 'anim':
      return cmdAnim(rest)
    case 'sheet':
      return cmdSheet(rest)
    case 'list':
      return cmdList(rest)
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return console.log(USAGE)
    default:
      throw new Error(`unknown command "${command}" — try \`pixtro help\``)
  }
}

main().catch((error: unknown) => {
  console.error(`pixtro: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
