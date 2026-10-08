import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { cn } from '../../lib/cn'
import { IconButton } from './IconButton'

const WIDTHS = { sm: 'max-w-105', md: 'max-w-140', lg: 'max-w-180' }

/** Where focus goes when a dialog opens: a marked element, else the first field, else the rightmost (primary) footer button. */
function initialFocus(dialog: HTMLDialogElement): HTMLElement | null {
  return (
    dialog.querySelector<HTMLElement>('[data-autofocus]') ??
    dialog.querySelector<HTMLElement>('[data-dialog-body] :is(input:not([type=hidden]), select, textarea):not(:disabled)') ??
    [...dialog.querySelectorAll<HTMLElement>('[data-dialog-footer] button:not(:disabled)')].pop() ??
    null
  )
}

/**
 * A modal dialog on the native <dialog> element (DESIGN.md §4.1). showModal() gives focus containment, makes the page
 * behind inert and puts the dialog in the top layer. Escape and a backdrop click call onClose unless `dismissible` is
 * false (e.g. while saving). Focus returns to whatever opened it.
 *
 * Render it while it should be open; `open={false}` closes it without unmounting.
 */
export function Dialog({
  open = true,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  dismissible = true,
  className,
  children
}: {
  open?: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  size?: keyof typeof WIDTHS
  footer?: ReactNode
  dismissible?: boolean
  className?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()
  // the latest props, read by native event handlers without re-running the open effect
  const latest = useRef({ onClose, dismissible })
  latest.current = { onClose, dismissible }
  const closingOurselves = useRef(false)

  useEffect(() => {
    const d = ref.current
    if (!open || !d) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closingOurselves.current = false
    if (!d.open) d.showModal()
    initialFocus(d)?.focus()
    return () => {
      closingOurselves.current = true
      if (d.open) d.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Escape: keep the dialog open and let the owner decide, so React state stays the source of truth
      onCancel={(e) => {
        e.preventDefault()
        if (latest.current.dismissible) latest.current.onClose()
      }}
      // closed some other way (e.g. the browser forcing it on a repeated Escape): tell the owner
      onClose={() => {
        if (!closingOurselves.current) latest.current.onClose()
      }}
      // a mousedown on the <dialog> itself, not its panel, is on the backdrop
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && latest.current.dismissible) latest.current.onClose()
      }}
      className={cn(
        'm-auto max-h-[calc(100vh-48px)] w-[calc(100vw-48px)] overflow-visible bg-transparent p-0 text-fg backdrop:bg-overlay motion-safe:backdrop:animate-fade-in',
        WIDTHS[size]
      )}
    >
      <div
        className={cn(
          'flex max-h-[calc(100vh-48px)] flex-col rounded-2xl border border-line bg-surface shadow-lg motion-safe:animate-dialog-in',
          className
        )}
      >
        <header className="flex items-start gap-3 px-6 pt-5 pb-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={titleId} className="text-heading">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-fg-secondary">
                {description}
              </p>
            )}
          </div>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} disabled={!dismissible} className="-mr-2" />
        </header>
        <div data-dialog-body className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-2">
          {children}
        </div>
        {footer && (
          <footer data-dialog-footer className="flex items-center justify-end gap-2 px-6 pt-3 pb-5">
            {footer}
          </footer>
        )}
        {!footer && <div className="h-4" />}
      </div>
    </dialog>
  )
}
