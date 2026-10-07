import { useEffect, useState, type ReactNode } from 'react'

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
