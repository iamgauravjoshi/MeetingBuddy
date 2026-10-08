import type { ItemStatus, ItemType, MeetingStatus, Proposal, ProposalOp } from '@shared/types'
import { Badge } from '../ui/Badge'
import { Spinner } from '../ui/Spinner'
import { IMPACT_META, ITEM_STATUS_META, ITEM_TYPE_META, MEETING_STATUS_META, OP_META } from '../../lib/labels'

// Domain badges (DESIGN.md §2.2): call sites pass the value, never a colour, so the same value always looks the same.

export function ItemTypeBadge({ type, className }: { type: ItemType; className?: string }) {
  const m = ITEM_TYPE_META[type]
  return (
    <Badge tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </Badge>
  )
}

export function OpBadge({ op, className }: { op: ProposalOp; className?: string }) {
  const m = OP_META[op]
  return (
    <Badge tone={m.tone} icon={m.icon} appearance="soft" className={className}>
      {m.label}
    </Badge>
  )
}

export function MeetingStatusBadge({ status, className }: { status: MeetingStatus; className?: string }) {
  const m = MEETING_STATUS_META[status]
  return (
    <Badge tone={m.tone} dot={m.live} pulse={m.live} icon={m.busy || m.live ? undefined : m.icon} className={className}>
      {m.busy && <Spinner size={16} className="size-3" />}
      {m.label}
    </Badge>
  )
}

export function ItemStatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  const m = ITEM_STATUS_META[status]
  return (
    <Badge tone={m.tone} icon={m.icon} appearance="soft" className={className}>
      {m.label}
    </Badge>
  )
}

export function ImpactBadge({ impact, className }: { impact: Proposal['impact']; className?: string }) {
  const m = IMPACT_META[impact]
  return (
    <Badge tone={m.tone} appearance="outline" className={className}>
      {m.label}
    </Badge>
  )
}
