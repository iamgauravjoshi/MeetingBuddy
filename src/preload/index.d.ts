import type { MainEvents, RecordingState } from '@shared/types'

declare global {
  interface Window {
    mb: {
      invoke: (name: string, ...args: unknown[]) => Promise<unknown>
      applyHotkeys: () => Promise<void>
      setRecordingState: (s: RecordingState) => void
      /** Tells main the recording is saved and it can finish quitting. */
      quitReady: () => void
      on: <K extends keyof MainEvents>(channel: K, cb: (...args: MainEvents[K]) => void) => () => void
    }
  }
}
export {}
