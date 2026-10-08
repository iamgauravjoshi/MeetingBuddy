import { type ReactNode, useId } from 'react'
import { cn } from '../../lib/cn'

/** An on/off setting that takes effect as a choice, e.g. "Detect meetings automatically" (from the kit's Toggle). */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'bg-accent' : 'bg-line-hover'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-4 rounded-full bg-white shadow-xs transition-transform duration-fast ease-standard',
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          )}
        />
      </button>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-body text-fg">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-fg-tertiary text-small">
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}
