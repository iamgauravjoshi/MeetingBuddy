import { useEffect, useRef } from 'react'

/** True while the user is typing, or a dialog is open: in-app single-key shortcuts must not fire then. */
function shortcutsPaused(e: KeyboardEvent): boolean {
  const t = e.target
  if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return true
  return !!document.querySelector('dialog[open]')
}

/**
 * An in-window keyboard shortcut (DESIGN.md §8.2), e.g. `useHotkey('j', next)` or `useHotkey('ctrl+,', openSettings)`.
 * Global hotkeys (record, mark) are registered in the main process instead.
 */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, enabled = true): void {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!enabled) return
    const parts = combo.toLowerCase().split('+')
    const key = parts.pop()!
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== key) return
      if (e.ctrlKey !== parts.includes('ctrl') || e.shiftKey !== parts.includes('shift') || e.altKey !== parts.includes('alt')) return
      if (shortcutsPaused(e)) return
      e.preventDefault()
      latest.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [combo, enabled])
}
