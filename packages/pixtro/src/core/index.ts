/**
 * pixtro/core — the pure engine.
 *
 * Zero dependencies, no Node builtins, no DOM. Everything here runs unchanged
 * in a browser bundle, which is what keeps the web toy and avatar API options
 * open without a second implementation.
 */

export { COMPOSE_SLOTS, type ComposeOptions, compose, upscale } from './compose.ts'
export {
  createEngine,
  defaultEngine,
  type Engine,
  type Frame,
  fromPrompt,
  generate,
  paletteFor,
  type RenderOptions,
  render,
  renderStory,
} from './engine.ts'
export { type Genome, type Traits, validateGenome } from './genome.ts'
export {
  type Interpretation,
  interpret,
  type SlotMatch,
  seedFromPrompt,
  tokenize,
} from './interpret.ts'
export {
  DEFAULT_LIBRARY,
  defineLibrary,
  defineLibraryFromScratch,
  EMPTY_BASE,
  LibraryError,
  names,
  type PartLibrary,
  rollableNames,
  TRAIT_SLOTS,
  type TraitSlot,
  validateBody,
  validateLibrary,
  validatePart,
} from './library.ts'
export {
  buildPalette,
  type HSL,
  hslToRgb,
  PALETTE_NAMES,
  PALETTES,
  type PaletteName,
  type PaletteSpec,
  ramp,
} from './palette.ts'
export {
  ACCESSORIES,
  type AccessoryName,
  BODIES,
  type BodyName,
  EYES,
  type EyesName,
  MOUTHS,
  type MouthName,
} from './parts/index.ts'
export { tile, toAscii, toRGBA } from './render.ts'
export { makeRng, pick, type Rng, weightedPick } from './rng.ts'
export {
  type Beat,
  CLIP_NAMES,
  CLIPS,
  type Clip,
  type ClipName,
  type ClipRef,
  EASE_NAMES,
  type Ease,
  getClip,
  getStory,
  type Keyframe,
  playableClips,
  playableStories,
  poseAt,
  type SampledFrame,
  STORIES,
  STORY_NAMES,
  type Storyboard,
  type StoryName,
  sampleStory,
  storyDuration,
  validateStory,
} from './story.ts'
export {
  type BeatJSON,
  describeLibrary,
  formatStoryboard,
  type KeyframeJSON,
  parseStoryboard,
  parseStoryboardText,
  STORYBOARD_SCHEMA,
  type StoryboardJSON,
  StoryboardParseError,
  toStoryboardJSON,
} from './storyboard-json.ts'
export {
  type AnchorName,
  type Body,
  CANVAS,
  type Described,
  type Grid,
  type Image,
  PART_SLOTS,
  type Palette,
  type Part,
  type PartSlot,
  POSE_TARGETS,
  type Point,
  type Pose,
  type PoseSet,
  type PoseTarget,
  type RGB,
  type RGBA,
  SLOT,
  SLOT_CHARS,
  type Slot,
} from './types.ts'
