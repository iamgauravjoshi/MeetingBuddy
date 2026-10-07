import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type {
  Evidence,
  Item,
  ItemHistoryEntry,
  ItemType,
  Mark,
  Meeting,
  MeetingStatus,
  Project,
  Proposal,
  ProposalStatus,
  Report,
  Segment,
  Stakeholder,
  StateVersion
} from '@shared/types'

let db: DatabaseSync

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stakeholders (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', owner TEXT NOT NULL DEFAULT '', due_date TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS item_history (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  summary TEXT NOT NULL, speaker TEXT NOT NULL DEFAULT '', quote TEXT NOT NULL DEFAULT '', at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL,
  source_app TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, speaker TEXT NOT NULL, t_start REAL NOT NULL, t_end REAL NOT NULL,
  text TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS segments_meeting ON segments(meeting_id, t_start);
CREATE TABLE IF NOT EXISTS marks (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  t REAL NOT NULL, kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, model TEXT NOT NULL, summary TEXT NOT NULL, dropped_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  meeting_id TEXT NOT NULL, category TEXT NOT NULL, op TEXT NOT NULL, target_item_id TEXT,
  item_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '', speaker TEXT NOT NULL DEFAULT '', strength TEXT NOT NULL DEFAULT 'firm',
  confidence REAL NOT NULL DEFAULT 0.5, impact TEXT NOT NULL DEFAULT 'medium', rationale TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS state_versions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL, created_at TEXT NOT NULL, changes TEXT NOT NULL
);
`

export function openDb(file: string): void {
  db = new DatabaseSync(file)
  db.exec(SCHEMA)
}

const now = (): string => new Date().toISOString()
const id = (): string => randomUUID()
type Row = Record<string, any>

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// ---------- mappers ----------

const toProject = (r: Row): Project => ({ id: r.id, name: r.name, description: r.description, createdAt: r.created_at })
const toStakeholder = (r: Row): Stakeholder => ({ id: r.id, projectId: r.project_id, name: r.name, role: r.role, email: r.email })
const toItem = (r: Row): Item => ({
  id: r.id, projectId: r.project_id, type: r.type, title: r.title, body: r.body, status: r.status,
  owner: r.owner, dueDate: r.due_date, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at
})
const toMeeting = (r: Row): Meeting => ({
  id: r.id, projectId: r.project_id, title: r.title, startedAt: r.started_at, endedAt: r.ended_at,
  status: r.status, sourceApp: r.source_app
})
const toSegment = (r: Row): Segment => ({
  id: r.id, meetingId: r.meeting_id, idx: r.idx, speaker: r.speaker, tStart: r.t_start, tEnd: r.t_end,
  text: r.text, source: r.source
})
const toProposal = (r: Row): Proposal => ({
  id: r.id, reportId: r.report_id, meetingId: r.meeting_id, category: r.category, op: r.op,
  targetItemId: r.target_item_id, itemType: r.item_type, title: r.title, body: r.body, owner: r.owner,
  dueDate: r.due_date, speaker: r.speaker, strength: r.strength, confidence: r.confidence, impact: r.impact,
  rationale: r.rationale, evidence: JSON.parse(r.evidence) as Evidence[], status: r.status
})

// ---------- projects ----------

export function listProjects(): Project[] {
  return (db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Row[]).map(toProject)
}
export function getProject(pid: string): Project | null {
  const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid) as Row | undefined
  return r ? toProject(r) : null
}
export function createProject(name: string, description: string): Project {
  const p = { id: id(), name, description, createdAt: now() }
  db.prepare('INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)').run(p.id, name, description, p.createdAt)
  return p
}
export function updateProject(pid: string, name: string, description: string): void {
  db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(name, description, pid)
}
export function deleteProject(pid: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(pid)
}

// ---------- stakeholders ----------

export function listStakeholders(pid: string): Stakeholder[] {
  return (db.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY name').all(pid) as Row[]).map(toStakeholder)
}
export function upsertStakeholder(s: Omit<Stakeholder, 'id'> & { id?: string }): Stakeholder {
  const sid = s.id ?? id()
  db.prepare(
    `INSERT INTO stakeholders (id, project_id, name, role, email) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, email = excluded.email`
  ).run(sid, s.projectId, s.name, s.role, s.email)
  return { ...s, id: sid }
}
export function deleteStakeholder(sid: string): void {
  db.prepare('DELETE FROM stakeholders WHERE id = ?').run(sid)
}

// ---------- items ----------

export function listItems(pid: string): Item[] {
  return (db.prepare('SELECT * FROM items WHERE project_id = ? ORDER BY created_at').all(pid) as Row[]).map(toItem)
}
export function getItem(iid: string): Item | null {
  const r = db.prepare('SELECT * FROM items WHERE id = ?').get(iid) as Row | undefined
  return r ? toItem(r) : null
}
export function createItem(i: Pick<Item, 'projectId' | 'type' | 'title' | 'body' | 'owner' | 'dueDate'> & { status?: Item['status'] }): Item {
  const t = now()
  const item: Item = { id: id(), status: 'open', version: 1, createdAt: t, updatedAt: t, ...i } as Item
  db.prepare(
    `INSERT INTO items (id, project_id, type, title, body, status, owner, due_date, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(item.id, item.projectId, item.type, item.title, item.body, item.status, item.owner, item.dueDate, t, t)
  return item
}
export function updateItem(iid: string, patch: Partial<Pick<Item, 'title' | 'body' | 'status' | 'owner' | 'dueDate' | 'type'>>): Item {
  const cur = getItem(iid)
  if (!cur) throw new Error(`Item ${iid} not found`)
  const next = { ...cur, ...patch }
  db.prepare(
    `UPDATE items SET type = ?, title = ?, body = ?, status = ?, owner = ?, due_date = ?, version = version + 1, updated_at = ?
     WHERE id = ?`
  ).run(next.type, next.title, next.body, next.status, next.owner, next.dueDate, now(), iid)
  return getItem(iid)!
}
export function deleteItem(iid: string): void {
  db.prepare('DELETE FROM items WHERE id = ?').run(iid)
}

export function addItemHistory(h: { itemId: string; meetingId: string | null; summary: string; speaker: string; quote: string }): void {
  db.prepare('INSERT INTO item_history (id, item_id, meeting_id, summary, speaker, quote, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id(), h.itemId, h.meetingId, h.summary, h.speaker, h.quote, now()
  )
}
export function getItemHistory(iid: string): ItemHistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT h.*, m.title AS meeting_title FROM item_history h LEFT JOIN meetings m ON m.id = h.meeting_id
       WHERE h.item_id = ? ORDER BY h.at DESC`
    )
    .all(iid) as Row[]
  return rows.map((r) => ({
    id: r.id, itemId: r.item_id, meetingId: r.meeting_id, meetingTitle: r.meeting_title,
    summary: r.summary, speaker: r.speaker, quote: r.quote, at: r.at
  }))
}

// ---------- meetings & transcript ----------

export function listMeetings(pid: string): Meeting[] {
  return (db.prepare('SELECT * FROM meetings WHERE project_id = ? ORDER BY started_at DESC').all(pid) as Row[]).map(toMeeting)
}
export function listMeetingIds(): string[] {
  return (db.prepare('SELECT id FROM meetings').all() as Row[]).map((r) => r.id as string)
}
export function getMeeting(mid: string): Meeting | null {
  const r = db.prepare('SELECT * FROM meetings WHERE id = ?').get(mid) as Row | undefined
  return r ? toMeeting(r) : null
}
export function createMeeting(pid: string, title: string, status: MeetingStatus, sourceApp = ''): Meeting {
  const m: Meeting = { id: id(), projectId: pid, title, startedAt: now(), endedAt: null, status, sourceApp }
  db.prepare('INSERT INTO meetings (id, project_id, title, started_at, ended_at, status, source_app) VALUES (?, ?, ?, ?, NULL, ?, ?)').run(
    m.id, pid, title, m.startedAt, status, sourceApp
  )
  return m
}
export function updateMeeting(mid: string, patch: Partial<Pick<Meeting, 'title' | 'status' | 'endedAt'>>): void {
  const cur = getMeeting(mid)
  if (!cur) return
  const n = { ...cur, ...patch }
  db.prepare('UPDATE meetings SET title = ?, status = ?, ended_at = ? WHERE id = ?').run(n.title, n.status, n.endedAt, mid)
}
export function deleteMeeting(mid: string): void {
  db.prepare('DELETE FROM meetings WHERE id = ?').run(mid)
}

export function listSegments(mid: string): Segment[] {
  return (db.prepare('SELECT * FROM segments WHERE meeting_id = ? ORDER BY t_start, idx').all(mid) as Row[]).map(toSegment)
}
export function addSegments(mid: string, segs: Omit<Segment, 'id' | 'meetingId' | 'idx'>[]): Segment[] {
  const start = (db.prepare('SELECT COALESCE(MAX(idx), -1) + 1 AS n FROM segments WHERE meeting_id = ?').get(mid) as Row).n as number
  const stmt = db.prepare('INSERT INTO segments (id, meeting_id, idx, speaker, t_start, t_end, text, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  return tx(() =>
    segs.map((s, k) => {
      const seg: Segment = { ...s, id: id(), meetingId: mid, idx: start + k }
      stmt.run(seg.id, mid, seg.idx, seg.speaker, seg.tStart, seg.tEnd, seg.text, seg.source)
      return seg
    })
  )
}
export function renameSpeaker(mid: string, from: string, to: string): void {
  db.prepare('UPDATE segments SET speaker = ? WHERE meeting_id = ? AND speaker = ?').run(to, mid, from)
}

export function listMarks(mid: string): Mark[] {
  return (db.prepare('SELECT * FROM marks WHERE meeting_id = ? ORDER BY t').all(mid) as Row[]).map((r) => ({
    id: r.id, meetingId: r.meeting_id, t: r.t, kind: r.kind
  }))
}
export function addMark(mid: string, t: number, kind: string): void {
  db.prepare('INSERT INTO marks (id, meeting_id, t, kind) VALUES (?, ?, ?, ?)').run(id(), mid, t, kind)
}

// ---------- reports & proposals ----------

export function saveReport(
  mid: string,
  model: string,
  summary: string,
  droppedCount: number,
  proposals: Omit<Proposal, 'id' | 'reportId' | 'meetingId' | 'status'>[]
): Report {
  const rep: Report = { id: id(), meetingId: mid, createdAt: now(), model, summary, droppedCount }
  const stmt = db.prepare(
    `INSERT INTO proposals (id, report_id, meeting_id, category, op, target_item_id, item_type, title, body, owner, due_date,
       speaker, strength, confidence, impact, rationale, evidence, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  )
  tx(() => {
    // a meeting keeps only its latest report
    db.prepare('DELETE FROM reports WHERE meeting_id = ?').run(mid)
    db.prepare('INSERT INTO reports (id, meeting_id, created_at, model, summary, dropped_count) VALUES (?, ?, ?, ?, ?, ?)').run(
      rep.id, mid, rep.createdAt, model, summary, droppedCount
    )
    for (const p of proposals) {
      stmt.run(
        id(), rep.id, mid, p.category, p.op, p.targetItemId, p.itemType, p.title, p.body, p.owner, p.dueDate,
        p.speaker, p.strength, p.confidence, p.impact, p.rationale, JSON.stringify(p.evidence)
      )
    }
  })
  return rep
}
export function getReport(mid: string): { report: Report; proposals: Proposal[] } | null {
  const r = db.prepare('SELECT * FROM reports WHERE meeting_id = ?').get(mid) as Row | undefined
  if (!r) return null
  const report: Report = { id: r.id, meetingId: r.meeting_id, createdAt: r.created_at, model: r.model, summary: r.summary, droppedCount: r.dropped_count }
  const proposals = (db.prepare('SELECT * FROM proposals WHERE report_id = ?').all(r.id) as Row[]).map(toProposal)
  return { report, proposals }
}
export function getProposal(pid: string): Proposal | null {
  const r = db.prepare('SELECT * FROM proposals WHERE id = ?').get(pid) as Row | undefined
  return r ? toProposal(r) : null
}
export function updateProposal(
  pid: string,
  patch: Partial<Pick<Proposal, 'status' | 'title' | 'body' | 'owner' | 'dueDate' | 'itemType'>>
): void {
  const cur = getProposal(pid)
  if (!cur) return
  const n = { ...cur, ...patch }
  db.prepare('UPDATE proposals SET status = ?, title = ?, body = ?, owner = ?, due_date = ?, item_type = ? WHERE id = ?').run(
    n.status as ProposalStatus, n.title, n.body, n.owner, n.dueDate, n.itemType as ItemType, pid
  )
}

