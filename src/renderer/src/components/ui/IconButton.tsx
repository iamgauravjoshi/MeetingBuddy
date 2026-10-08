import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'
import { buttonVariants } from './Button'
import { Icon } from './Icon'
import { Spinner } from './Spinner'
import { Tooltip } from './Tooltip'

const SQUARE = { sm: 'size-8 px-0', md: 'size-9 px-0', lg: 'size-10 px-0' }

/**
 * A button with only an icon. `label` is required: it is the accessible name and the tooltip (DESIGN.md §4.1).
 * `shortcut` adds a key hint to the tooltip.
 */
export function IconButton({
  icon,
  label,
  shortcut,
  variant = 'ghost',
  size = 'md',
  loading = false,
  disabled,
  className,
  ...rest
}: Omit<ComponentProps<'button'>, 'children'> & {
  icon: LucideIcon
  label: string
  shortcut?: string
  variant?: 'ghost' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}) {
  return (
    <Tooltip content={shortcut ? `${label} (${shortcut})` : label}>
      <button
        type="button"
        aria-label={label}
        data-variant={variant}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size }), SQUARE[size], 'text-icon', className)}
        {...rest}
      >
        {loading ? <Spinner /> : <Icon icon={icon} size={size === 'lg' ? 'md' : 'sm'} />}
      </button>
    </Tooltip>
  )
}
