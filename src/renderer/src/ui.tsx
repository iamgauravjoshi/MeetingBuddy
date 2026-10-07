import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { MainEvents } from '@shared/types'
import { errMsg } from './api'

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

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row">
          <h2 className="grow">{title}</h2>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        {children}
        {footer && <div className="row" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}

/**
 * Props that make a clickable card, row or quote work like a button for keyboard and screen-reader users:
 * it can be tabbed to, is announced as a button, and Enter or Space activates it.
 */
export function clickable(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault() // Space would otherwise scroll the page
      onActivate()
    }
  }
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="error">{error}</div> : null
}

export { fmtTime } from '@shared/format'

export const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Re-renders every `ms` milliseconds (for timers). */
export function useTick(ms: number, enabled = true): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const t = window.setInterval(() => setN((x) => x + 1), ms)
    return () => window.clearInterval(t)
  }, [ms, enabled])
  return n
}

/** Subscribes to a main-process event for the lifetime of the component. */
export function useEvent<K extends keyof MainEvents>(channel: K, cb: (...args: MainEvents[K]) => void, deps: unknown[] = []): void {
  useEffect(() => window.mb.on(channel, cb), deps) // eslint-disable-line react-hooks/exhaustive-deps
}
