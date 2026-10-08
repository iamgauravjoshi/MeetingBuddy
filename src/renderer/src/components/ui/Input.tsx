import { cva } from 'class-variance-authority'
import { ChevronDown, Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { type ComponentProps, type ReactNode, useState } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

// Maps to the kit's Input Field and Text Area states: default, hover, focused, filled, disabled, error (DESIGN.md §4.1).
export const fieldVariants = cva(
  'w-full min-w-0 rounded-lg border border-line-strong bg-surface text-body text-fg transition-[border-color,box-shadow] duration-fast placeholder:text-fg-tertiary hover:border-line-hover focus-visible:border-focus disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-fg-disabled aria-invalid:border-danger-solid',
  {
    variants: {
      size: { sm: 'h-8 px-2.5', md: 'h-9 px-3', lg: 'h-10 px-3' }
    },
    defaultVariants: { size: 'md' }
  }
)

type Size = 'sm' | 'md' | 'lg'
type InputProps = Omit<ComponentProps<'input'>, 'size'> & {
  size?: Size
  /** an icon (e.g. Search) or node inside the field, before the text */
  leading?: LucideIcon | ReactNode
  /** a node inside the field, after the text: a Kbd, a clear or show/hide button */
  trailing?: ReactNode
  invalid?: boolean
}

const isIcon = (x: unknown): x is LucideIcon => typeof x === 'function' || (typeof x === 'object' && x !== null && 'render' in x)

export function Input({ size, leading, trailing, invalid, className, ...rest }: InputProps) {
  const input = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(fieldVariants({ size }), leading != null && 'pl-9', trailing != null && 'pr-10', !leading && !trailing && className)}
      {...rest}
    />
  )
  if (leading == null && trailing == null) return input
  return (
    <div className={cn('relative flex items-center', className)}>
      {leading != null && (
        <span className="pointer-events-none absolute left-3 flex text-fg-tertiary">
          {isIcon(leading) ? <Icon icon={leading} /> : leading}
        </span>
      )}
      {input}
      {trailing != null && <span className="absolute right-1.5 flex items-center">{trailing}</span>}
    </div>
  )
}

/** A password-style field with a show/hide toggle, for API keys. Never pre-fill it with a stored secret. */
export function SecretInput(props: Omit<InputProps, 'type' | 'trailing'>) {
  const [shown, setShown] = useState(false)
  return (
    <Input
      {...props}
      type={shown ? 'text' : 'password'}
      autoComplete="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          aria-label={shown ? 'Hide' : 'Show'}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-icon hover:bg-selected"
        >
          <Icon icon={shown ? EyeOff : Eye} />
        </button>
      }
    />
  )
}

export function Textarea({
  invalid,
  autoGrow = false,
  minRows = 3,
  className,
  onInput,
  ...rest
}: ComponentProps<'textarea'> & { invalid?: boolean; autoGrow?: boolean; minRows?: number }) {
  return (
    <textarea
      rows={minRows}
      aria-invalid={invalid || undefined}
      onInput={(e) => {
        if (autoGrow) {
          const t = e.currentTarget
          t.style.height = 'auto'
          t.style.height = `${t.scrollHeight + 2}px`
        }
        onInput?.(e)
      }}
      className={cn(fieldVariants(), 'h-auto resize-y py-2 text-body leading-5', autoGrow && 'resize-none overflow-hidden', className)}
      {...rest}
    />
  )
}

/** A styled native select: reliable keyboard and screen-reader behaviour, with our chevron. */
export function Select({
  size,
  invalid,
  className,
  children,
  ...rest
}: Omit<ComponentProps<'select'>, 'size'> & { size?: Size; invalid?: boolean }) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <select aria-invalid={invalid || undefined} className={cn(fieldVariants({ size }), 'cursor-pointer appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <Icon icon={ChevronDown} className="pointer-events-none absolute right-3 text-icon" />
    </div>
  )
}
