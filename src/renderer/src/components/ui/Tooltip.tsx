import { cloneElement, type ReactElement, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

const SHOW_DELAY_MS = 500

/**
 * A short text hint over its child: after 500 ms of hover, or straight away on keyboard focus; Escape hides it
 * (DESIGN.md §4.1). It never holds essential information. With `describe`, the hint is also linked to the child with
 * aria-describedby; leave it off when the hint repeats the child's own name (an IconButton's label).
 */
export function Tooltip({
  content,
  side = 'top',
  describe = false,
  children
}: {
  content: string
  side?: 'top' | 'bottom' | 'right'
  describe?: boolean
  children: ReactElement<{ 'aria-describedby'?: string }>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const clear = (): void => window.clearTimeout(timer.current)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only show a visual hint; the child is the control
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        clear()
        timer.current = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS)
      }}
      onMouseLeave={() => {
        clear()
        setOpen(false)
      }}
      onFocus={(e) => e.target.matches(':focus-visible') && setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {describe ? cloneElement(children, { 'aria-describedby': id }) : children}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute z-(--z-tooltip) w-max max-w-64 animate-fade-in rounded-sm bg-neutral-solid px-2 py-1 text-neutral-on text-small shadow-md',
            side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
            side === 'bottom' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
            side === 'right' && 'top-1/2 left-full ml-1.5 -translate-y-1/2'
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
