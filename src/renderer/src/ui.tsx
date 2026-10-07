import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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

export const fmtTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

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
export function useEvent(channel: string, cb: (...args: any[]) => void, deps: unknown[] = []): void {
  useEffect(() => window.mb.on(channel, cb), deps) // eslint-disable-line react-hooks/exhaustive-deps
}
