import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Recordings live in <userData>/audio/<meetingId>/{mic,system}.webm. These helpers take that
// audio root as a parameter so they stay free of Electron and can be tested on a temp folder.

const MEETING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The audio folder of one meeting. Throws for anything but a meeting UUID, so ids can't escape the root. */
export function meetingAudioDir(root: string, meetingId: string): string {
  if (!MEETING_ID.test(meetingId)) throw new Error(`Invalid meeting id: ${meetingId}`)
  return join(root, meetingId)
}

/** Deletes a meeting's recordings. Does nothing if it has none. */
export function deleteMeetingAudio(root: string, meetingId: string): void {
  rmSync(meetingAudioDir(root, meetingId), { recursive: true, force: true })
}

/** Deletes the audio folders of meetings that no longer exist and returns their ids. Entries that aren't meeting folders are left alone. */
export function sweepOrphanedAudio(root: string, meetingIds: Set<string>): string[] {
  if (!existsSync(root)) return []
  const orphans = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && MEETING_ID.test(e.name) && !meetingIds.has(e.name))
    .map((e) => e.name)
  for (const id of orphans) deleteMeetingAudio(root, id)
  return orphans
}
