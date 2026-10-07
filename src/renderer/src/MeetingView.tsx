import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORY_LABELS,
  ITEM_TYPES,
  type Item,
  type Mark,
  type Meeting,
  type Proposal,
  type ProposalCategory,
  type Report,
  type Segment,
  type Stakeholder
} from '@shared/types'
import { api, errMsg } from './api'
import { ErrorBox, Field, fmtDate, fmtTime, Modal, useEvent } from './ui'

const OP_BADGE: Record<Proposal['op'], [string, string]> = {
  create: ['NEW', 'green'],
  update: ['CHANGE', 'blue'],
  close: ['CLOSE', 'purple'],
  supersede: ['REPLACES', 'amber'],
  flag: ['CONFLICT', 'red']
}

// biggest project impact first
const REPORT_ORDER: ProposalCategory[] = [
  'conflict',
  'scope_change',
  'timeline_change',
  'decision',
  'requirement',
  'action_item',
  'blocker',
  'risk',
  'open_question'
]

export function MeetingView(props: {
  meetingId: string
  live: boolean
  onLoaded: (projectId: string) => void
  onBack: (projectId: string) => void
  onOpenProject: (projectId: string) => void
}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [marks, setMarks] = useState<Mark[]>([])
  const [report, setReport] = useState<{ report: Report; proposals: Proposal[] } | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([])
  const [highlight, setHighlight] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mapSpeakers, setMapSpeakers] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const m = await api.getMeeting(props.meetingId)
    if (!m) return
    setMeeting(m)
    props.onLoaded(m.projectId)
    const t = await api.getTranscript(props.meetingId)
    setSegments(t.segments)
    setMarks(t.marks)
    setReport(await api.getReport(props.meetingId))
    setItems(await api.listItems(m.projectId))
    setStakeholders(await api.listStakeholders(m.projectId))
  }, [props.meetingId])
  useEffect(() => void load(), [load])
  useEvent('meeting:changed', (id: string) => id === props.meetingId && void load(), [load])
  useEvent(
    'transcript:appended',
    (id: string, added: Segment[]) => {
      if (id !== props.meetingId) return
      setSegments((s) => [...s, ...added].sort((a, b) => a.tStart - b.tStart))
      requestAnimationFrame(() => transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight }))
    },
    [props.meetingId]
  )

  const speakers = useMemo(() => [...new Set(segments.map((s) => s.speaker))], [segments])
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const markedSegs = useMemo(
    () => new Set(marks.flatMap((m) => segments.filter((s) => m.t >= s.tStart - 5 && m.t <= s.tEnd + 5).map((s) => s.id))),
    [marks, segments]
  )

  const jumpTo = (segmentId: string): void => {
    setHighlight(segmentId)
    document.getElementById(`seg-${segmentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const run = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(label)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const setStatus = async (p: Proposal, status: Proposal['status']): Promise<void> => {
    await api.updateProposal(p.id, { status })
    setReport((r) => r && { ...r, proposals: r.proposals.map((x) => (x.id === p.id ? { ...x, status } : x)) })
  }

  if (!meeting) return null
  const proposals = report?.proposals ?? []
  const pending = proposals.filter((p) => p.status === 'pending').length
  const accepted = proposals.filter((p) => p.status === 'accepted').length
  const canAnalyze = segments.length > 0 && !props.live && meeting.status !== 'transcribing'

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="header" style={{ marginBottom: 0 }}>
        <button className="btn ghost" onClick={() => props.onBack(meeting.projectId)}>← Meetings</button>
        <div>
          <h1 style={{ cursor: 'pointer' }} title="Rename" onClick={() => setRenaming(true)}>{meeting.title}</h1>
          <div className="muted small">
            {fmtDate(meeting.startedAt)}
            {meeting.sourceApp && meeting.sourceApp !== 'import' && ` · ${meeting.sourceApp}`} · {segments.length} transcript lines
            {props.live && <span className="badge red" style={{ marginLeft: 8 }}>LIVE</span>}
            {meeting.status === 'transcribing' && <span className="badge amber" style={{ marginLeft: 8 }}>Processing…</span>}
          </div>
        </div>
        <span className="spacer" />
        {speakers.length > 0 && <button className="btn" onClick={() => setMapSpeakers(true)}>Map speakers</button>}
        <button className="btn primary" disabled={!canAnalyze || !!busy} onClick={() => void run('Analyzing meeting against project state…', () => api.analyzeMeeting(meeting.id))}>
          {report ? 'Re-analyze' : 'Analyze impact'}
        </button>
        <button
          className="btn danger"
          disabled={props.live}
          onClick={async () => {
            if (!confirm('Delete this meeting, its transcript and its report? Changes already applied to the project stay.')) return
            await api.deleteMeeting(meeting.id)
            props.onBack(meeting.projectId)
          }}
        >
          Delete
        </button>
      </div>
      {busy && <div className="banner">{busy}</div>}
      <ErrorBox error={error} />

      <div className="meeting-grid">
        <section className="col">
          <h2>Transcript</h2>
          <div className="transcript card" ref={transcriptRef}>
            {segments.map((s) => (
              <div key={s.id} id={`seg-${s.id}`} className={`seg ${highlight === s.id ? 'hl' : ''} ${markedSegs.has(s.id) ? 'marked' : ''}`}>
                <div className="seg-time">{fmtTime(s.tStart)}</div>
                <div>
                  <div className="seg-speaker">{s.speaker}</div>
                  <div>{s.text}</div>
                </div>
              </div>
            ))}
            {segments.length === 0 && (
              <div className="muted" style={{ padding: 16 }}>
                {props.live
                  ? 'Listening… the live transcript appears here in chunks of about 30 seconds.'
                  : meeting.status === 'transcribing'
                    ? 'Transcribing the recording…'
                    : 'No transcript. Set up a speech-to-text provider in Settings, or import a transcript from the project Meetings tab.'}
              </div>
            )}
          </div>
        </section>

        <section className="col">
          <div className="row">
            <h2 className="grow">Meeting Impact Report</h2>
            {report && (
              <>
                <button
                  className="btn sm"
                  disabled={pending === 0}
                  title="Accept every firm, evidence-backed change with confidence of at least 0.7"
                  onClick={async () => {
                    for (const p of proposals) if (p.status === 'pending' && p.strength === 'firm' && p.confidence >= 0.7) await setStatus(p, 'accepted')
                  }}
                >
                  Accept all firm
                </button>
                <button
                  className="btn sm success"
                  disabled={accepted === 0 || !!busy}
                  onClick={() =>
                    void run('Updating project state…', async () => {
                      await api.applyApproved(meeting.id)
                    })
                  }
                >
                  Apply {accepted} approved
                </button>
              </>
            )}
          </div>
          <div className="report">
            {!report && (
              <div className="empty">
                {props.live
                  ? 'The report is generated automatically when the meeting ends.'
                  : segments.length
                    ? 'Click "Analyze impact" to compare this meeting with the current project state.'
                    : 'A transcript is needed before analysis.'}
              </div>
            )}
            {report && (
              <>
                <div className="summary">
                  <div className="small muted" style={{ marginBottom: 4 }}>What changed · {report.report.model}</div>
                  {report.report.summary}
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {proposals.length} proposed change{proposals.length === 1 ? '' : 's'} · {pending} pending · {accepted} accepted
                    {report.report.droppedCount > 0 && ` · ${report.report.droppedCount} discarded for missing evidence`}
                  </div>
                </div>
                {REPORT_ORDER.map((cat) => {
                  const list = proposals.filter((p) => p.category === cat)
                  if (!list.length) return null
                  return (
                    <div key={cat} className="col">
                      <h3>{CATEGORY_LABELS[cat]} <span className="muted small">{list.length}</span></h3>
                      {list.map((p) => (
                        <ProposalCard
                          key={p.id}
                          p={p}
                          target={p.targetItemId ? itemsById.get(p.targetItemId) : undefined}
                          onJump={jumpTo}
                          onStatus={(s) => void setStatus(p, s)}
                          onEdited={(np) => setReport((r) => r && { ...r, proposals: r.proposals.map((x) => (x.id === np.id ? np : x)) })}
                        />
                      ))}
                    </div>
                  )
                })}
                {proposals.length === 0 && <div className="empty">No project changes were detected in this meeting.</div>}
                {meeting.status === 'applied' && (
                  <div className="row">
                    <span className="muted small">Approved changes are applied to the project state.</span>
                    <button className="btn sm" onClick={() => props.onOpenProject(meeting.projectId)}>View project state</button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {mapSpeakers && (
        <SpeakerMapModal
          speakers={speakers}
          stakeholders={stakeholders}
          onClose={() => setMapSpeakers(false)}
          onSave={async (map) => {
            for (const [from, to] of Object.entries(map)) if (to && to !== from) await api.renameSpeaker(meeting.id, from, to)
            setMapSpeakers(false)
            await load()
          }}
        />
      )}
      {renaming && (
        <RenameModal
          title={meeting.title}
          onClose={() => setRenaming(false)}
          onSave={async (t) => {
            await api.renameMeeting(meeting.id, t)
            setRenaming(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

function ProposalCard(props: {
  p: Proposal
  target?: Item
  onJump: (segmentId: string) => void
  onStatus: (s: Proposal['status']) => void
  onEdited: (p: Proposal) => void
}) {
  const { p, target } = props
  const [editing, setEditing] = useState(false)
  const [label, color] = OP_BADGE[p.op]
  const applied = p.status === 'applied'
  return (
    <div className={`proposal ${p.status}`}>
      <div className="row">
        <span className={`badge ${color}`}>{label}</span>
        <span className="muted small">{p.itemType}</span>
        <b className="grow">{p.title}</b>
        <span className={`badge ${p.impact === 'high' ? 'red' : p.impact === 'medium' ? 'amber' : ''}`}>{p.impact}</span>
        {p.strength === 'tentative' && <span className="badge amber" title="Hedged statement, not a firm commitment">tentative</span>}
        <span className="muted small" title="Model confidence">{Math.round(p.confidence * 100)}%</span>
      </div>
      {target && (
        <div className="small">
          <span className="muted">{p.op === 'flag' ? 'Conflicts with' : p.op === 'supersede' ? 'Replaces' : 'Existing item'}: </span>
          <span className={p.op === 'supersede' ? 'diff-old' : ''}>{target.title}</span>
          {p.op === 'update' && target.dueDate && p.dueDate && target.dueDate !== p.dueDate && (
            <span> · due <span className="diff-old">{target.dueDate}</span> → {p.dueDate}</span>
          )}
          {p.op === 'update' && target.owner && p.owner && target.owner !== p.owner && (
            <span> · owner <span className="diff-old">{target.owner}</span> → {p.owner}</span>
          )}
        </div>
      )}
      {p.body && <div className="small">{p.body}</div>}
      <div className="row small muted">
        <span>🗣 {p.speaker}</span>
        {p.owner && <span>👤 {p.owner}</span>}
        {p.dueDate && <span>📅 {p.dueDate}</span>}
      </div>
      {p.rationale && <div className="small muted">{p.rationale}</div>}
      {p.evidence.map((e, i) => (
        <div key={i} className="quote small" onClick={() => props.onJump(e.segmentId)} title="Show in transcript">
          “{e.quote}” <span className="muted">— {e.speaker} @ {fmtTime(e.t)}</span>
        </div>
      ))}
      {!applied && (
        <div className="row">
          <button className={`btn sm ${p.status === 'accepted' ? 'success' : ''}`} onClick={() => props.onStatus(p.status === 'accepted' ? 'pending' : 'accepted')}>
            ✓ {p.status === 'accepted' ? 'Accepted' : 'Accept'}
          </button>
          <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>
          <button className={`btn sm ${p.status === 'rejected' ? 'danger' : ''}`} onClick={() => props.onStatus(p.status === 'rejected' ? 'pending' : 'rejected')}>
            ✕ {p.status === 'rejected' ? 'Rejected' : 'Reject'}
          </button>
        </div>
      )}
      {applied && <span className="badge blue" style={{ alignSelf: 'flex-start' }}>applied to project</span>}
      {editing && (
        <EditProposalModal
          p={p}
          onClose={() => setEditing(false)}
          onSave={async (patch) => {
            await api.updateProposal(p.id, { ...patch, status: 'accepted' })
            props.onEdited({ ...p, ...patch, status: 'accepted' })
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

function EditProposalModal(props: { p: Proposal; onClose: () => void; onSave: (patch: Pick<Proposal, 'title' | 'body' | 'owner' | 'dueDate' | 'itemType'>) => void }) {
  const [f, setF] = useState({ title: props.p.title, body: props.p.body, owner: props.p.owner, dueDate: props.p.dueDate, itemType: props.p.itemType })
  return (
    <Modal
      title="Edit proposed change"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn primary" onClick={() => props.onSave(f)}>Save & accept</button>
        </>
      }
    >
      <Field label="Item type">
        <select className="input" value={f.itemType} onChange={(e) => setF({ ...f, itemType: e.target.value as Proposal['itemType'] })}>
          {ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Details"><textarea className="input" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <div className="row">
        <div className="grow"><Field label="Owner"><input className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field></div>
        <div className="grow"><Field label="Due date"><input className="input" value={f.dueDate} placeholder="YYYY-MM-DD" onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field></div>
      </div>
    </Modal>
  )
}

function SpeakerMapModal(props: { speakers: string[]; stakeholders: Stakeholder[]; onClose: () => void; onSave: (map: Record<string, string>) => void }) {
  const [map, setMap] = useState<Record<string, string>>(Object.fromEntries(props.speakers.map((s) => [s, s])))
  return (
    <Modal
      title="Map speakers to people"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn primary" onClick={() => props.onSave(map)}>Save</button>
        </>
      }
    >
      <p className="muted small">Speech-to-text labels voices as "Speaker 1", "Speaker 2"… Give them real names so the report attributes statements and owners correctly. Re-analyze afterwards.</p>
      <datalist id="stakeholder-names">
        {props.stakeholders.map((s) => <option key={s.id} value={s.name} />)}
      </datalist>
      {props.speakers.map((s) => (
        <div key={s} className="row">
          <span style={{ width: 140 }}>{s}</span>
          <span className="muted">→</span>
          <input className="input grow" style={{ width: 'auto' }} list="stakeholder-names" value={map[s]} onChange={(e) => setMap({ ...map, [s]: e.target.value })} />
        </div>
      ))}
    </Modal>
  )
}

function RenameModal(props: { title: string; onClose: () => void; onSave: (t: string) => void }) {
  const [t, setT] = useState(props.title)
  return (
    <Modal
      title="Rename meeting"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn primary" disabled={!t.trim()} onClick={() => props.onSave(t.trim())}>Save</button>
        </>
      }
    >
      <input className="input" value={t} onChange={(e) => setT(e.target.value)} autoFocus />
    </Modal>
  )
}
