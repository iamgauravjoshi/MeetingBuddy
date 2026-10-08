import { cn } from '../../lib/cn'
import { fmtDate, fmtDateLong, fmtTime } from '../../lib/format'

/**
 * A time, formatted one way everywhere: `seconds` into a meeting as mm:ss in mono, or an ISO date as "Oct 8, 10:02"
 * with the full date as its tooltip.
 */
export function Timestamp(props: ({ seconds: number; iso?: never } | { iso: string; seconds?: never }) & { className?: string }) {
  if (props.seconds !== undefined)
    return <span className={cn('font-mono text-fg-tertiary text-mono tabular-nums', props.className)}>{fmtTime(props.seconds)}</span>
  return (
    <time dateTime={props.iso} title={fmtDateLong(props.iso)} className={cn('tabular-nums', props.className)}>
      {fmtDate(props.iso)}
    </time>
  )
}
