import { type ComponentProps, type ReactNode, useId } from 'react'
import { cn } from '../../lib/cn'

/** A native checkbox with its label; the whole row is clickable. */
export function Checkbox({
  label,
  hint,
  className,
  id,
  ...rest
}: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        id={inputId}
        type="checkbox"
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-xs accent-accent disabled:cursor-not-allowed"
        {...rest}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={inputId} className="cursor-pointer text-body text-fg">
          {label}
        </label>
        {hint && (
          <span id={`${inputId}-hint`} className="text-fg-tertiary text-small">
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}
