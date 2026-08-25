'use client'

import {
  createEngine,
  defaultEngine,
  defineLibrary,
  EMPTY_BASE,
  type Storyboard,
  type StoryName,
  TRAIT_SLOTS,
} from 'pixtro/core'
import { useCallback, useMemo, useState, useTransition } from 'react'
import type { Artifact } from '@/lib/chat/types'
import { downloadGIF, downloadPNG } from '@/lib/download'
import { MascotCanvas } from '../mascot-canvas'
import { StoryboardEditor } from '../storyboard-editor'

/**
 * The studio panel: whatever the agent rendered last, drawn live.
 *
 * Nothing here is an image the server sent. The artifact is a genome plus a
 * storyboard, and `pixtro/core` redraws it client-side — so it animates, it
 * scales, and the agent's storyboard lands in an editor the user can tweak.
 * Tool *inputs* driving the UI, rather than tool outputs.
 */
export function ChatCanvas({
  artifact,
  artifactKey,
}: {
  artifact: Artifact | null
  artifactKey: string
}) {
  // `still` rather than `alive`: this only holds for the tick before the editor
  // reports the artifact's own storyboard, and `alive` blinks — which a library
  // drawn from scratch has no `blink` eyes for.
  const [story, setStory] = useState<StoryName | Storyboard>('still')
  const [storyLabel, setStoryLabel] = useState('still')
  const [exporting, startExport] = useTransition()

  const onStoryChange = useCallback((next: StoryName | Storyboard, label: string) => {
    setStory(next)
    setStoryLabel(label)
  }, [])

  // A body the agent drew exists nowhere but in the artifact, so the engine
  // that draws it is built right here from the parts the artifact carries —
  // over the built-ins normally, over nothing at all when the chat is freehand,
  // which is the base the server composed it against.
  const engine = useMemo(() => {
    if (!artifact?.parts) return defaultEngine
    return createEngine(defineLibrary(artifact.parts, artifact.freehand ? EMPTY_BASE : undefined))
  }, [artifact?.parts, artifact?.freehand])

  if (!artifact) {
    return (
      <div className="checkerboard flex h-full min-h-56 items-center justify-center rounded-xl border border-edge p-6 text-center text-sm text-muted sm:min-h-80 sm:p-8">
        Ask for a mascot and it shows up here.
      </div>
    )
  }

  const { genome } = artifact
  // Worth saying out loud: this mascot is wearing something that exists nowhere
  // but in this conversation, and will not survive a server restart.
  const usesCustomPart = TRAIT_SLOTS.some(
    (slot) => !defaultEngine.names(slot).includes(genome[slot]),
  )

  const initial =
    typeof artifact.story === 'string'
      ? { story: artifact.story, label: artifact.story }
      : { story: JSON.stringify(artifact.story, null, 2), label: 'agent' }

  return (
    <div className="flex flex-col gap-4">
      <section className="checkerboard flex min-h-56 items-center justify-center rounded-xl border border-edge p-4 sm:min-h-64 sm:p-6">
        <MascotCanvas genome={genome} scale={8} story={story} engine={engine} />
      </section>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {TRAIT_SLOTS.map((slot) => (
          <span key={slot} className="rounded border border-edge bg-panel px-1.5 py-0.5">
            {slot} <span className="text-chalk">{genome[slot]}</span>
          </span>
        ))}
        {usesCustomPart && <span className="ml-auto text-ember">drawn in this chat</span>}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={exporting}
          onClick={() => startExport(async () => await downloadPNG(genome, 8, engine))}
          className="flex-1 rounded-md bg-ember py-2 text-sm font-bold text-ink disabled:opacity-50"
        >
          PNG
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={() =>
            startExport(async () => await downloadGIF(genome, 8, story, storyLabel, engine))
          }
          className="flex-1 rounded-md border border-edge bg-panel py-2 text-sm hover:border-ember disabled:opacity-50"
        >
          GIF
        </button>
      </div>

      {/* Keyed on the artifact so a new render reloads the editor, while edits
          to the current one are never overwritten. */}
      <StoryboardEditor
        key={artifactKey}
        initial={initial}
        library={engine.library}
        onChange={onStoryChange}
      />
    </div>
  )
}
