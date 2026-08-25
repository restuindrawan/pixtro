#!/usr/bin/env node
import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { STORY_NAMES, STORYBOARD_SCHEMA } from 'pixtro'
import {
  type AnimateInput,
  type CreateBodyInput,
  type CreatePartInput,
  createToolset,
  type MascotInput,
  type ToolResult,
} from './tools.ts'

/**
 * MCP wiring. All the behaviour lives in `tools.ts`; this file only maps it
 * onto the protocol.
 *
 * Note there is no model and no API key here. pixtro is the *tool*, not the
 * caller — whichever agent connects already has a model, so authoring an
 * animation costs pixtro nothing and needs no credentials.
 */

const POINT = {
  type: 'object',
  required: ['x', 'y'],
  properties: { x: { type: 'integer' }, y: { type: 'integer' } },
} as const

const PX = {
  type: 'array',
  minItems: 1,
  maxItems: 32,
  items: { type: 'string', maxLength: 32 },
  description:
    'Rows of pixels, one character each, top to bottom. Every row the same length. Alphabet: . o s b h S B H i w — see part_format.',
} as const

const PART_META = {
  name: { type: 'string', description: 'A short identifier. Reusing a name replaces that part.' },
  tags: {
    type: 'array',
    items: { type: 'string' },
    description: 'Words a prompt can match. Include the mood it evokes, not just what it is.',
  },
  weight: {
    type: 'number',
    minimum: 0,
    description:
      'How often the seed roll picks it. Default 1; 0 means only when asked for by name.',
  },
} as const

const MASCOT_PROPERTIES = {
  seed: {
    type: 'string',
    description:
      'Any string. The same seed always yields the same mascot. Ignored if "prompt" is given.',
  },
  prompt: {
    type: 'string',
    description:
      'Describe the mascot in words, e.g. "a sleepy wizard blob". Matched against part tags. Traits it does not mention are derived from the words as a seed.',
  },
  body: { type: 'string', description: 'Pin a specific body. See list_parts.' },
  eyes: { type: 'string', description: 'Pin specific eyes. See list_parts.' },
  mouth: { type: 'string', description: 'Pin a specific mouth. See list_parts.' },
  accessory: { type: 'string', description: 'Pin a specific accessory. See list_parts.' },
  palette: { type: 'string', description: 'Pin a specific palette. See list_parts.' },
} as const

/** Turn plain tool output into MCP content blocks. */
const toContent = (result: ToolResult) => ({
  content: [
    { type: 'text' as const, text: result.text },
    ...(result.images ?? []).map((image) => ({
      type: 'image' as const,
      data: image.data,
      mimeType: image.mimeType,
    })),
  ],
})

export type ServerOptions = {
  /**
   * Hide the built-in parts, so the connected agent has to draw its own. Set by
   * `PIXTRO_FREEHAND=1` for a stdio client that has no other way to pass a flag.
   */
  freehand?: boolean | undefined
}

