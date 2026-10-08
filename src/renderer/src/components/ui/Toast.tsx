import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert, X } from 'lucide-react'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { toneVars } from '../../lib/hues'
import { Button } from './Button'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

type ToastTone = 'info' | 'success' | 'warning' | 'danger'
const ICONS: Record<ToastTone, LucideIcon> = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert }

export interface ToastOptions {
  tone?: ToastTone
  title: string
  body?: ReactNode
  action?: { label: string; onClick: () => void }
}

interface ToastEntry extends ToastOptions {
  id: number
}

interface ToastApi {
  show: (toast: ToastOptions) => number
  dismiss: (id: number) => void
}

export const TOAST_MS = 6000
const MAX_TOASTS = 3

const ToastContext = createContext<ToastApi | null>(null)

/**
 * Transient messages in the bottom-right corner (DESIGN.md §4.1): at most 3, newest last. They dismiss themselves
 * after 6 s, paused while hovered or focused; errors stay until dismissed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const next = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const show = useCallback((toast: ToastOptions) => {
    const id = next.current++
    setToasts((ts) => [...ts, { ...toast, id }].slice(-MAX_TOASTS))
    return id
  }, [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section aria-label="Notifications" className="pointer-events-none fixed right-4 bottom-4 z-(--z-toast) flex w-90 flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} dismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, dismiss }: { toast: ToastEntry; dismiss: (id: number) => void }) {
  const tone = toast.tone ?? 'info'
  const { id } = toast
  const onDismiss = (): void => dismiss(id)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (tone === 'danger' || paused) return
    const t = window.setTimeout(() => dismiss(id), TOAST_MS)
    return () => window.clearTimeout(t)
  }, [tone, paused, id, dismiss])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only pause the auto-dismiss timer
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={toneVars(tone)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-raised p-3 shadow-md motion-safe:animate-toast-in'
      )}
    >
      <Icon icon={ICONS[tone]} className="mt-0.5 text-(--tone-fg)" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-body-strong text-fg">{toast.title}</div>
        {toast.body && <div className="text-fg-secondary text-small">{toast.body}</div>}
        {toast.action && (
          <Button
            size="sm"
            variant="ghost"
            className="-ml-3 self-start text-accent-fg"
            onClick={() => {
              toast.action?.onClick()
              onDismiss()
            }}
          >
            {toast.action.label}
          </Button>
        )}
      </div>
      <IconButton icon={X} label="Dismiss" size="sm" onClick={onDismiss} className="-my-1 -mr-1" />
    </div>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast needs a <ToastProvider> above it')
  return api
}
