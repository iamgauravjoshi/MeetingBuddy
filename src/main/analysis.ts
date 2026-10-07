import { generateText, Output } from 'ai'
import { z } from 'zod'
import {
  ITEM_TYPES,
  PROPOSAL_CATEGORIES,
  type Evidence,
  type Item,
  type ItemType,
  type Proposal,
  type ProposalCategory,
  type Segment,
  type StateVersion
} from '@shared/types'
import * as db from './db'
import { getModel } from './llm'
import { getSettings } from './settings'

// ---------- prompt building ----------

const TYPE_PREFIX: Record<ItemType, string> = {
  requirement: 'REQ',
  decision: 'DEC',
  task: 'TSK',
  risk: 'RSK',
  deadline: 'DL',
  question: 'Q'
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`
}

/** Short, model-friendly IDs (e.g. DEC-3, S42) mapped back to database IDs. */
function buildRefs(items: Item[], segments: Segment[]) {
  const itemRef = new Map<string, Item>()
  const counters: Partial<Record<ItemType, number>> = {}
  const itemLines: string[] = []
  for (const it of items) {
    const n = (counters[it.type] = (counters[it.type] ?? 0) + 1)
    const ref = `${TYPE_PREFIX[it.type]}-${n}`
    itemRef.set(ref, it)
    const meta = [it.status !== 'open' && `status: ${it.status}`, it.owner && `owner: ${it.owner}`, it.dueDate && `due: ${it.dueDate}`]
      .filter(Boolean)
      .join(', ')
    itemLines.push(`[${ref}] (${it.type}) ${it.title}${meta ? ` {${meta}}` : ''}${it.body ? `\n    ${it.body.replace(/\n/g, '\n    ')}` : ''}`)
  }
  const segRef = new Map<string, Segment>()
  const segLines = segments.map((s, i) => {
    const ref = `S${i + 1}`
    segRef.set(ref, s)
    return `[${ref} ${fmtTime(s.tStart)}] ${s.speaker}: ${s.text}`
  })
  return { itemRef, segRef, itemText: itemLines.join('\n'), transcriptText: segLines.join('\n') }
}

const INSTRUCTIONS = `You are MeetingBuddy, an AI that tracks how a project evolves from meeting to meeting.
Your job is NOT to summarize the meeting. Your job is to answer: "What changed in the project because of this meeting?"

You receive (1) the current project state as a list of items with IDs, (2) summaries of previous meetings, and (3) a speaker-labelled transcript whose lines have IDs like S12.

Produce a list of proposed changes to the project state. Each change must be one of these categories:
- requirement: a new requirement, or a change to an existing one
- decision: a decision or firm commitment that was made
- action_item: a task with an owner (and a due date if one was mentioned)
- scope_change: something added to or removed from scope
- timeline_change: a deadline or milestone moved, added or removed
- risk / blocker: a new risk or blocker, or a change to an existing one
- open_question: a question raised but not resolved in this meeting
- conflict: something said that contradicts an existing item, a previous decision or earlier meeting history

Choose an op for each change:
- create: a new item (target_item = null)
- update: modify an existing item (target_item = its ID, e.g. "REQ-2"); put the NEW full title/body in title/body
- close: an existing task/question/risk is done or resolved (target_item required)
- supersede: an existing item (usually a decision or requirement) is replaced by a new one (target_item = the old item)
- flag: for conflicts only; target_item = the item that is contradicted (or null if it contradicts meeting history)

Rules:
- Only report real changes to the project. Ignore small talk, status updates that change nothing, and things already in the project state unchanged.
- Do not duplicate existing items. If the meeting refines an existing item, use update on that item's ID.
- evidence: 1-3 VERBATIM quotes copied exactly from the transcript, each with the line ID it came from. Never paraphrase inside a quote. Changes without evidence will be discarded.
- speaker: the name of the person who made the statement, exactly as written in the transcript.
- strength: "firm" for decisions, commitments and definite statements; "tentative" for hedged ideas ("maybe", "we could", "let's think about").
- item_type: the kind of project item this change creates or modifies (requirement, decision, task, risk, deadline, question). Blockers are risks; open questions are questions; scope changes are usually requirements; timeline changes are usually deadlines.
- owner and due_date: fill in only when they are stated or clearly implied; otherwise use "". Use YYYY-MM-DD for dates when you can work them out from the meeting date.
- rationale: one sentence on why this matters for the project. For conflicts, say exactly what it conflicts with and when.
- impact: high = affects scope, timeline, budget or a key decision; medium = normal work items; low = minor.
- Lines marked as important by the user deserve extra attention.
- summary: 2-4 sentences describing how the project changed (not what was discussed).`

const changeSchema = z.object({
  category: z.enum(PROPOSAL_CATEGORIES),
  op: z.enum(['create', 'update', 'close', 'supersede', 'flag']),
  target_item: z.string().nullable().describe('ID of an existing project item such as DEC-2, or null'),
  item_type: z.enum(ITEM_TYPES),
  title: z.string().describe('Short title of the resulting project item'),
  body: z.string().describe('Details of the resulting project item'),
  owner: z.string(),
  due_date: z.string(),
  speaker: z.string(),
  strength: z.enum(['firm', 'tentative']),
  confidence: z.number().describe('0 to 1'),
  impact: z.enum(['high', 'medium', 'low']),
  rationale: z.string(),
  evidence: z.array(z.object({ line: z.string().describe('Transcript line ID such as S12'), quote: z.string() }))
})

const reportSchema = z.object({
  summary: z.string(),
  changes: z.array(changeSchema)
})

type RawChange = z.infer<typeof changeSchema>

// ---------- evidence validation ----------

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** True if the quote really appears in the segment (exact after normalisation, or ≥85% of its words in order). */
export function quoteMatches(quote: string, segmentText: string): boolean {
  const q = norm(quote)
  const t = norm(segmentText)
  if (!q) return false
  if (t.includes(q)) return true
  const qw = q.split(' ')
  const tw = t.split(' ')
  let j = 0
  let hit = 0
  for (const w of qw) {
    const k = tw.indexOf(w, j)
    if (k !== -1) {
      hit++
      j = k + 1
    }
  }
  return qw.length >= 3 && hit / qw.length >= 0.85
}

const DEFAULT_TYPE: Record<ProposalCategory, ItemType> = {
  requirement: 'requirement',
  decision: 'decision',
  action_item: 'task',
  scope_change: 'requirement',
  timeline_change: 'deadline',
  risk: 'risk',
  blocker: 'risk',
  open_question: 'question',
  conflict: 'question'
}

type ValidatedProposal = Omit<Proposal, 'id' | 'reportId' | 'meetingId' | 'status'>

export function validateChanges(
  changes: RawChange[],
  segRef: Map<string, Segment>,
  itemRef: Map<string, Item>,
  segments: Segment[]
): { kept: ValidatedProposal[]; dropped: number } {
  const speakers = new Set(segments.map((s) => s.speaker))
  const kept: ValidatedProposal[] = []
  let dropped = 0

  for (const c of changes) {
    const evidence: Evidence[] = []
    for (const e of c.evidence) {
      const ref = e.line.trim().replace(/^\[|\]$/g, '').split(/\s/)[0].toUpperCase()
      let seg = segRef.get(ref)
      // the model sometimes cites the neighbouring line; check one line either side
      if (seg && !quoteMatches(e.quote, seg.text)) {
        const n = Number(ref.slice(1))
        seg = [segRef.get(`S${n - 1}`), segRef.get(`S${n + 1}`)].find((s) => s && quoteMatches(e.quote, s.text))
      }
      if (seg) evidence.push({ segmentId: seg.id, quote: e.quote.trim(), speaker: seg.speaker, t: seg.tStart })
    }
    if (evidence.length === 0) {
      dropped++
      continue
    }

    let op = c.op
    const target = c.target_item ? itemRef.get(c.target_item.trim().toUpperCase()) ?? null : null
    if (!target && (op === 'update' || op === 'close' || op === 'supersede')) op = 'create' // unknown target: treat as new
    if (op === 'flag' && c.category !== 'conflict') op = 'create'

    const speaker = speakers.has(c.speaker) ? c.speaker : evidence[0].speaker
    kept.push({
      category: c.category,
      op,
      targetItemId: target?.id ?? null,
      itemType: ITEM_TYPES.includes(c.item_type) ? c.item_type : DEFAULT_TYPE[c.category],
      title: c.title.trim(),
      body: c.body.trim(),
      owner: c.owner.trim(),
      dueDate: c.due_date.trim(),
      speaker,
      strength: c.strength,
      confidence: Math.min(1, Math.max(0, Number(c.confidence) || 0)),
      impact: c.impact,
      rationale: c.rationale.trim(),
      evidence
    })
  }
  const order = { high: 0, medium: 1, low: 2 }
  kept.sort((a, b) => order[a.impact] - order[b.impact] || b.confidence - a.confidence)
  return { kept, dropped }
}

// ---------- run analysis ----------

export async function analyzeMeeting(meetingId: string) {
  const meeting = db.getMeeting(meetingId)
  if (!meeting) throw new Error('Meeting not found')
  const project = db.getProject(meeting.projectId)!
  const segments = db.listSegments(meetingId)
  if (segments.length === 0) throw new Error('This meeting has no transcript yet.')

  const items = db.listItems(project.id).filter((i) => i.status !== 'superseded' && i.status !== 'cancelled')
  const stakeholders = db.listStakeholders(project.id)
  const history = db.recentMeetingSummaries(project.id, meetingId)
  const marks = db.listMarks(meetingId)
  const { itemRef, segRef, itemText, transcriptText } = buildRefs(items, segments)

  const prompt = [
    `# Project: ${project.name}`,
    project.description && `## Description\n${project.description}`,
    `## Stakeholders\n${stakeholders.map((s) => `- ${s.name}${s.role ? ` (${s.role})` : ''}`).join('\n') || '(none listed)'}`,
    `## Current project state\n${itemText || '(empty: this is the first meeting, so everything relevant is new)'}`,
    `## Previous meetings (most recent first)\n${history.map((h) => `- ${h.date.slice(0, 10)} "${h.title}": ${h.summary}`).join('\n') || '(none)'}`,
    `## This meeting\nTitle: ${meeting.title}\nDate: ${meeting.startedAt.slice(0, 10)}`,
    marks.length ? `Moments the user marked as important: ${marks.map((m) => fmtTime(m.t)).join(', ')}` : '',
    `## Transcript\n${transcriptText}`
  ]
    .filter(Boolean)
    .join('\n\n')

  const settings = getSettings()
  const { model, label } = getModel(settings)
  const result = await generateText({
    model,
    instructions: INSTRUCTIONS,
    prompt,
    output: Output.object({ schema: reportSchema, name: 'meeting_impact_report' }),
    maxRetries: 2
  })
  const out = result.output
  const { kept, dropped } = validateChanges(out.changes, segRef, itemRef, segments)
  db.saveReport(meetingId, label, out.summary, dropped, kept)
  db.updateMeeting(meetingId, { status: 'analyzed' })
  return db.getReport(meetingId)
}

