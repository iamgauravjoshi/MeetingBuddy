import { useCallback, useEffect, useRef, useState } from 'react'
import type { DetectedMeeting, Project, Settings } from '@shared/types'
import { api, errMsg } from './api'
import { MeetingRecorder } from './recorder'
import { ErrorBox, Field, fmtTime, Modal, useAction, useEvent, useTick } from './ui'
import { ProjectView } from './ProjectView'
import { MeetingView } from './MeetingView'
import { SettingsView } from './SettingsView'

export type View =
  | { kind: 'home' }
  | { kind: 'project'; projectId: string; tab?: string }
  | { kind: 'meeting'; meetingId: string }
  | { kind: 'settings' }

interface ActiveRecording {
  meetingId: string
  projectId: string
  title: string
  recorder: MeetingRecorder
}

const LAST_PROJECT = 'mb:lastProject'

export function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [view, setView] = useState<View>({ kind: 'home' })
  const [settings, setSettings] = useState<Settings | null>(null)
  const [rec, setRec] = useState<ActiveRecording | null>(null)
  const recRef = useRef<ActiveRecording | null>(null)
  const [startPrompt, setStartPrompt] = useState<{ sourceApp: string } | null>(null)
  const [detected, setDetected] = useState<DetectedMeeting | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [newProject, setNewProject] = useState(false)
  useTick(1000, !!rec)

  const loadProjects = useCallback(async () => {
    const ps = await api.listProjects()
    setProjects(ps)
    return ps
  }, [])

  useEffect(() => {
    void loadProjects().then((ps) => {
      const last = localStorage.getItem(LAST_PROJECT)
      const p = ps.find((x) => x.id === last) ?? ps[0]
      if (p) setView({ kind: 'project', projectId: p.id })
    })
    void api.getSettings().then(setSettings)
  }, [loadProjects])

  useEffect(() => {
    if (view.kind === 'project') localStorage.setItem(LAST_PROJECT, view.projectId)
  }, [view])

  // ---------- recording ----------

  const stopRecording = useCallback(async (reason?: string) => {
    const r = recRef.current
    if (!r) return
    recRef.current = null
    setRec(null)
    window.mb.setRecordingState({ active: false, meetingId: null, projectId: null, startedAt: null })
    try {
      await r.recorder.stop()
      await api.stopRecording(r.meetingId)
      setBanner(
        `${reason ? `${reason} ` : ''}Recording saved. Transcribing and analyzing in the background; you'll get a notification when the report is ready.`
      )
    } catch (e) {
      // the audio is on disk either way; the meeting page offers to transcribe it
      setBanner(`Stopping the recording failed: ${errMsg(e)}`)
    }
    setView({ kind: 'meeting', meetingId: r.meetingId })
  }, [])

  const startRecording = useCallback(async (projectId: string, title: string, sourceApp: string) => {
    const s = await api.getSettings()
    const m = await api.startRecording(projectId, title, sourceApp)
    const recorder = new MeetingRecorder(m.id, s.sttProvider === 'none' ? 0 : s.chunkSeconds, (msg) => setBanner(msg))
    try {
      await recorder.start()
    } catch (e) {
      await api.deleteMeeting(m.id)
      throw e
    }
    const active = { meetingId: m.id, projectId, title, recorder }
    recRef.current = active
    setRec(active)
    setDetected(null)
    window.mb.setRecordingState({ active: true, meetingId: m.id, projectId, startedAt: Date.now() })
    if (recorder.warnings.length) setBanner(recorder.warnings.join(' '))
    else if (s.sttProvider === 'none')
      setBanner('Recording audio. No speech-to-text provider is set, so add one in Settings to get a transcript.')
    setView({ kind: 'meeting', meetingId: m.id })
  }, [])

  const toggleRecording = useCallback(
    (sourceApp = '') => {
      if (recRef.current) void stopRecording()
      else setStartPrompt({ sourceApp })
    },
    [stopRecording]
  )

  const markMoment = useCallback(() => {
    const r = recRef.current
    if (!r) return
    const t = r.recorder.elapsed()
    api.addMark(r.meetingId, t, 'important').then(
      () => setBanner(`Marked ${fmtTime(t)} as important.`),
      (e) => setBanner(`Marking the moment failed: ${errMsg(e)}`)
    )
  }, [])

  useEvent('hotkey:record', (sourceApp: string) => toggleRecording(sourceApp || ''), [toggleRecording])
  useEvent('hotkey:mark', markMoment, [markMoment])
  useEvent('meeting:detected', (d: DetectedMeeting) => !recRef.current && setDetected(d))
  useEvent('meeting:ended', () => void stopRecording('The meeting app released the microphone.'), [stopRecording])
  useEvent('navigate:meeting', (id: string) => setView({ kind: 'meeting', meetingId: id }))
  // the user chose "Stop recording and quit": save the recording, then let main quit
  useEvent('app:quit-requested', async () => {
    try {
      await stopRecording('MeetingBuddy is quitting.')
    } finally {
      window.mb.quitReady()
    }
  }, [stopRecording])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(null), 9000)
    return () => window.clearTimeout(t)
  }, [banner])

  const [meetingProjectId, setMeetingProjectId] = useState<string | null>(null)
  const currentProjectId = view.kind === 'project' ? view.projectId : view.kind === 'meeting' ? meetingProjectId : null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" /> MeetingBuddy
        </div>
        <div className="side-section">
          Projects
          <button className="btn ghost sm" title="New project" onClick={() => setNewProject(true)}>
            + New
          </button>
        </div>
        <div className="side-list">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`side-item ${currentProjectId === p.id ? 'active' : ''}`}
              onClick={() => setView({ kind: 'project', projectId: p.id })}
            >
              {p.name}
            </button>
          ))}
          {projects.length === 0 && (
            <div className="muted small" style={{ padding: 10 }}>
              No projects yet.
            </div>
          )}
        </div>
        <div className="side-footer">
          <button className={`btn ${rec ? 'rec' : 'primary'}`} onClick={() => toggleRecording()} disabled={!rec && projects.length === 0}>
            {rec ? '■ Stop recording' : '● Record meeting'}
          </button>
          <div className="muted small" style={{ textAlign: 'center' }}>
            <span className="kbd">{settings?.hotkeyRecord.replace('CommandOrControl', 'Ctrl') ?? ''}</span>
          </div>
          <button className={`side-item ${view.kind === 'settings' ? 'active' : ''}`} onClick={() => setView({ kind: 'settings' })}>
            ⚙ Settings
          </button>
        </div>
      </aside>

      <main className="main">
        {rec && (
          <div className="recbar">
            <span className="recdot" data-essential-motion />
            <b>Recording</b>
            <span className="muted">{rec.title}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(rec.recorder.elapsed())}</span>
            <span className="grow" />
            <button className="btn sm" onClick={() => setView({ kind: 'meeting', meetingId: rec.meetingId })}>
              Live transcript
            </button>
            <button className="btn sm" onClick={markMoment} title={settings?.hotkeyMark}>
              ★ Mark moment
            </button>
            <button className="btn sm rec" onClick={() => void stopRecording()}>
              ■ Stop
            </button>
          </div>
        )}
        {detected && !rec && (
          <div className="banner">
            <b>Meeting detected:</b> {detected.app}
            <span className="grow" />
            <button className="btn sm primary" onClick={() => setStartPrompt({ sourceApp: detected.app })}>
              Record
            </button>
            <button className="btn sm ghost" onClick={() => setDetected(null)}>
              Ignore
            </button>
          </div>
        )}
        {banner && (
          <div className="banner">
            <span className="grow">{banner}</span>
            <button className="btn sm ghost" onClick={() => setBanner(null)}>
              ✕
            </button>
          </div>
        )}
        <div className="content">
          {view.kind === 'home' && (
            <div className="empty">
              <h2>Welcome to MeetingBuddy</h2>
              <p>
                Create a project, add what you already know (requirements, decisions, tasks, risks, deadlines), then record or import a
                meeting.
              </p>
              <p>
                MeetingBuddy will tell you <b>what changed in the project because of the meeting</b>.
              </p>
              <button className="btn primary" onClick={() => setNewProject(true)}>
                Create your first project
              </button>
            </div>
          )}
          {view.kind === 'project' && (
            <ProjectView
              key={view.projectId}
              projectId={view.projectId}
              initialTab={view.tab}
              onOpenMeeting={(id) => setView({ kind: 'meeting', meetingId: id })}
              onRecord={() => setStartPrompt({ sourceApp: '' })}
              onProjectsChanged={async (deletedId) => {
                const ps = await loadProjects()
                if (deletedId) setView(ps[0] ? { kind: 'project', projectId: ps[0].id } : { kind: 'home' })
              }}
            />
          )}
          {view.kind === 'meeting' && (
            <MeetingView
              key={view.meetingId}
              meetingId={view.meetingId}
              live={rec?.meetingId === view.meetingId}
              onLoaded={setMeetingProjectId}
              onBack={(projectId) => setView({ kind: 'project', projectId, tab: 'meetings' })}
              onOpenProject={(projectId) => setView({ kind: 'project', projectId, tab: 'board' })}
            />
          )}
          {view.kind === 'settings' && <SettingsView onSaved={setSettings} />}
        </div>
      </main>

      {startPrompt && (
        <StartRecordingModal
          projects={projects}
          sourceApp={startPrompt.sourceApp}
          defaultProjectId={currentProjectId ?? localStorage.getItem(LAST_PROJECT) ?? projects[0]?.id}
          onClose={() => setStartPrompt(null)}
          onStart={async (pid, title) => {
            await startRecording(pid, title, startPrompt.sourceApp)
            setStartPrompt(null)
          }}
        />
      )}
      {newProject && (
        <NewProjectModal
          onClose={() => setNewProject(false)}
          onCreated={async (p) => {
            setNewProject(false)
            await loadProjects()
            setView({ kind: 'project', projectId: p.id, tab: 'board' })
          }}
        />
      )}
    </div>
  )
}

