import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

const SIZES = { sm: 16, md: 18, lg: 20 }

/**
 * A lucide icon at our sizes and stroke (DESIGN.md §4.1). Decorative (hidden from screen readers) unless `label`
 * is given, in which case it is announced as an image with that name.
 */
export function Icon({
  icon: I,
  size = 'sm',
  label,
  className
}: {
  icon: LucideIcon
  size?: keyof typeof SIZES
  label?: string
  className?: string
}) {
  return (
    <I
      size={SIZES[size]}
      strokeWidth={1.75}
      className={cn('shrink-0', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  )
}
