import { useCallback, useRef, useState } from 'react'
import { errMsg } from '../api'

/**
 * Runs a UI action (usually an api call) so that its failure is shown instead of lost, and so it can't be
 * started twice: `busy` is true while it runs (disable the button with it), and a second `run` meanwhile is ignored.
 * Put follow-up work that should only happen on success, like closing a dialog, inside the action.
 */
export function useAction(): { run: (action: () => Promise<unknown>) => Promise<void>; busy: boolean; error: string | null } {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // a ref, not state: a second trigger can arrive before React re-renders with busy = true
  const running = useRef(false)
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])
  return { run, busy, error }
}
