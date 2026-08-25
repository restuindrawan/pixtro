/**
 * What a non-localhost request, or a machine with no Claude login, sees.
 *
 * This is the whole app now, and it needs a logged-in Claude Code on the
 * machine serving the page — which only ever means your own. There is no
 * reduced version to fall back to.
 */
export function ChatUnavailable({ reason }: { reason: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-10 sm:px-6">
      <h1 className="text-xl font-bold tracking-tight">chat runs locally</h1>
      <p className="text-sm leading-relaxed text-muted">{reason}</p>
      <pre className="overflow-x-auto rounded-md border border-edge bg-panel px-3 py-2 text-xs text-muted">
        {`git clone https://github.com/restuindrawan/pixtro && cd pixtro\nbun install && bun run dev\nopen http://localhost:3000`}
      </pre>
      <p className="text-sm leading-relaxed text-muted">
        The engine itself needs no model at all — <span className="text-chalk">pixtro</span> on the
        command line and <span className="text-chalk">pixtro-mcp</span> for your own agent both run
        without one.
      </p>
    </main>
  )
}
