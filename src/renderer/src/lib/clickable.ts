import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * Props that make a clickable card, row or quote work like a button for keyboard and screen-reader users:
 * it can be tabbed to, is announced as a button, and Enter or Space activates it.
 * Prefer a real <button>; this is for markup where one can't be used.
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
