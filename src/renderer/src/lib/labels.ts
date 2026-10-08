import {
  Check,
  CalendarClock,
  CircleCheck,
  CircleHelp,
  FileText,
  Gavel,
  Inbox,
  ListChecks,
  LoaderCircle,
  type LucideIcon,
  Mic,
  Pencil,
  Plus,
  Replace,
  SquareCheck,
  TriangleAlert,
  Zap
} from 'lucide-react'
import type { ItemStatus, ItemType, MeetingStatus, Proposal, ProposalOp } from '@shared/types'
import type { Tone } from './hues'

// The one place that maps domain values to words, colours and icons (DESIGN.md §2.2). Colour is never the only cue:
// every entry has a label, and the badges always show it.

export interface DomainMeta {
  label: string
  tone: Tone
  icon?: LucideIcon
}

export const ITEM_TYPE_META: Record<ItemType, DomainMeta> = {
  requirement: { label: 'Requirement', tone: 'blue', icon: ListChecks },
  decision: { label: 'Decision', tone: 'purple', icon: Gavel },
  task: { label: 'Task', tone: 'teal', icon: SquareCheck },
  risk: { label: 'Risk', tone: 'red', icon: TriangleAlert },
  deadline: { label: 'Deadline', tone: 'orange', icon: CalendarClock },
  question: { label: 'Question', tone: 'pink', icon: CircleHelp }
}

export const OP_META: Record<ProposalOp, DomainMeta> = {
  create: { label: 'New', tone: 'success', icon: Plus },
  update: { label: 'Change', tone: 'info', icon: Pencil },
  close: { label: 'Close', tone: 'neutral', icon: CircleCheck },
  supersede: { label: 'Replaces', tone: 'warning', icon: Replace },
  flag: { label: 'Conflict', tone: 'danger', icon: Zap }
}

export interface MeetingStatusMeta extends DomainMeta {
  /** work is running in the background: show a spinner */
  busy?: boolean
  /** the live recording: show the pulsing dot */
  live?: boolean
}

export const MEETING_STATUS_META: Record<MeetingStatus, MeetingStatusMeta> = {
  recording: { label: 'Recording', tone: 'record', icon: Mic, live: true },
  transcribing: { label: 'Transcribing…', tone: 'info', icon: LoaderCircle, busy: true },
  ready: { label: 'Transcript ready', tone: 'neutral', icon: FileText },
  analyzing: { label: 'Analyzing…', tone: 'info', icon: LoaderCircle, busy: true },
  analyzed: { label: 'Needs review', tone: 'warning', icon: Inbox },
  applied: { label: 'Applied', tone: 'success', icon: Check }
}

export const ITEM_STATUS_META: Record<ItemStatus, DomainMeta> = {
  open: { label: 'Open', tone: 'neutral' },
  done: { label: 'Done', tone: 'success', icon: Check },
  superseded: { label: 'Superseded', tone: 'warning', icon: Replace },
  cancelled: { label: 'Cancelled', tone: 'neutral' }
}

export const IMPACT_META: Record<Proposal['impact'], DomainMeta> = {
  high: { label: 'High impact', tone: 'danger' },
  medium: { label: 'Medium impact', tone: 'warning' },
  low: { label: 'Low impact', tone: 'neutral' }
}
