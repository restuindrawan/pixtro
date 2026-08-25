import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { parseStoryboard, STORY_NAMES, STORYBOARD_SCHEMA, toStoryboardJSON } from 'pixtro'
import {
  type AnimateInput,
  type CreateBodyInput,
  type CreatePartInput,
  createToolset,
  type LibraryAdditions,
  type MascotInput,
  type ToolResult,
} from 'pixtro-mcp/tools'
import { z } from 'zod'
import type { Artifact } from './types'

/**
 * The same tools the stdio MCP server exposes, adapted for the Agent SDK's
 * in-process MCP. One implementation (`pixtro-mcp/tools`), two transports.
 *
 * Two things this transport adds:
 *
 * - The artifact side-channel. The model gets the image back in the tool
 *   result, as it must, so it can review what it made. But the UI has
 *   `pixtro/core` and redraws from data: the resolved genome, the storyboard,
 *   and any parts the agent created that the genome depends on.
 * - A per-session library. `createToolset` is bound to the session's parts,
 *   and `onChange` writes them back, so a body drawn in one turn is there in
 *   the next. In freehand mode that library is the *whole* library — the
 *   built-ins are not underneath it — which the artifact has to say so the
 *   canvas composes it the same way.
 */

export const MCP_NAME = 'pixtro'

/**
 * The MCP result type, taken from the SDK's own `tool()` signature. It lives in
 * `@modelcontextprotocol/sdk` (v1), which is the Agent SDK's peer dependency —
 * this app should not have to depend on it directly just for one type.
 */
type CallToolResult = Awaited<ReturnType<Parameters<typeof tool>[3]>>

const TOOL_NAMES = [
  'list_parts',
  'storyboard_format',
  'part_format',
  'generate_mascot',
  'render_animation',
  'create_body',
  'create_part',
] as const

/** The fully qualified names the CLI uses. Must match exactly or the agent cannot call them. */
export const ALLOWED_TOOLS = TOOL_NAMES.map((name) => `mcp__${MCP_NAME}__${name}`)

const toContent = (result: ToolResult): CallToolResult => ({
  content: [
    { type: 'text', text: result.text },
    ...(result.images ?? []).map((image) => ({
      type: 'image' as const,
      data: image.data,
      mimeType: image.mimeType,
    })),
  ],
})

const failure = (error: unknown): CallToolResult => ({
  content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  isError: true,
})

const mascotShape = {
  seed: z
    .string()
    .optional()
    .describe('Any string. Same seed, same mascot. Ignored if "prompt" is given.'),
  prompt: z
    .string()
    .optional()
    .describe('Describe the mascot, e.g. "a sleepy wizard blob". Matched against part tags.'),
  body: z.string().optional().describe('Pin a specific body. See list_parts.'),
  eyes: z.string().optional().describe('Pin specific eyes. See list_parts.'),
  mouth: z.string().optional().describe('Pin a specific mouth. See list_parts.'),
  accessory: z.string().optional().describe('Pin a specific accessory. See list_parts.'),
  palette: z.string().optional().describe('Pin a specific palette. See list_parts.'),
}

/**
 * The storyboard schema is authored once as JSON Schema in `pixtro` (it is what
 * the stdio server and the docs use). zod 4 can consume it directly, so the
 * agent sees the identical contract here.
 */
const storyboardSchema = z.fromJSONSchema(STORYBOARD_SCHEMA as never)

const point = z.object({ x: z.number().int(), y: z.number().int() })

const px = z
  .array(z.string().max(32))
  .min(1)
  .max(32)
  .describe(
    'Rows of pixels, one character each, top to bottom. Every row the same length. Alphabet: . o s b h S B H i w — see part_format.',
  )

