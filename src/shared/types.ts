// Types shared by the main process, preload and renderer.

export const ITEM_TYPES = [
  'requirement',
  'decision',
  'task',
  'risk',
  'deadline',
  'question'
] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  requirement: 'Requirements',
  decision: 'Decisions',
  task: 'Tasks / Action items',
  risk: 'Risks & Blockers',
  deadline: 'Deadlines & Milestones',
  question: 'Open Questions'
}

export type ItemStatus = 'open' | 'done' | 'superseded' | 'cancelled'

export interface Project {
  id: string
  name: string
  description: string
  createdAt: string
}

export interface Stakeholder {
  id: string
  projectId: string
  name: string
  role: string
  email: string
}

export interface Item {
  id: string
  projectId: string
  type: ItemType
  title: string
  body: string
  status: ItemStatus
  owner: string
  dueDate: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface ItemHistoryEntry {
  id: string
  itemId: string
  meetingId: string | null
  meetingTitle: string | null
  summary: string
  speaker: string
  quote: string
  at: string
}

export type MeetingStatus = 'recording' | 'transcribing' | 'ready' | 'analyzed' | 'applied'

export interface Meeting {
  id: string
  projectId: string
  title: string
  startedAt: string
  endedAt: string | null
  status: MeetingStatus
  sourceApp: string
}

export type SegmentSource = 'mic' | 'system' | 'manual'

export interface Segment {
  id: string
  meetingId: string
  idx: number
  speaker: string
  tStart: number // seconds from meeting start
  tEnd: number
  text: string
  source: SegmentSource
}

export interface Mark {
  id: string
  meetingId: string
  t: number
  kind: string
}

export const PROPOSAL_CATEGORIES = [
  'requirement',
  'decision',
  'action_item',
  'scope_change',
  'timeline_change',
  'risk',
  'blocker',
  'open_question',
  'conflict'
] as const
export type ProposalCategory = (typeof PROPOSAL_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<ProposalCategory, string> = {
  requirement: 'New / changed requirement',
  decision: 'Decision / commitment',
  action_item: 'Action item',
  scope_change: 'Scope change',
  timeline_change: 'Timeline change',
  risk: 'Risk',
  blocker: 'Blocker',
  open_question: 'Unresolved question',
  conflict: 'Conflict with project state'
}

export type ProposalOp = 'create' | 'update' | 'close' | 'supersede' | 'flag'
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'applied'

export interface Evidence {
  segmentId: string
  quote: string
  speaker: string
  t: number
}

export interface Proposal {
  id: string
  reportId: string
  meetingId: string
  category: ProposalCategory
  op: ProposalOp
  targetItemId: string | null
  itemType: ItemType
  title: string
  body: string
  owner: string
  dueDate: string
  speaker: string
  strength: 'firm' | 'tentative'
  confidence: number
  impact: 'high' | 'medium' | 'low'
  rationale: string
  evidence: Evidence[]
  status: ProposalStatus
}

export interface Report {
  id: string
  meetingId: string
  createdAt: string
  model: string
  summary: string
  droppedCount: number // proposals rejected by evidence validation
}

export interface StateVersion {
  id: string
  projectId: string
  meetingId: string | null
  meetingTitle: string | null
  createdAt: string
  changes: { op: ProposalOp; itemId: string; itemType: ItemType; title: string; before?: Partial<Item>; after: Partial<Item> }[]
}

// ---------- Settings ----------

export type LlmProvider = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama' | 'openai-compatible'
export type SttProvider = 'none' | 'deepgram' | 'openai' | 'groq'

export interface Settings {
  llmProvider: LlmProvider
  llmModel: string
  llmBaseUrl: string // only for ollama / openai-compatible
  sttProvider: SttProvider
  sttModel: string
  autoDetect: boolean
  hotkeyRecord: string
  hotkeyMark: string
  chunkSeconds: number
  selfName: string // label for the local mic stream
  // which secrets are stored (values never leave the main process)
  hasKey: Partial<Record<LlmProvider | SttProvider, boolean>>
}

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-5',
  google: 'gemini-2.5-pro',
  openrouter: 'anthropic/claude-sonnet-5.5',
  ollama: 'qwen3:14b',
  'openai-compatible': ''
}

export interface DetectedMeeting {
  app: string
  exe: string
}

export interface RecordingState {
  active: boolean
  meetingId: string | null
  projectId: string | null
  startedAt: number | null
}
