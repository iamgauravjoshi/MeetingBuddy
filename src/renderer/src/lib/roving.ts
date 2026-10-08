import type { KeyboardEvent } from 'react'

/**
 * Arrow-key navigation for a group with one tab stop (tabs, radio groups): ←/↑ and →/↓ move with wrap-around,
 * Home/End jump to the ends. Returns the newly selected value, or null when the key isn't a navigation key.
 * The caller selects it and moves focus to it (selection follows focus).
 */
export function rovingKey<T>(e: KeyboardEvent, values: T[], current: T, orientation: 'horizontal' | 'both' = 'both'): T | null {
  const i = values.indexOf(current)
  const prev = orientation === 'horizontal' ? ['ArrowLeft'] : ['ArrowLeft', 'ArrowUp']
  const next = orientation === 'horizontal' ? ['ArrowRight'] : ['ArrowRight', 'ArrowDown']
  let to: number
  if (prev.includes(e.key)) to = (i - 1 + values.length) % values.length
  else if (next.includes(e.key)) to = (i + 1) % values.length
  else if (e.key === 'Home') to = 0
  else if (e.key === 'End') to = values.length - 1
  else return null
  e.preventDefault()
  return values[to]
}

/** Focuses the element in `container` whose data-value is `value`. */
export function focusValue(container: HTMLElement | null, value: string): void {
  container?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)?.focus()
}
