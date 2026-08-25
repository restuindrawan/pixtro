import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'pixtro — chat your way to a pixel mascot',
  description:
    'A local agent that draws and animates 32×32 pixel mascots. Runs on your own Claude Code login.',
}

/**
 * `viewportFit: 'cover'` is what puts the page under the notch and the home
 * indicator on iOS; the panes that end at the bottom edge pad themselves back
 * out with `env(safe-area-inset-bottom)`. No `maximumScale` — pinch-zoom is
 * somebody's only way to read this.
 */
export const viewport: Viewport = {
  themeColor: '#14121a',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="font-mono antialiased">{children}</body>
    </html>
  )
}