// ---------- apply approved changes ----------

export function applyApproved(meetingId: string): { applied: number } {
  const meeting = db.getMeeting(meetingId)
  const rep = db.getReport(meetingId)
  if (!meeting || !rep) throw new Error('No report for this meeting')
  const accepted = rep.proposals.filter((p) => p.status === 'accepted')
  const changes: StateVersion['changes'] = []

  db.tx(() => {
    for (const p of accepted) {
      const ev = p.evidence[0]
      const hist = (itemId: string, summary: string): void =>
        db.addItemHistory({ itemId, meetingId, summary, speaker: p.speaker, quote: ev?.quote ?? '' })
      const target = p.targetItemId ? db.getItem(p.targetItemId) : null

      if (p.op === 'create' || (!target && p.op !== 'flag')) {
        const it = db.createItem({ projectId: meeting.projectId, type: p.itemType, title: p.title, body: p.body, owner: p.owner, dueDate: p.dueDate })
        hist(it.id, `Created (${p.category.replace('_', ' ')})`)
        changes.push({ op: 'create', itemId: it.id, itemType: it.type, title: it.title, after: it })
      } else if (p.op === 'update' && target) {
        const patch: Partial<Item> = {}
        if (p.title && p.title !== target.title) patch.title = p.title
        if (p.body && p.body !== target.body) patch.body = p.body
        if (p.owner && p.owner !== target.owner) patch.owner = p.owner
        if (p.dueDate && p.dueDate !== target.dueDate) patch.dueDate = p.dueDate
        const before = Object.fromEntries(Object.keys(patch).map((k) => [k, target[k as keyof Item]])) as Partial<Item>
        const it = db.updateItem(target.id, patch)
        hist(it.id, `Updated: ${Object.keys(patch).join(', ') || 'no field changes'}`)
        changes.push({ op: 'update', itemId: it.id, itemType: it.type, title: it.title, before, after: patch })
      } else if (p.op === 'close' && target) {
        db.updateItem(target.id, { status: 'done' })
        hist(target.id, 'Closed / resolved')
        changes.push({ op: 'close', itemId: target.id, itemType: target.type, title: target.title, before: { status: target.status }, after: { status: 'done' } })
      } else if (p.op === 'supersede' && target) {
        db.updateItem(target.id, { status: 'superseded' })
        const it = db.createItem({ projectId: meeting.projectId, type: p.itemType, title: p.title, body: p.body, owner: p.owner, dueDate: p.dueDate })
        hist(target.id, `Superseded by "${it.title}"`)
        hist(it.id, `Created, replacing "${target.title}"`)
        changes.push({ op: 'supersede', itemId: target.id, itemType: target.type, title: target.title, before: { status: target.status }, after: { status: 'superseded' } })
        changes.push({ op: 'create', itemId: it.id, itemType: it.type, title: it.title, after: it })
      } else if (p.op === 'flag') {
        // a conflict becomes an open question that someone must resolve
        const it = db.createItem({
          projectId: meeting.projectId,
          type: 'question',
          title: `Resolve conflict: ${p.title}`,
          body: [p.body, p.rationale].filter(Boolean).join('\n'),
          owner: p.owner,
          dueDate: ''
        })
        hist(it.id, 'Conflict flagged')
        if (target) hist(target.id, `Conflict flagged: ${p.title}`)
        changes.push({ op: 'flag', itemId: it.id, itemType: 'question', title: it.title, after: it })
      }
      db.updateProposal(p.id, { status: 'applied' })
    }
    if (changes.length) db.addStateVersion(meeting.projectId, meetingId, changes)
    db.updateMeeting(meetingId, { status: 'applied' })
  })
  return { applied: accepted.length }
}