function StartRecordingModal(props: {
  projects: Project[]
  sourceApp: string
  defaultProjectId?: string
  onClose: () => void
  onStart: (projectId: string, title: string) => Promise<void>
}) {
  const [pid, setPid] = useState(props.defaultProjectId ?? '')
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const [title, setTitle] = useState(`${props.sourceApp ? `${props.sourceApp.replace(/ \(.*\)/, '')} meeting` : 'Meeting'} · ${today}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (props.projects.length === 0)
    return (
      <Modal title="Record meeting" onClose={props.onClose}>
        <p>Create a project first, so MeetingBuddy knows which project this meeting belongs to.</p>
      </Modal>
    )

  return (
    <Modal
      title="Record meeting"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button
            className="btn rec"
            disabled={busy || !pid}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await props.onStart(pid, title.trim() || 'Meeting')
              } catch (e) {
                setError(errMsg(e))
                setBusy(false)
              }
            }}
          >
            ● Start recording
          </button>
        </>
      }
    >
      <Field label="Project">
        <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
          {props.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Meeting title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />
      </Field>
      <p className="muted small">
        MeetingBuddy records your microphone and your computer's audio output (the other participants), with no bot joining the call. Let
        participants know the meeting is being recorded.
      </p>
      <ErrorBox error={error} />
    </Modal>
  )
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const { run, busy, error } = useAction()
  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!name.trim() || busy}
            onClick={() => void run(async () => onCreated(await api.createProject(name.trim(), desc.trim())))}
          >
            Create
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
      </Field>
      <Field label="Description, goals and context">
        <textarea
          className="input"
          rows={5}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What is this project? Who is it for? What does success look like?"
        />
      </Field>
      <ErrorBox error={error} />
    </Modal>
  )
}
