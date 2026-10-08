import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'
import { Spinner } from './Spinner'

// Maps to the kit's Buttons [1.0]: Type × Style × Size (DESIGN.md §4.1).
export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-body-strong transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-standard active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-fg-disabled disabled:shadow-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-fg-inverse hover:bg-accent-hover',
        secondary: 'border-line-strong bg-surface text-fg shadow-xs hover:border-line-hover hover:bg-hover',
        soft: 'bg-accent-soft text-accent-fg hover:border-success-line',
        ghost: 'text-fg hover:bg-selected',
        danger: 'border-danger-line bg-surface text-danger-fg hover:bg-danger-soft',
        'danger-soft': 'bg-danger-soft text-danger-fg hover:border-danger-line',
        record: 'bg-record-solid text-record-on hover:brightness-95'
      },
      size: {
        sm: 'h-8 px-3 text-small',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-4'
      },
      fullWidth: { true: 'w-full' }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** leading icon, e.g. icon={Plus} */
    icon?: LucideIcon
    iconRight?: LucideIcon
    /** shows a spinner in place of the icon, disables the button and marks it busy; the label stays so the width doesn't jump */
    loading?: boolean
  }

export function Button({
  variant,
  size,
  fullWidth,
  icon,
  iconRight,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      data-variant={variant ?? 'secondary'}
      data-size={size ?? 'md'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon && <Icon icon={icon} />}
      {children}
      {iconRight && !loading && <Icon icon={iconRight} />}
    </button>
  )
}
