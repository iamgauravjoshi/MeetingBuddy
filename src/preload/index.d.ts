import type { RecordingState } from '@shared/types'

declare global {
  interface Window {
    mb: {
      invoke: (name: string, ...args: unknown[]) => Promise<unknown>
      applyHotkeys: () => Promise<void>
      setRecordingState: (s: RecordingState) => void
      /** Tells main the recording is saved and it can finish quitting. */
      quitReady: () => void
      on: (channel: string, cb: (...args: any[]) => void) => () => void
    }
  }
}
export {}
