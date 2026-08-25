'use client'

import {
  DEFAULT_LIBRARY,
  formatStoryboard,
  type PartLibrary,
  parseStoryboardText,
  playableStories,
  STORIES,
  STORY_NAMES,
  type Storyboard,
  type StoryName,
  storyDuration,
  validateStory,
} from 'pixtro/core'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Free keyframing.
 *
 * The built-in storyboards are a starting point rather than a menu: pick one,
 * get its JSON, edit anything. Because the format is the same one the CLI's
 * `--story file.json` reads and the MCP server accepts, whatever you build here
 * is portable to both.
 *
 * The preview only switches to a new storyboard once it parses *and* validates,
 * so a half-typed edit never blanks the canvas — you keep seeing the last good
 * animation while the error explains what to fix.
 */
export function StoryboardEditor({
  onChange,
  initial,
  library = DEFAULT_LIBRARY,
}: {
  onChange: (story: StoryName | Storyboard, label: string) => void
  /**
   * Start from something other than the `alive` preset — a built-in name, or
   * JSON text an agent wrote. Mount with a `key` to load a new one; the editor
   * owns the text after that, so the user's edits are never clobbered.
   */
  initial?: { story: StoryName | string; label: string } | undefined
  /** Part swaps are checked against this; pass the session's library when it has custom parts. */
  library?: PartLibrary | undefined
}) {
  const [preset, setPreset] = useState<StoryName>(() =>
    initial && STORY_NAMES.includes(initial.story as StoryName)
      ? (initial.story as StoryName)
      : 'alive',
  )
  const [text, setText] = useState(() => {
    if (!initial) return formatStoryboard(STORIES.alive)
    const name = initial.story as StoryName
    return STORY_NAMES.includes(name) ? formatStoryboard(STORIES[name]) : initial.story
  })
  // Agent-authored JSON starts "dirty" so the label says where it came from.
  const [dirty, setDirty] = useState(
    () => Boolean(initial) && !STORY_NAMES.includes(initial?.story as StoryName),
  )
  const sourceLabel = initial?.label ?? 'custom'

  // Presets that swap in parts this library lacks would load JSON that only
  // shows an error. A library the agent drew from scratch has none of them.
  const presets = useMemo(() => playableStories(library), [library])

  const parsed = useMemo(() => {
    try {
      const story = parseStoryboardText(text)
      validateStory(story, library)
      return { story, error: null as string | null }
    } catch (error) {
      return { story: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [text, library])

  useEffect(() => {
    if (parsed.story) onChange(parsed.story, dirty ? sourceLabel : preset)
  }, [parsed.story, onChange, dirty, preset, sourceLabel])

  const loadPreset = useCallback((name: StoryName) => {
    setPreset(name)
    setText(formatStoryboard(STORIES[name]))
    setDirty(false)
  }, [])

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-muted">storyboard</span>
        <div className="flex flex-wrap gap-1">
          {presets.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={!dirty && name === preset}
              onClick={() => loadPreset(name)}
              className={`rounded border px-2.5 py-1 text-xs sm:py-0.5 ${
                !dirty && name === preset
                  ? 'border-ember text-ember'
                  : 'border-edge bg-panel text-muted hover:border-muted hover:text-chalk'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        {parsed.story && (
          <span className="ml-auto text-xs text-muted">
            {Math.round(storyDuration(parsed.story))}ms
            {dirty && <span className="text-ember"> · edited</span>}
          </span>
        )}
      </div>

      <textarea
        aria-label="storyboard JSON"
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value)
          setDirty(true)
        }}
        rows={14}
        className={`h-64 w-full resize-y rounded-md border bg-panel px-3 py-2 font-mono text-base leading-relaxed outline-none sm:h-auto sm:text-xs ${
          parsed.error ? 'border-red-500/60' : 'border-edge focus:border-ember'
        }`}
      />

      {parsed.error ? (
        <p role="alert" className="text-xs leading-relaxed text-red-400">
          {parsed.error}
        </p>
      ) : (
        <p className="text-xs text-muted">
          Beats play in order; tracks inside a beat run in parallel. Targets are{' '}
          <span className="text-chalk">all</span>, <span className="text-chalk">body</span>,{' '}
          <span className="text-chalk">eyes</span>, <span className="text-chalk">mouth</span>,{' '}
          <span className="text-chalk">accessory</span>. Add{' '}
          <span className="text-chalk">"ease": "easeOut"</span> — or{' '}
          <span className="text-chalk">easeIn</span>, <span className="text-chalk">easeInOut</span>,{' '}
          <span className="text-chalk">linear</span> — to slide instead of snap.
        </p>
      )}
    </section>
  )
}
