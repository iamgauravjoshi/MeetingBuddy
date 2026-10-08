import type { CSSProperties } from 'react'
import { cn } from '../../lib/cn'

/** A loading placeholder shaped like the content it stands for (DESIGN.md §7). Static under reduced motion. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'block rounded-sm bg-[linear-gradient(90deg,var(--color-selected)_25%,var(--color-hover)_50%,var(--color-selected)_75%)] bg-size-[200%_100%] motion-safe:animate-shimmer',
        className
      )}
    />
  )
}

/** Lines of text; the last one is shorter, like a real paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder lines have no identity
        <Skeleton key={i} className="h-3" style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%' }} />
      ))}
    </span>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <span className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)} aria-hidden>
      <Skeleton className="h-4 w-2/3" />
      <SkeletonText lines={2} />
    </span>
  )
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5', className)} aria-hidden>
      <Skeleton className="size-6 rounded-full" />
      <Skeleton className="h-3 flex-1" />
      <Skeleton className="h-5 w-20" />
    </span>
  )
}
