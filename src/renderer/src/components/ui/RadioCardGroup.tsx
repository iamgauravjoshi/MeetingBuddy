import type { ReactNode } from 'react'
import { useRef } from 'react'
import { cn } from '../../lib/cn'
import { focusValue, rovingKey } from '../../lib/roving'

export interface RadioCardOption<T extends string> {
  value: T
  label: string
  description?: ReactNode
  /** e.g. a "Key saved" badge */
  adornment?: ReactNode
  disabled?: boolean
}

/**
 * A choice between a few options, each shown as a card with a description (from the kit's Integrations cards).
 * Used for the LLM and speech-to-text providers. One tab stop; arrow keys move and select (WAI-ARIA radio group).
 */
export function RadioCardGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = 2,
  className
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: RadioCardOption<T>[]
  columns?: 1 | 2 | 3
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const enabled = options.filter((o) => !o.disabled).map((o) => o.value)
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-2', columns === 2 && 'regular:grid-cols-2', columns === 3 && 'regular:grid-cols-3', className)}
    >
      {options.map((o) => {
        const checked = o.value === value
        return (
          // biome-ignore lint/a11y/useSemanticElements: a WAI-ARIA radio group of cards with descriptions; native radios can't hold them
          <button
            key={o.value}
            type="button"
            role="radio"
            data-value={o.value}
            aria-checked={checked}
            disabled={o.disabled}
            // one tab stop: the checked option, or the first one when nothing is checked yet
            tabIndex={checked || (!enabled.includes(value) && o.value === enabled[0]) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const to = rovingKey(e, enabled, value)
              if (to === null) return
              onChange(to)
              focusValue(ref.current, to)
            }}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border bg-surface p-3 text-left transition-[border-color,box-shadow,background-color] duration-fast disabled:cursor-not-allowed disabled:opacity-60',
              checked ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-hover hover:bg-hover'
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                checked ? 'border-accent' : 'border-line-hover'
              )}
            >
              {checked && <span className="size-2 rounded-full bg-accent" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-body-strong text-fg">
                {o.label}
                {o.adornment}
              </span>
              {o.description && <span className="text-fg-secondary text-small">{o.description}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
