import type { ReactNode } from 'react'

/** Text for screen readers only. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
