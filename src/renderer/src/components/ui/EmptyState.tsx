import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

/** What is missing and what to do next (DESIGN.md §4.1). The copy always names the next step. */
export function EmptyState({
  icon,
  title,
  children,
  actions,
  className
}: {
  icon?: LucideIcon
  title: string
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-line-strong border-dashed px-6 py-10 text-center',
        className
      )}
    >
      {icon && (
        <span className="flex size-10 items-center justify-center rounded-full bg-selected text-icon">
          <Icon icon={icon} size="lg" />
        </span>
      )}
      <h3 className="text-fg text-subheading">{title}</h3>
      {children && <div className="max-w-105 text-fg-secondary">{children}</div>}
      {actions && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  )
}
