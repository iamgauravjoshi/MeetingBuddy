import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  /** names the action: "Delete project", never "OK" */
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'warning' | 'default'
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/**
 * Hosts the app's confirmation dialog; `useConfirm()` opens it. Replaces window.confirm (DESIGN.md §4.1).
 * For a danger confirmation, focus starts on Cancel, so a stray Enter doesn't destroy anything.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false) // a second request cancels the first
        resolver.current = resolve
        setPending(options)
      }),
    []
  )

  const settle = (ok: boolean): void => {
    resolver.current?.(ok)
    resolver.current = null
    setPending(null)
  }

  const tone = pending?.tone ?? 'default'
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Dialog
          title={pending.title}
          size="sm"
          onClose={() => settle(false)}
          footer={
            <>
              <Button onClick={() => settle(false)} data-autofocus={tone === 'danger' || undefined}>
                {pending.cancelLabel ?? 'Cancel'}
              </Button>
              <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>
                {pending.confirmLabel}
              </Button>
            </>
          }
        >
          {pending.body && <div className="text-fg-secondary">{pending.body}</div>}
        </Dialog>
      )}
    </ConfirmContext.Provider>
  )
}

/** Asks the user to confirm an action; resolves true only if they choose the confirm button. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm needs a <ConfirmProvider> above it')
  return confirm
}
