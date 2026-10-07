import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const userData = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const { join } = require('node:path') as typeof import('node:path')
  return mkdtempSync(join(tmpdir(), 'mb-settings-'))
})
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  // stand-in for DPAPI: reversible, but not plain text
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}))

import { getSecret, getSettings, saveSettings, setSecret } from '../src/main/settings'

const settingsFile = join(userData, 'settings.json')

beforeEach(() => {
  for (const f of readdirSync(userData)) rmSync(join(userData, f), { force: true })
})
afterAll(() => rmSync(userData, { recursive: true, force: true }))

describe('settings', () => {
  it('replaces invalid stored values with defaults when reading', () => {
    writeFileSync(settingsFile, JSON.stringify({ chunkSeconds: 1, llmProvider: 'bogus', selfName: 'Gaurav', llmBaseUrl: 'file:///C:/' }))
    expect(getSettings()).toMatchObject({ chunkSeconds: 30, llmProvider: 'anthropic', selfName: 'Gaurav', llmBaseUrl: '' })
  })

  it('ignores unknown keys in the stored file', () => {
    writeFileSync(settingsFile, JSON.stringify({ selfName: 'Gaurav', hasKey: { openai: true }, extra: 1 }))
    const s = getSettings() as unknown as Record<string, unknown>
    expect(s.extra).toBeUndefined()
    expect(s.hasKey).toEqual({})
  })

  it('writes the file atomically, leaving no temporary files', () => {
    saveSettings({ selfName: 'Gaurav', chunkSeconds: 0 })
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toMatchObject({ selfName: 'Gaurav', chunkSeconds: 0 })
    expect(readdirSync(userData)).toEqual(['settings.json'])
  })

  it('stores secrets encrypted and reports which ones exist', () => {
    setSecret('deepgram', 'dg-key')
    expect(readFileSync(join(userData, 'secrets.json'), 'utf8')).not.toContain('dg-key')
    expect(getSecret('deepgram')).toBe('dg-key')
    expect(getSettings().hasKey).toEqual({ deepgram: true })
    expect(readdirSync(userData).sort()).toEqual(['secrets.json'])
  })
})
