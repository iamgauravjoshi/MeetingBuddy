import type { LucideIcon } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'
import { Kbd } from './Kbd'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  disabled?: boolean
  tone?: 'danger'
  shortcut?: string
}

/** Props the trigger must spread onto its button so the menu can open, close and return focus to it. */
export interface MenuTriggerProps {
  ref: (el: HTMLButtonElement | null) => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string
  onClick: () => void
  onKeyDown: (e: KeyboardEvent) => void
}

/** The menu's items that can take focus, in order. */
const enabledItems = (menu: HTMLElement | null): HTMLElement[] => [
  ...(menu?.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])') ?? [])
]

/**
 * A popup list of actions (WAI-ARIA menu button): Enter, Space or ↓ opens it on the first item, ↑ on the last;
 * ↑/↓/Home/End move, typing a letter jumps to the next item starting with it, Escape or Tab closes it.
 * Escape returns focus to the trigger.
 */
export function Menu({
  label,
  items,
  align = 'start',
  trigger,
  className
}: {
  label: string
  items: MenuItem[]
  align?: 'start' | 'end'
  trigger: (props: MenuTriggerProps) => ReactNode
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const triggerEl = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const [focusOn, setFocusOn] = useState<'first' | 'last'>('first')

  const close = (refocus: boolean): void => {
    setOpen(false)
    if (refocus) triggerEl.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const els = enabledItems(list.current)
    ;(focusOn === 'first' ? els[0] : els[els.length - 1])?.focus()
    const outside = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!list.current?.contains(t) && !triggerEl.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open, focusOn])

  const openOn = (where: 'first' | 'last'): void => {
    setFocusOn(where)
    setOpen(true)
  }

  const onMenuKey = (e: KeyboardEvent): void => {
    const els = enabledItems(list.current)
    const i = els.indexOf(document.activeElement as HTMLElement)
    const move = (to: number): void => {
      e.preventDefault()
      els[(to + els.length) % els.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(i + 1)
    else if (e.key === 'ArrowUp') move(i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(els.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') close(false)
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase()
      const order = [...els.slice(i + 1), ...els.slice(0, i + 1)]
      order.find((el) => el.textContent?.trim().toLowerCase().startsWith(k))?.focus()
    }
  }

  return (
    <div className={cn('relative inline-flex', className)}>
      {trigger({
        ref: (el) => {
          triggerEl.current = el
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => (open ? close(false) : openOn('first')),
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            openOn('first')
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            openOn('last')
          }
        }
      })}
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute top-full z-(--z-dropdown) mt-1 flex min-w-48 animate-pop-in flex-col rounded-lg border border-line bg-raised p-1 shadow-md',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item) => (
            <div
              key={item.label}
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return
                close(true)
                item.onSelect()
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                if (item.disabled) return
                close(true)
                item.onSelect()
              }}
              className={cn(
                'flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-body outline-none focus:bg-selected aria-disabled:cursor-not-allowed aria-disabled:text-fg-disabled',
                item.tone === 'danger' ? 'text-danger-fg' : 'text-fg'
              )}
            >
              {item.icon && <Icon icon={item.icon} className={item.tone === 'danger' ? '' : 'text-icon'} />}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