// ---------- state versions ----------

export function addStateVersion(pid: string, mid: string | null, changes: StateVersion['changes']): void {
  db.prepare('INSERT INTO state_versions (id, project_id, meeting_id, created_at, changes) VALUES (?, ?, ?, ?, ?)').run(
    id(), pid, mid, now(), JSON.stringify(changes)
  )
}
export function listStateVersions(pid: string): StateVersion[] {
  const rows = db
    .prepare(
      `SELECT v.*, m.title AS meeting_title FROM state_versions v LEFT JOIN meetings m ON m.id = v.meeting_id
       WHERE v.project_id = ? ORDER BY v.created_at DESC`
    )
    .all(pid) as Row[]
  return rows.map((r) => ({
    id: r.id, projectId: r.project_id, meetingId: r.meeting_id, meetingTitle: r.meeting_title,
    createdAt: r.created_at, changes: JSON.parse(r.changes)
  }))
}

/** Recent meeting reports for a project, used as "previous meeting history" context for the LLM. */
export function recentMeetingSummaries(pid: string, excludeMeetingId: string, limit = 5): { title: string; date: string; summary: string }[] {
  const rows = db
    .prepare(
      `SELECT m.title, m.started_at, r.summary FROM meetings m JOIN reports r ON r.meeting_id = m.id
       WHERE m.project_id = ? AND m.id != ? ORDER BY m.started_at DESC LIMIT ?`
    )
    .all(pid, excludeMeetingId, limit) as Row[]
  return rows.map((r) => ({ title: r.title, date: r.started_at, summary: r.summary }))
}

export function deleteSegments(mid: string, sources: Segment['source'][]): void {
  const stmt = db.prepare('DELETE FROM segments WHERE meeting_id = ? AND source = ?')
  for (const s of sources) stmt.run(mid, s)
}
