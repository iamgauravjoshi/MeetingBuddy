import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { type Tone, toneVars } from '../../lib/hues'
import { Icon } from './Icon'

// Maps to the kit's Badge: Color × Type (Filled / Outline + Shade / Shade / Outline). The tone sets --tone-* variables.
const badgeVariants = cva('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border font-medium', {
  variants: {
    appearance: {
      soft: 'border-transparent bg-(--tone-soft) text-(--tone-fg)',
      'soft-outline': 'border-(--tone-line) bg-(--tone-soft) text-(--tone-fg)',
      outline: 'border-(--tone-line) bg-transparent text-(--tone-fg)',
      solid: 'border-transparent bg-(--tone-solid) text-(--tone-on)'
    },
    size: {
      sm: 'h-5 px-1.5 text-small',
      md: 'h-6 px-2 text-small'
    }
  },
  defaultVariants: { appearance: 'soft-outline', size: 'sm' }
})

/**
 * A non-interactive label. Prefer the domain badges (ItemTypeBadge, OpBadge…), which pick tone, icon and label so
 * the same value always looks the same.
 */
export function Badge({
  tone = 'neutral',
  appearance,
  size,
  icon,
  dot = false,
  pulse = false,
  className,
  children
}: VariantProps<typeof badgeVariants> & {
  tone?: Tone
  icon?: LucideIcon
  /** a leading status dot */
  dot?: boolean
  /** animate the dot: recording only */
  pulse?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span data-tone={tone} style={toneVars(tone)} className={cn(badgeVariants({ appearance, size }), className)}>
      {dot && (
        <span
          aria-hidden
          data-essential-motion={pulse || undefined}
          className={cn(
            'size-1.5 rounded-full',
            appearance === 'solid' ? 'bg-(--tone-on)' : 'bg-(--tone-solid)',
            pulse && 'animate-pulse-dot motion-reduce:[animation-duration:2s]'
          )}
        />
      )}
      {icon && <Icon icon={icon} className="size-3.5" />}
      {children}
    </span>
  )
}
