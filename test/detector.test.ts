import { describe, expect, it } from 'vitest'
import { MeetingDetector, parseMicUsers } from '../src/main/detector'

const KEY = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged'
const ZOOM = `${KEY}\\C:#Users#me#AppData#Roaming#Zoom#bin#Zoom.exe`
const TEAMS = `${KEY}\\C:#Program Files#WindowsApps#MSTeams#ms-teams.exe`

// shape of `reg query ... /s` output: a key line, then its values
const REG_OUTPUT = [
  `${ZOOM}`,
  '    LastUsedTimeStart    REG_QWORD    0x1db1234567890ab',
  '    LastUsedTimeStop    REG_QWORD    0x0',
  '',
  `${TEAMS}`,
  '    LastUsedTimeStart    REG_QWORD    0x1db1234567890ab',
  '    LastUsedTimeStop    REG_QWORD    0x1db1234567899ff',
  '',
  `${KEY}\\C:#Tools#never-started.exe`,
  '    LastUsedTimeStop    REG_QWORD    0x0',
  ''
].join('\r\n')

describe('parseMicUsers', () => {
  it('lists apps that started using the mic and have not stopped', () => {
    expect(parseMicUsers(REG_OUTPUT)).toEqual([ZOOM])
  })
  it('handles empty output', () => {
    expect(parseMicUsers('')).toEqual([])
  })
})

// a detector driven by a scripted mic state and a fake clock
function harness(graceMs = 10_000) {
  let users: string[] = []
  let clock = 0
  const events: string[] = []
  const detector = new MeetingDetector({ poll: async () => users, now: () => clock, graceMs })
  detector.on('start', (d) => events.push(`start:${d.app}`))
  detector.on('end', () => events.push('end'))
  const at = async (ms: number, micUsers: string[]): Promise<void> => {
    clock = ms
    users = micUsers
    await detector.check()
  }
  return { detector, events, at }
}

describe('MeetingDetector', () => {
  it('reports a meeting app that starts using the mic once', async () => {
    const { events, at } = harness()
    await at(0, [ZOOM])
    await at(4_000, [ZOOM])
    expect(events).toEqual(['start:Zoom'])
  })

  it('ignores a short mic release, such as switching audio devices', async () => {
    const { events, at } = harness()
    await at(0, [ZOOM])
    await at(4_000, [])
    await at(8_000, [])
    await at(12_000, [ZOOM])
    await at(30_000, [ZOOM])
    expect(events).toEqual(['start:Zoom'])
  })

  it('ends the meeting once the mic has been released for the grace period', async () => {
    const { events, at } = harness()
    await at(0, [ZOOM])
    await at(4_000, [])
    await at(8_000, [])
    expect(events).toEqual(['start:Zoom'])
    await at(14_000, [])
    await at(18_000, [])
    expect(events).toEqual(['start:Zoom', 'end'])
  })

  it('does not run a second check while one is still waiting for the registry', async () => {
    let calls = 0
    let release!: (users: string[]) => void
    const detector = new MeetingDetector({
      poll: () => {
        calls++
        return new Promise((r) => (release = r))
      }
    })
    const first = detector.check()
    await detector.check()
    expect(calls).toBe(1)
    release([])
    await first
  })
})
