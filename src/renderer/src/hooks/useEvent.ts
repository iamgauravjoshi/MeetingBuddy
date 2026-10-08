import { useEffect } from 'react'
import type { MainEvents } from '@shared/types'

/** Subscribes to a main-process event for the lifetime of the component. */
export function useEvent<K extends keyof MainEvents>(channel: K, cb: (...args: MainEvents[K]) => void, deps: unknown[] = []): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caller lists what `cb` depends on in `deps`
  useEffect(() => window.mb.on(channel, cb), deps)
}
