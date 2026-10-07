import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { DetectedMeeting } from '@shared/types'

const MIC_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone'

const KNOWN_APPS: [RegExp, string][] = [
  [/zoom/i, 'Zoom'],
  [/teams|slimcore/i, 'Microsoft Teams'],
  [/webex|ciscocollab/i, 'Webex'],
  [/slack/i, 'Slack'],
  [/discord/i, 'Discord'],
  [/skype/i, 'Skype'],
  [/whatsapp/i, 'WhatsApp'],
  [/telegram/i, 'Telegram'],
  [/gotomeeting|g2m/i, 'GoTo Meeting'],
  [/chrome|msedge|firefox|brave|opera|vivaldi|arc\.exe/i, 'Browser call (Google Meet / web)']
]
const IGNORE = /meetingbuddy|electron\.exe/i

/** Returns registry key names of apps that are using the microphone right now. */
function micUsers(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('reg', ['query', MIC_KEY, '/s'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve([])
      const active: string[] = []
      let key = ''
      let started = false
      let stop: string | null = null
      const flush = (): void => {
        if (key && started && stop !== null && /^0x0+$/i.test(stop)) active.push(key)
      }
      for (const line of stdout.split(/\r?\n/)) {
        if (line.startsWith('HKEY_')) {
          flush()
          key = line.trim()
          started = false
          stop = null
        } else {
          const m = line.trim().match(/^(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+(\S+)/)
          if (m?.[1] === 'LastUsedTimeStart') started = true
          if (m?.[1] === 'LastUsedTimeStop') stop = m[2]
        }
      }
      flush()
      resolve(active)
    })
  })
}

function identify(regKey: string): DetectedMeeting | null {
  const exe = regKey.split(/[\\#]/).filter(Boolean).pop() ?? regKey
  if (IGNORE.test(regKey)) return null
  const hit = KNOWN_APPS.find(([re]) => re.test(regKey))
  return hit ? { app: hit[1], exe } : null
}

/**
 * Detects meetings without a bot: polls which apps are using the microphone (Windows privacy registry).
 * Emits 'start' (DetectedMeeting) when a meeting app grabs the mic and 'end' when every one releases it.
 */
export class MeetingDetector extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private current = new Map<string, DetectedMeeting>()

  start(intervalMs = 4000): void {
    if (process.platform !== 'win32' || this.timer) return
    const tick = async (): Promise<void> => {
      const users = await micUsers()
      const now = new Map<string, DetectedMeeting>()
      for (const k of users) {
        const d = identify(k)
        if (d) now.set(k, d)
      }
      for (const [k, d] of now) if (!this.current.has(k)) this.emit('start', d)
      if (this.current.size > 0 && now.size === 0) this.emit('end')
      this.current = now
    }
    void tick()
    this.timer = setInterval(() => void tick(), intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.current.clear()
  }

  active(): DetectedMeeting[] {
    return [...this.current.values()]
  }
}
