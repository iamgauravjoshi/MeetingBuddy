import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { toneVars } from '../../lib/hues'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

type BannerTone = 'info' | 'success' | 'warning' | 'danger'
const ICONS: Record<BannerTone, LucideIcon> = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert }

/**
 * A persistent message in a page or the banner stack: errors that need action, detected meetings, skipped changes
 * (DESIGN.md §4.1). Danger banners are announced immediately; the others politely.
 */
export function Banner({
  tone = 'info',
  title,
  actions,
  onDismiss,
  className,
  children
}: {
  tone?: BannerTone
  title?: string
  actions?: ReactNode
  onDismiss?: () => void
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-tone={tone}
      style={toneVars(tone)}
      className={cn('flex items-start gap-3 rounded-lg border border-(--tone-line) bg-(--tone-soft) px-3 py-2.5 text-fg', className)}
    >
      <Icon icon={ICONS[tone]} className="mt-0.5 text-(--tone-fg)" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <div className="font-semibold text-(--tone-fg)">{title}</div>}
        {children && <div className="text-body">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {onDismiss && <IconButton icon={X} label="Dismiss" size="sm" onClick={onDismiss} className="-my-1 -mr-1" />}
    </div>
  )
}
