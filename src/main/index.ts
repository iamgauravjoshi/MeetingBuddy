import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, Menu, nativeImage, Notification, session, shell, Tray } from 'electron'
import { join } from 'node:path'
import { openDb } from './db'
import { api, broadcast, removeOrphanedAudio, setShowMainWindow } from './api'
import { MeetingDetector } from './detector'
import { getSettings } from './settings'
import type { DetectedMeeting, RecordingState } from '@shared/types'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let recording: RecordingState = { active: false, meetingId: null, projectId: null, startedAt: null }
const detector = new MeetingDetector()

if (!app.requestSingleInstanceLock()) app.quit()

function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'MeetingBuddy',
    backgroundColor: '#0f1115',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      // recording runs in this window, so it must keep running while hidden in the tray
      backgroundThrottling: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  // closing the window keeps the app alive in the tray so meeting detection keeps working
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function trayIcon(active: boolean): Electron.NativeImage {
  // simple generated 16x16 dot icon: red while recording, blue otherwise
  const color = active ? '#e5484d' : '#4f7cff'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="13" fill="${color}"/><rect x="12" y="8" width="8" height="12" rx="4" fill="white"/><path d="M10 16a6 6 0 0 0 12 0" stroke="white" stroke-width="2" fill="none"/><rect x="15" y="22" width="2" height="4" fill="white"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 16, height: 16 })
}

function refreshTray(): void {
  if (!tray) return
  const s = getSettings()
  tray.setImage(trayIcon(recording.active))
  tray.setToolTip(recording.active ? 'MeetingBuddy: recording' : 'MeetingBuddy')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open MeetingBuddy', click: showWindow },
      {
        label: recording.active ? 'Stop recording' : 'Start recording…',
        accelerator: s.hotkeyRecord,
        click: () => toggleRecording()
      },
      { label: 'Mark important moment', accelerator: s.hotkeyMark, enabled: recording.active, click: () => broadcast('hotkey:mark') },
      { type: 'separator' },
      {
        label: 'Detect meetings automatically',
        type: 'checkbox',
        checked: s.autoDetect,
        click: (mi) => {
          api.saveSettings({ autoDetect: mi.checked })
          applyDetector()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function toggleRecording(source = ''): void {
  // the renderer owns audio capture; it either stops, or shows the "start recording" prompt
  showWindowIfNeeded()
  broadcast('hotkey:record', source)
}
function showWindowIfNeeded(): void {
  if (!recording.active) showWindow()
}

function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  const s = getSettings()
  const tryReg = (acc: string, fn: () => void): void => {
    try {
      if (acc && !globalShortcut.register(acc, fn)) console.warn(`Hotkey ${acc} is taken by another app`)
    } catch (e) {
      console.warn(`Invalid hotkey ${acc}`, e)
    }
  }
  tryReg(s.hotkeyRecord, () => toggleRecording())
  tryReg(s.hotkeyMark, () => broadcast('hotkey:mark'))
}

function applyDetector(): void {
  if (getSettings().autoDetect) detector.start()
  else detector.stop()
}

detector.on('start', (d: DetectedMeeting) => {
  if (recording.active) return
  broadcast('meeting:detected', d)
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: `Meeting detected: ${d.app}`,
    body: 'Click to record it and track what changes in your project.'
  })
  n.on('click', () => {
    showWindow()
    broadcast('hotkey:record', d.app)
  })
  n.show()
})
detector.on('end', () => {
  if (recording.active) broadcast('meeting:ended')
})

app.on('second-instance', showWindow)

app.whenReady().then(() => {
  app.setAppUserModelId('com.meetingbuddy.app')
  openDb(join(app.getPath('userData'), 'meetingbuddy.db'))
  try {
    removeOrphanedAudio()
  } catch (e) {
    console.warn('Could not remove orphaned recordings', e)
  }
  setShowMainWindow(showWindow)

  for (const [name, fn] of Object.entries(api)) {
    ipcMain.handle(`api:${name}`, (_e, ...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args))
  }
  ipcMain.on('recording:state', (_e, s: RecordingState) => {
    recording = s
    refreshTray()
  })
  ipcMain.handle('app:applyHotkeys', () => {
    registerHotkeys()
    refreshTray()
    applyDetector()
  })

  // System-audio capture: getDisplayMedia() in the renderer gets the screen's loopback audio
  // (everything the speakers play: Zoom, Teams, Meet, Slack...). The video track is discarded.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_req, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
        .catch(() => callback({}))
    },
    { useSystemPicker: false }
  )

  createWindow()
  tray = new Tray(trayIcon(false))
  tray.on('click', showWindow)
  refreshTray()
  registerHotkeys()
  applyDetector()
})

app.on('before-quit', () => {
  quitting = true
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  detector.stop()
})
app.on('window-all-closed', () => {
  // stay in the tray
})
