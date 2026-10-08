// Compatibility layer for the pre-redesign screens (DESIGN.md §9, Step 1). The hooks and helpers moved to hooks/ and
// lib/, and Modal is now the new Dialog behind its old API. New code imports from components/, hooks/ and lib/
// directly; this file is deleted once the last old screen is rebuilt.
import type { ReactNode } from 'react'
import { Dialog } from './components/ui/Dialog'

export { useAction } from './hooks/useAction'
export { useEvent } from './hooks/useEvent'
export { useTick } from './hooks/useTick'
export { clickable } from './lib/clickable'
export { fmtDate, fmtTime } from './lib/format'

/** The old dialog API on the new Dialog: focus containment, Escape, backdrop click and focus return come with it. */
export function Modal({
  title,
  onClose,
  children,
  footer
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog title={title} onClose={onClose} size="lg" footer={footer}>
      {children}
    </Dialog>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children, which the rule can't see
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="error">{error}</div> : null
}
