import { MonitorX } from 'lucide-react'
import { EmptyState } from './components/ui'

/** `window.mb` comes from the Electron preload; a plain browser tab (e.g. the Vite dev URL) doesn't have it. */
export const hasBridge = (): boolean => typeof window !== 'undefined' && window.mb !== undefined

/** Shown instead of the app when the page is opened outside MeetingBuddy's own window. */
export function NoBridge() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <EmptyState icon={MonitorX} title="MeetingBuddy runs in its desktop window">
        This page needs the desktop app to record, transcribe and store meetings, so it can't work in a browser tab. Start the app with{' '}
        <code>npm run dev</code> and use the window that opens.
      </EmptyState>
    </main>
  )
}
