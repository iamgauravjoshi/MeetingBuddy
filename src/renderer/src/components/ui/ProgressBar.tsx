import { cn } from '../../lib/cn'

/**
 * Progress towards a total, e.g. proposals reviewed. `segments` draws the kit's segmented style (setup checklist).
 * Without `value` and `max`, it is indeterminate.
 */
export function ProgressBar({
  value,
  max,
  label,
  segments = false,
  className
}: {
  value?: number
  max?: number
  label: string
  segments?: boolean
  className?: string
}) {
  const determinate = value !== undefined && max !== undefined && max > 0
  const pct = determinate ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
      className={cn('flex h-1.5 w-full gap-1 overflow-hidden', !segments && 'rounded-full bg-selected', className)}
    >
      {segments && determinate ? (
        Array.from({ length: max }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positions, not items
          <span key={i} className={cn('flex-1 rounded-full transition-colors duration-base', i < value ? 'bg-brand' : 'bg-selected')} />
        ))
      ) : (
        <span
          className={cn(
            'h-full rounded-full bg-brand transition-[width] duration-slow ease-out',
            !determinate && 'w-1/3 motion-safe:animate-pulse'
          )}
          style={determinate ? { width: `${pct}%` } : undefined}
        />
      )}
    </div>
  )
}
