import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** A number with a label, for summary strips (from the kit's dashboard stat cards). */
export function Stat({ value, label, hint, className }: { value: ReactNode; label: string; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 shadow-xs', className)}>
      <span className="text-fg-secondary text-small">{label}</span>
      <span className="text-fg text-title tabular-nums">{value}</span>
      {hint && <span className="text-fg-tertiary text-small">{hint}</span>}
    </div>
  )
}
