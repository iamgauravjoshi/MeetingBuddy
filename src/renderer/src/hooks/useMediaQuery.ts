import { useSyncExternalStore } from 'react'

/** Whether a media query matches, kept up to date. Use only where the component tree must change (DESIGN.md §2.8). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches
  )
}

/** The `regular` breakpoint and up (≥ 1100px): the full sidebar and the split meeting view. */
export const REGULAR = '(min-width: 1100px)'