export function createServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'pixtro', version: '0.1.0' })
  // One library for the life of the process: a body created by the connected
  // agent stays available to its later calls.
  const tools = createToolset({ freehand: options.freehand ?? envFreehand() })

  server.registerTool(
    'list_parts',
    {
      description:
        'List every part, palette, animation clip and built-in storyboard this pixtro library contains. Call this before pinning specific trait names.',
      inputSchema: fromJsonSchema<Record<string, never>>({ type: 'object', properties: {} }),
    },
    async () => toContent(tools.listParts()),
  )

  server.registerTool(
    'storyboard_format',
    {
      description:
        'Explain how to write a pixtro storyboard: the JSON schema, what each track target moves, which parts can be swapped in, and a worked example. Read this before calling render_animation with a custom storyboard.',
      inputSchema: fromJsonSchema<Record<string, never>>({ type: 'object', properties: {} }),
    },
    async () => toContent(tools.storyboardFormat()),
  )

  server.registerTool(
    'generate_mascot',
    {
      description:
        'Generate a 32x32 pixel mascot and return it as a PNG image. Give a prompt, a seed, explicit traits, or any combination.',
      inputSchema: fromJsonSchema<MascotInput & { scale?: number; path?: string }>({
        type: 'object',
        properties: {
          ...MASCOT_PROPERTIES,
          scale: {
            type: 'integer',
            description: 'Pixel multiplier for the returned image, 1-16. Default 8.',
          },
          path: {
            type: 'string',
            description: 'Optional file path to also save the PNG to.',
          },
        },
      }),
    },
    async (input) => toContent(await tools.generateMascot(input)),
  )

  server.registerTool(
    'render_animation',
    {
      description: [
        'Animate a mascot and return the frames as a contact-sheet PNG so the motion can be reviewed visually.',
        `Either name a built-in storyboard (${STORY_NAMES.join(', ')}) or supply a custom "storyboard" object.`,
        'Call storyboard_format first when writing a custom one. Invalid storyboards are rejected with the exact JSON path that is wrong, so the error can be acted on directly.',
      ].join(' '),
      inputSchema: fromJsonSchema<AnimateInput>({
        type: 'object',
        properties: {
          ...MASCOT_PROPERTIES,
          story: {
            type: 'string',
            enum: [...STORY_NAMES],
            description: 'Name of a built-in storyboard. Ignored if "storyboard" is given.',
          },
          storyboard: {
            ...STORYBOARD_SCHEMA,
            description:
              'A custom storyboard. See storyboard_format for the full explanation and an example.',
          },
          scale: {
            type: 'integer',
            description: 'Pixel multiplier for each frame in the contact sheet, 1-16. Default 6.',
          },
          path: {
            type: 'string',
            description: 'Optional file path to also save an animated GIF to.',
          },
        },
      }),
    },
    async (input) => toContent(await tools.renderAnimation(input)),
  )

  server.registerTool(
    'part_format',
    {
      description:
        'Explain how to draw a new body or part as pixel rows: the character alphabet, the shading rule that keeps parts looking like one family, how anchors work, and a worked example. Read this once before calling create_body or create_part.',
      inputSchema: fromJsonSchema<Record<string, never>>({ type: 'object', properties: {} }),
    },
    async () => toContent(tools.partFormat()),
  )

  server.registerTool(
    'create_body',
    {
      description: [
        'Draw a new body silhouette and add it to the library for this session, so generate_mascot and render_animation can use it by name.',
        'Use it when none of the built-in bodies fit what was asked for. Returns a render with a default face and the rows as text — look at it and revise if the shading or the face placement reads wrong.',
        'Invalid rows are rejected with the row and character that is wrong.',
      ].join(' '),
      inputSchema: fromJsonSchema<CreateBodyInput>({
        type: 'object',
        required: ['name', 'px', 'x', 'y', 'anchors'],
        properties: {
          ...PART_META,
          px: PX,
          x: {
            type: 'integer',
            minimum: 0,
            maximum: 31,
            description: 'Left edge on the 32×32 canvas.',
          },
          y: {
            type: 'integer',
            minimum: 0,
            maximum: 31,
            description: 'Top edge on the 32×32 canvas.',
          },
          anchors: {
            type: 'object',
            required: ['face', 'mouth', 'top'],
            description: 'Canvas coordinates where eyes, mouth and hats attach.',
            properties: { face: POINT, mouth: POINT, top: POINT },
          },
        },
      }),
    },
    async (input) => toContent(tools.createBody(input)),
  )

  server.registerTool(
    'create_part',
    {
      description:
        'Draw new eyes, a mouth, or an accessory and add it to the library for this session. Returns it rendered on the blob body. Read part_format first.',
      inputSchema: fromJsonSchema<CreatePartInput>({
        type: 'object',
        required: ['slot', 'name', 'px', 'anchor'],
        properties: {
          ...PART_META,
          slot: { type: 'string', enum: ['eyes', 'mouth', 'accessory'] },
          px: PX,
          anchor: {
            type: 'string',
            enum: ['face', 'mouth', 'top'],
            description:
              'Which body anchor it attaches to. Eyes → face, mouths → mouth, hats → top.',
          },
          align: {
            type: 'string',
            enum: ['top', 'bottom'],
            description: '"bottom" sits the part on the anchor from above — use it for hats.',
          },
          dx: { type: 'integer', description: 'Horizontal nudge in pixels.' },
          dy: {
            type: 'integer',
            description: 'Vertical nudge in pixels. Positive sinks a hat into the head.',
          },
        },
      }),
    },
    async (input) => toContent(tools.createPart(input)),
  )

  return server
}

/** `PIXTRO_FREEHAND=1`. An MCP client config can set an env var; it cannot pass argv. */
function envFreehand(): boolean {
  const value = process.env.PIXTRO_FREEHAND
  return value === '1' || value === 'true'
}

serveStdio(() => createServer())
