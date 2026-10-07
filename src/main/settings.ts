import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_MODELS, type LlmProvider, type Settings, type SttProvider } from '@shared/types'

type StoredSettings = Omit<Settings, 'hasKey'>
type SecretName = LlmProvider | SttProvider

const DEFAULTS: StoredSettings = {
  llmProvider: 'anthropic',
  llmModel: DEFAULT_MODELS.anthropic,
  llmBaseUrl: '',
  sttProvider: 'none',
  sttModel: '',
  autoDetect: true,
  hotkeyRecord: 'CommandOrControl+Shift+M',
  hotkeyMark: 'CommandOrControl+Shift+D',
  chunkSeconds: 30,
  selfName: 'Me'
}

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')
const secretsFile = (): string => join(app.getPath('userData'), 'secrets.json')

function readJson<T>(file: string, fallback: T): T {
  try {
    return existsSync(file) ? { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) } : fallback
  } catch {
    return fallback
  }
}

// API keys are encrypted with the OS credential store (DPAPI on Windows, Keychain on macOS)
// and never sent to the renderer.
function readSecrets(): Record<string, string> {
  return readJson<Record<string, string>>(secretsFile(), {})
}

export function getSecret(name: SecretName): string {
  const enc = readSecrets()[name]
  if (!enc) return ''
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return ''
  }
}

export function setSecret(name: SecretName, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is not available; cannot store API keys safely.')
  const secrets = readSecrets()
  if (value) secrets[name] = safeStorage.encryptString(value).toString('base64')
  else delete secrets[name]
  writeFileSync(secretsFile(), JSON.stringify(secrets, null, 2))
}

export function getSettings(): Settings {
  const s = readJson<StoredSettings>(settingsFile(), DEFAULTS)
  const secrets = readSecrets()
  const hasKey = Object.fromEntries(Object.keys(secrets).map((k) => [k, true]))
  return { ...s, hasKey }
}

export function saveSettings(patch: Partial<StoredSettings>): Settings {
  const { hasKey: _ignored, ...cur } = getSettings()
  writeFileSync(settingsFile(), JSON.stringify({ ...cur, ...patch }, null, 2))
  return getSettings()
}
