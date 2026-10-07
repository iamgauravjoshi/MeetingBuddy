import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteMeetingAudio, meetingAudioDir, sweepOrphanedAudio } from '../src/main/audio'

let base = ''
let root = ''

// a meeting folder with a recording in it, like startRecording + saveRecordingFile leave behind
const recording = (id: string): string => {
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'mic.webm'), 'audio')
  return dir
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'mb-audio-'))
  root = join(base, 'audio')
  mkdirSync(root)
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('meetingAudioDir', () => {
  it('rejects ids that are not meeting UUIDs', () => {
    expect(() => meetingAudioDir(root, '..')).toThrow()
    expect(() => meetingAudioDir(root, '..\\..\\Windows')).toThrow()
  })
})

describe('deleteMeetingAudio', () => {
  it('removes the meeting folder and its recordings', () => {
    const id = randomUUID()
    const dir = recording(id)
    deleteMeetingAudio(root, id)
    expect(existsSync(dir)).toBe(false)
  })
  it('does nothing when the meeting has no audio', () => {
    expect(() => deleteMeetingAudio(root, randomUUID())).not.toThrow()
  })
  it('never deletes outside the audio folder', () => {
    writeFileSync(join(base, 'keep.txt'), 'x')
    expect(() => deleteMeetingAudio(root, '..')).toThrow()
    expect(existsSync(root)).toBe(true)
    expect(existsSync(join(base, 'keep.txt'))).toBe(true)
  })
})

describe('sweepOrphanedAudio', () => {
  it('deletes folders of meetings that no longer exist and keeps the rest', () => {
    const live = randomUUID()
    const orphan = randomUUID()
    recording(live)
    recording(orphan)
    mkdirSync(join(root, 'not-a-meeting'))

    const removed = sweepOrphanedAudio(root, new Set([live]))

    expect(removed).toEqual([orphan])
    expect(existsSync(join(root, live, 'mic.webm'))).toBe(true)
    expect(existsSync(join(root, orphan))).toBe(false)
    expect(existsSync(join(root, 'not-a-meeting'))).toBe(true)
  })
  it('does nothing when there is no audio folder yet', () => {
    expect(sweepOrphanedAudio(join(base, 'missing'), new Set())).toEqual([])
  })
})
