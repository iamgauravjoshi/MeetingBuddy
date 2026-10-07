import { app, BrowserWindow, dialog, Notification } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Item, LlmProvider, Proposal, Settings, Stakeholder, SttProvider } from '@shared/types'
import * as db from './db'
import { analyzeMeeting, applyApproved } from './analysis'
import { getSettings, saveSettings, setSecret } from './settings'
import { mergeStreams, transcribe } from './stt'
import { parseTranscript } from './transcriptParser'
import { getModel } from './llm'
import { deleteMeetingAudio, meetingAudioDir, sweepOrphanedAudio } from './audio'
import { generateText } from 'ai'

const audioRoot = (): string => join(app.getPath('userData'), 'audio')
const audioDir = (meetingId: string): string => meetingAudioDir(audioRoot(), meetingId)

/** Startup cleanup: deletes recordings whose meeting was deleted (e.g. by an older version that kept them). */
export function removeOrphanedAudio(): void {
  sweepOrphanedAudio(audioRoot(), new Set(db.listMeetingIds()))
}

function deleteMeeting(meetingId: string): void {
  db.deleteMeeting(meetingId)
  deleteMeetingAudio(audioRoot(), meetingId)
}

/** Sends an event to every renderer window. */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, ...args)
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  if (onClick) n.on('click', onClick)
  n.show()
}

export let showMainWindow: () => void = () => {}
export function setShowMainWindow(fn: () => void): void {
  showMainWindow = fn
}

