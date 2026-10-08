import { cloneElement, type ReactElement, type ReactNode, useId } from 'react'
import { cn } from '../../lib/cn'

type ControlProps = {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
  invalid?: boolean
}

/**
 * A label, hint and error around one control, wired together for screen readers: the label's htmlFor, the control's
 * id, aria-describedby for the hint and error, and aria-invalid when there's an error (DESIGN.md §4.1).
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  optional = false,
  className,
  children
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  optional?: boolean
  className?: string
  children: ReactElement<ControlProps>
}) {
  const auto = useId()
  const id = children.props.id ?? auto
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-medium text-fg-secondary text-small">
        {label}
        {required && (
          <span aria-hidden className="text-danger-fg">
            {' '}
            *
          </span>
        )}
        {optional && <span className="font-normal text-fg-tertiary"> (optional)</span>}
      </label>
      {cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
        invalid: !!error || children.props.invalid
      })}
      {hint && (
        <span id={hintId} className="text-fg-tertiary text-small">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="text-danger-fg text-small">
          {error}
        </span>
      )}
    </div>
  )
}