const partMeta = {
  name: z.string().describe('A short identifier. Reusing a name replaces that part.'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Words a prompt can match. Include the mood it evokes, not just what it is.'),
  weight: z
    .number()
    .min(0)
    .optional()
    .describe('How often the seed roll picks it. Default 1; 0 means only when asked for by name.'),
}

export type ToolHooks = {
  onArtifact: (artifact: Artifact) => void
  onParts: (parts: LibraryAdditions) => void
  /** Parts created earlier in this session. */
  parts: LibraryAdditions
  /** Hide the built-in parts, so the agent has to draw everything. */
  freehand?: boolean | undefined
}

export function createPixtroTools(hooks: ToolHooks) {
  const freehand = hooks.freehand === true
  const toolset = createToolset({
    additions: hooks.parts,
    onChange: hooks.onParts,
    freehand,
  })

  // Every artifact carries the parts it may depend on, so the browser can draw
  // a body it has never seen. Built-ins-only artifacts omit the field — but in
  // freehand mode there is no built-in layer underneath, so the parts always
  // travel and the flag says how to compose them.
  const artifact = (fields: Omit<Artifact, 'parts' | 'freehand'>): Artifact => {
    const parts = toolset.additions
    const hasCustom = Object.values(parts).some((slot) => slot && Object.keys(slot).length > 0)
    if (freehand) return { ...fields, parts, freehand: true }
    return hasCustom ? { ...fields, parts } : fields
  }

  return [
    tool(
      'list_parts',
      freehand
        ? 'List what this chat can draw with. Freehand mode is on: nothing is built in except palettes, so this is exactly the set of parts created in this chat.'
        : 'List every part, palette, animation clip and built-in storyboard this library contains, including any created in this chat. Call this before pinning specific trait names.',
      {},
      async () => toContent(toolset.listParts()),
    ),

    tool(
      'storyboard_format',
      'Explain how to write a pixtro storyboard: the JSON schema, what each track target moves, which parts can be swapped in, and a worked example. Read this once before writing a custom storyboard.',
      {},
      async () => toContent(toolset.storyboardFormat()),
    ),

    tool(
      'part_format',
      'Explain how to draw a new body or part as pixel rows: the character alphabet, the shading rule that keeps parts looking like one family, how anchors work, and a worked example. Read this once before create_body or create_part.',
      {},
      async () => toContent(toolset.partFormat()),
    ),

    tool(
      'generate_mascot',
      'Generate a 32x32 pixel mascot and return it as a PNG so you can look at it. Give a prompt, a seed, explicit traits, or any combination. The user sees the result live in their studio panel.',
      {
        ...mascotShape,
        scale: z.number().int().min(1).max(16).optional().describe('Pixel multiplier. Default 8.'),
      },
      async (input) => {
        try {
          const result = await toolset.generateMascot(input as MascotInput)
          // Not a hardcoded 'alive': that one blinks, and a freehand library has
          // no `blink` eyes to swap in — the studio panel would throw on it.
          hooks.onArtifact(
            artifact({ genome: result.genome, story: toolset.defaultStory(), label: 'mascot' }),
          )
          return toContent(result)
        } catch (error) {
          return failure(error)
        }
      },
    ),

    tool(
      'render_animation',
      [
        'Animate a mascot and return its frames as a contact-sheet PNG so you can review the motion.',
        `Either name a built-in storyboard (${STORY_NAMES.join(', ')}) or supply a custom "storyboard".`,
        'Invalid storyboards are rejected with the exact path that is wrong; fix it and call again.',
        'The user sees the animation playing live in their studio panel, with your storyboard loaded into their editor.',
      ].join(' '),
      {
        ...mascotShape,
        story: z
          .enum(STORY_NAMES as unknown as [string, ...string[]])
          .optional()
          .describe('A built-in storyboard. Ignored if "storyboard" is given.'),
        storyboard: storyboardSchema
          .optional()
          .describe('A custom storyboard. See storyboard_format.'),
        scale: z
          .number()
          .int()
          .min(1)
          .max(16)
          .optional()
          .describe('Per-frame pixel multiplier. Default 6.'),
      },
      async (input) => {
        try {
          const result = await toolset.renderAnimation(input as AnimateInput)
          const raw = (input as AnimateInput).storyboard
          const story =
            raw !== undefined
              ? toStoryboardJSON(parseStoryboard(raw))
              : ((input as AnimateInput).story ?? toolset.defaultStory())
          hooks.onArtifact(
            artifact({
              genome: result.genome,
              story,
              label: raw !== undefined ? 'custom' : String(story),
            }),
          )
          return toContent(result)
        } catch (error) {
          return failure(error)
        }
      },
    ),

    tool(
      'create_body',
      [
        "Draw a new body silhouette and add it to this chat's library, so generate_mascot and render_animation can use it by name.",
        freehand
          ? 'Freehand mode is on: there are no built-in bodies, so nothing renders until you call this.'
          : 'Use it when none of the built-in bodies fit what was asked for — a person, a mushroom, a star, a fish, anything. Read part_format first.',
        'Returns a render with a default face plus the rows as text. Look at it and revise with the same name if the shading or face placement reads wrong.',
      ].join(' '),
      {
        ...partMeta,
        px,
        x: z.number().int().min(0).max(31).describe('Left edge on the 32×32 canvas.'),
        y: z.number().int().min(0).max(31).describe('Top edge on the 32×32 canvas.'),
        anchors: z
          .object({ face: point, mouth: point, top: point })
          .describe('Canvas coordinates where eyes, mouth and hats attach.'),
      },
      async (input) => {
        try {
          const result = toolset.createBody(input as CreateBodyInput)
          // Show the new body straight away, wearing the same preview face the
          // agent is looking at.
          const genome = toolset.engine.generate(`preview-${result.name}`, {
            body: result.name,
            eyes: 'oval',
            mouth: 'smile',
            accessory: 'none',
            palette: 'ember',
          })
          hooks.onArtifact(artifact({ genome, story: 'idle', label: 'new body' }))
          return toContent(result)
        } catch (error) {
          return failure(error)
        }
      },
    ),

    tool(
      'create_part',
      "Draw new eyes, a mouth, or an accessory and add it to this chat's library. Returns it rendered on the blob body. Read part_format first.",
      {
        ...partMeta,
        slot: z.enum(['eyes', 'mouth', 'accessory']),
        px,
        anchor: z
          .enum(['face', 'mouth', 'top'])
          .describe('Which body anchor it attaches to. Eyes → face, mouths → mouth, hats → top.'),
        align: z
          .enum(['top', 'bottom'])
          .optional()
          .describe('"bottom" sits the part on the anchor from above — use it for hats.'),
        dx: z.number().int().optional().describe('Horizontal nudge in pixels.'),
        dy: z
          .number()
          .int()
          .optional()
          .describe('Vertical nudge in pixels. Positive sinks a hat into the head.'),
      },
      async (input) => {
        try {
          return toContent(toolset.createPart(input as CreatePartInput))
        } catch (error) {
          return failure(error)
        }
      },
    ),
  ]
}

export function createPixtroMcp(hooks: ToolHooks) {
  return createSdkMcpServer({ name: MCP_NAME, version: '0.1.0', tools: createPixtroTools(hooks) })
}