/** After a meeting: final transcription of the full recordings, then automatic impact analysis. */
async function finishMeeting(meetingId: string): Promise<void> {
  const s = getSettings()
  const dir = audioDir(meetingId)
  try {
    if (s.sttProvider !== 'none') {
      db.updateMeeting(meetingId, { status: 'transcribing' })
      broadcast('meeting:changed', meetingId)
      const read = (f: string): Buffer | null => (existsSync(join(dir, f)) ? readFileSync(join(dir, f)) : null)
      const micBuf = read('mic.webm')
      const sysBuf = read('system.webm')
      const [mic, sys] = await Promise.all([
        micBuf ? transcribe(s, micBuf, 'audio/webm', 'mic', 0) : Promise.resolve([]),
        sysBuf ? transcribe(s, sysBuf, 'audio/webm', 'system', 0) : Promise.resolve([])
      ])
      const merged = mergeStreams(mic, sys)
      if (merged.length) {
        // the full-file pass replaces the live (chunked) preview segments
        db.tx(() => db.deleteSegments(meetingId, ['mic', 'system']))
        db.addSegments(meetingId, merged)
      }
    }
    db.updateMeeting(meetingId, { status: 'ready' })
    broadcast('meeting:changed', meetingId)

    if (db.listSegments(meetingId).length === 0) {
      notify('MeetingBuddy', 'Recording saved, but no transcript was produced. Paste or upload one in the meeting page.', showMainWindow)
      return
    }
    const rep = await analyzeMeeting(meetingId)
    broadcast('meeting:changed', meetingId)
    const n = rep?.proposals.length ?? 0
    const conflicts = rep?.proposals.filter((p) => p.category === 'conflict').length ?? 0
    notify(
      'Meeting Impact Report ready',
      `${n} proposed change${n === 1 ? '' : 's'}${conflicts ? `, ${conflicts} conflict${conflicts === 1 ? '' : 's'}` : ''}. Click to review.`,
      () => {
        showMainWindow()
        broadcast('navigate:meeting', meetingId)
      }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (db.getMeeting(meetingId)?.status === 'transcribing') db.updateMeeting(meetingId, { status: 'ready' })
    broadcast('meeting:changed', meetingId)
    notify('MeetingBuddy: processing failed', msg, showMainWindow)
  }
}

// Everything the renderer can call. Each key becomes an IPC channel `api:<key>`.
export const api = {
  // settings
  getSettings: (): Settings => getSettings(),
  saveSettings: (patch: Partial<Omit<Settings, 'hasKey'>>): Settings => saveSettings(patch),
  setSecret: (name: LlmProvider | SttProvider, value: string): Settings => {
    setSecret(name, value)
    return getSettings()
  },
  testLlm: async (): Promise<string> => {
    const { model, label } = getModel(getSettings())
    const r = await generateText({ model, prompt: 'Reply with exactly: OK', maxRetries: 0 })
    return `${label} replied: ${r.text.trim().slice(0, 80)}`
  },

  // projects
  listProjects: () => db.listProjects(),
  getProject: (id: string) => db.getProject(id),
  createProject: (name: string, description: string) => db.createProject(name, description),
  updateProject: (id: string, name: string, description: string) => db.updateProject(id, name, description),
  deleteProject: (id: string) => {
    // the cascade removes the meeting rows, so collect their ids first to delete their audio
    const meetingIds = db.listMeetings(id).map((m) => m.id)
    db.deleteProject(id)
    for (const mid of meetingIds) deleteMeetingAudio(audioRoot(), mid)
  },

  listStakeholders: (projectId: string) => db.listStakeholders(projectId),
  upsertStakeholder: (s: Omit<Stakeholder, 'id'> & { id?: string }) => db.upsertStakeholder(s),
  deleteStakeholder: (id: string) => db.deleteStakeholder(id),

  listItems: (projectId: string) => db.listItems(projectId),
  createItem: (i: Pick<Item, 'projectId' | 'type' | 'title' | 'body' | 'owner' | 'dueDate'>) => {
    const it = db.createItem(i)
    db.addItemHistory({ itemId: it.id, meetingId: null, summary: 'Created manually', speaker: '', quote: '' })
    return it
  },
  updateItem: (id: string, patch: Partial<Pick<Item, 'title' | 'body' | 'status' | 'owner' | 'dueDate' | 'type'>>) => {
    const it = db.updateItem(id, patch)
    db.addItemHistory({ itemId: id, meetingId: null, summary: `Edited manually: ${Object.keys(patch).join(', ')}`, speaker: '', quote: '' })
    return it
  },
  deleteItem: (id: string) => db.deleteItem(id),
  getItemHistory: (id: string) => db.getItemHistory(id),
  listStateVersions: (projectId: string) => db.listStateVersions(projectId),

  // meetings
  listMeetings: (projectId: string) => db.listMeetings(projectId),
  getMeeting: (id: string) => db.getMeeting(id),
  renameMeeting: (id: string, title: string) => db.updateMeeting(id, { title }),
  deleteMeeting: (id: string) => deleteMeeting(id),
  getTranscript: (id: string) => ({ segments: db.listSegments(id), marks: db.listMarks(id) }),
  renameSpeaker: (meetingId: string, from: string, to: string) => db.renameSpeaker(meetingId, from, to),

  /** Creates a meeting from pasted or uploaded transcript text. */
  importTranscript: (projectId: string, title: string, text: string) => {
    const segs = parseTranscript(text)
    if (segs.length === 0) throw new Error('Could not find any transcript lines in that text.')
    const m = db.createMeeting(projectId, title, 'ready', 'import')
    db.addSegments(m.id, segs)
    return m
  },
  pickTranscriptFile: async (): Promise<{ name: string; text: string } | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Transcripts', extensions: ['txt', 'vtt', 'srt', 'md'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    return { name: p.split(/[\\/]/).pop() ?? 'Transcript', text: readFileSync(p, 'utf8') }
  },
  /** Creates a meeting from an audio/video recording file (needs a speech-to-text provider). */
  importAudio: async (projectId: string): Promise<string | null> => {
    const s = getSettings()
    if (s.sttProvider === 'none') throw new Error('Choose a speech-to-text provider in Settings first.')
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio / video', extensions: ['mp3', 'm4a', 'wav', 'webm', 'ogg', 'mp4', 'mkv'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    const ext = p.split('.').pop()!.toLowerCase()
    const mime = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'video/mp4', mkv: 'video/x-matroska' }[ext] ?? 'application/octet-stream'
    const segs = await transcribe(s, readFileSync(p), mime, 'system', 0)
    if (segs.length === 0) throw new Error('No speech was found in that file.')
    const m = db.createMeeting(projectId, p.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, ''), 'ready', 'import')
    db.addSegments(m.id, segs)
    return m.id
  },

  // live recording (audio capture runs in the renderer; it hands chunks to these handlers)
  startRecording: (projectId: string, title: string, sourceApp: string) => {
    const m = db.createMeeting(projectId, title, 'recording', sourceApp)
    mkdirSync(audioDir(m.id), { recursive: true })
    broadcast('recording:changed', { active: true, meetingId: m.id, projectId, startedAt: Date.now() })
    return m
  },
  /** Live preview: transcribe a ~30 s chunk and append it to the transcript. */
  recordingChunk: async (meetingId: string, source: 'mic' | 'system', offsetSec: number, data: Uint8Array) => {
    const s = getSettings()
    if (s.sttProvider === 'none') return []
    const segs = await transcribe(s, Buffer.from(data), 'audio/webm', source, offsetSec)
    if (segs.length === 0) return []
    const added = db.addSegments(meetingId, segs)
    broadcast('transcript:appended', meetingId, added)
    return added
  },
  saveRecordingFile: (meetingId: string, source: 'mic' | 'system', data: Uint8Array) => {
    writeFileSync(join(audioDir(meetingId), `${source}.webm`), Buffer.from(data))
  },
  addMark: (meetingId: string, t: number, kind: string) => db.addMark(meetingId, t, kind),
  stopRecording: (meetingId: string) => {
    db.updateMeeting(meetingId, { endedAt: new Date().toISOString(), status: 'transcribing' })
    broadcast('recording:changed', { active: false, meetingId: null, projectId: null, startedAt: null })
    void finishMeeting(meetingId)
  },

  // analysis & approval
  analyzeMeeting: (meetingId: string) => analyzeMeeting(meetingId),
  getReport: (meetingId: string) => db.getReport(meetingId),
  updateProposal: (id: string, patch: Partial<Pick<Proposal, 'status' | 'title' | 'body' | 'owner' | 'dueDate' | 'itemType'>>) =>
    db.updateProposal(id, patch),
  applyApproved: (meetingId: string) => applyApproved(meetingId)
}

export type Api = typeof api
