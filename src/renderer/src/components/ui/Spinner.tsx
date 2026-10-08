import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

/** An indeterminate spinner. With `label` it is announced as a status; without, it is decorative (e.g. inside a busy button). */
export function Spinner({ size = 16, label, className }: { size?: 16 | 20; label?: string; className?: string }) {
  const icon = <LoaderCircle size={size} strokeWidth={2} aria-hidden className={cn('shrink-0 animate-spin', className)} />
  if (!label) return icon
  return (
    <span role="status" aria-label={label} className="inline-flex">
      {icon}
    </span>
  )
}
