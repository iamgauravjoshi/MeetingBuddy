import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// userData lives in a temp folder; the rest of Electron is stubbed out
const userData = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const { join } = require('node:path') as typeof import('node:path')
  return mkdtempSync(join(tmpdir(), 'mb-userdata-'))
})
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false },
  dialog: {}
}))
vi.mock('../src/main/settings', () => ({ getSettings: () => ({ sttProvider: 'none' }) }))
vi.mock('../src/main/llm', () => ({}))

import * as db from '../src/main/db'
import { api, removeOrphanedAudio } from '../src/main/api'

const audio = (meetingId: string): string => join(userData, 'audio', meetingId)
const record = (projectId: string, title: string): string => {
  const m = api.startRecording(projectId, title, '')
  api.saveRecordingFile(m.id, 'mic', new Uint8Array([1, 2, 3]))
  return m.id
}

describe('deleting meetings removes their audio', () => {
  beforeAll(() => db.openDb(':memory:'))
  afterAll(() => rmSync(userData, { recursive: true, force: true }))

  it('deleteMeeting removes the recording folder', () => {
    const p = db.createProject('P', '')
    const id = record(p.id, 'Standup')
    expect(existsSync(join(audio(id), 'mic.webm'))).toBe(true)

    api.deleteMeeting(id)

    expect(db.getMeeting(id)).toBeNull()
    expect(existsSync(audio(id))).toBe(false)
  })

  it('deleteProject removes the audio of every meeting in it', () => {
    const p = db.createProject('Q', '')
    const other = db.createProject('Other', '')
    const a = record(p.id, 'One')
    const b = record(p.id, 'Two')
    const keep = record(other.id, 'Elsewhere')

    api.deleteProject(p.id)

    expect(existsSync(audio(a))).toBe(false)
    expect(existsSync(audio(b))).toBe(false)
    expect(existsSync(join(audio(keep), 'mic.webm'))).toBe(true)
  })

  it('removeOrphanedAudio deletes folders whose meeting is gone', () => {
    const p = db.createProject('R', '')
    const live = record(p.id, 'Live')
    const orphan = '0b5f7d3e-1c2a-4f6b-9a8d-7e6c5b4a3f21'
    mkdirSync(audio(orphan), { recursive: true })
    writeFileSync(join(audio(orphan), 'system.webm'), 'old')

    removeOrphanedAudio()

    expect(existsSync(audio(orphan))).toBe(false)
    expect(existsSync(join(audio(live), 'mic.webm'))).toBe(true)
  })

  it('refuses to write recordings for ids that are not meeting UUIDs', () => {
    expect(() => api.saveRecordingFile('..', 'mic', new Uint8Array([1]))).toThrow()
  })
})
