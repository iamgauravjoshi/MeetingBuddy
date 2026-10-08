import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { buttonVariants } from './Button'
import { Icon } from './Icon'
import { Menu, type MenuItem } from './Menu'

/**
 * A main action with a menu of related ones, e.g. Capture: Record meeting | Paste transcript, Import… (from the
 * kit's "Capture ▾"). The two halves are separate buttons, so each has its own name and focus.
 */
export function SplitButton({
  label,
  icon,
  onClick,
  items,
  menuLabel,
  variant = 'primary',
  size = 'md',
  disabled,
  className
}: {
  label: string
  icon?: LucideIcon
  onClick: () => void
  items: MenuItem[]
  /** the chevron's accessible name, e.g. "More capture options" */
  menuLabel: string
  variant?: 'primary' | 'secondary' | 'record'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('inline-flex', className)}>
      <button type="button" disabled={disabled} onClick={onClick} className={cn(buttonVariants({ variant, size }), 'rounded-r-none')}>
        {icon && <Icon icon={icon} />}
        {label}
      </button>
      <Menu
        label={menuLabel}
        items={items}
        align="end"
        trigger={(p) => (
          <button
            type="button"
            aria-label={menuLabel}
            disabled={disabled}
            {...p}
            className={cn(
              buttonVariants({ variant, size }),
              'rounded-l-none border-l px-2',
              variant === 'secondary' ? 'border-l-line-strong' : 'border-l-white/25'
            )}
          >
            <Icon icon={ChevronDown} />
          </button>
        )}
      />
    </div>
  )
}
