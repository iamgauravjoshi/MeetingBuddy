import { useEffect, useState } from 'react'
import { DEFAULT_MODELS, type LlmProvider, type Settings, type SttProvider } from '@shared/types'
import { api, errMsg } from './api'
import { ErrorBox, Field } from './ui'

const LLM_PROVIDERS: { id: LlmProvider; label: string; hint: string }[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', hint: 'Key from console.anthropic.com' },
  { id: 'openai', label: 'OpenAI', hint: 'Key from platform.openai.com' },
  { id: 'google', label: 'Google Gemini', hint: 'Key from aistudio.google.com' },
  { id: 'openrouter', label: 'OpenRouter (any model)', hint: 'Key from openrouter.ai; model e.g. anthropic/claude-sonnet-5.5' },
  { id: 'ollama', label: 'Ollama (local, free, private)', hint: 'Runs on your machine. Install Ollama and pull a model first.' },
  { id: 'openai-compatible', label: 'Other OpenAI-compatible (LM Studio, vLLM…)', hint: 'Set the base URL, e.g. http://localhost:1234/v1' }
]

const STT_PROVIDERS: { id: SttProvider; label: string; hint: string }[] = [
  { id: 'none', label: 'None (import transcripts manually)', hint: '' },
  { id: 'deepgram', label: 'Deepgram (recommended: separates speakers)', hint: 'Key from console.deepgram.com · default model nova-3' },
  { id: 'openai', label: 'OpenAI Whisper', hint: 'Default model whisper-1 · no speaker separation' },
  { id: 'groq', label: 'Groq Whisper (fast, cheap)', hint: 'Default model whisper-large-v3-turbo · no speaker separation' }
]

export function SettingsView({ onSaved }: { onSaved: (s: Settings) => void }) {
  const [s, setS] = useState<Settings | null>(null)
  const [llmKey, setLlmKey] = useState('')
  const [sttKey, setSttKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => void api.getSettings().then(setS), [])
  if (!s) return null

  const update = (patch: Partial<Settings>): void => setS({ ...s, ...patch })

  const save = async (): Promise<Settings> => {
    setError(null)
    const { hasKey: _k, ...rest } = s
    let next = await api.saveSettings(rest)
    if (llmKey) next = await api.setSecret(s.llmProvider, llmKey.trim())
    if (sttKey && s.sttProvider !== 'none') next = await api.setSecret(s.sttProvider, sttKey.trim())
    setLlmKey('')
    setSttKey('')
    await window.mb.applyHotkeys()
    setS(next)
    onSaved(next)
    return next
  }

  const llm = LLM_PROVIDERS.find((p) => p.id === s.llmProvider)!
  const stt = STT_PROVIDERS.find((p) => p.id === s.sttProvider)!

  return (
    <div className="col" style={{ gap: 16, maxWidth: 720 }}>
      <h1>Settings</h1>

      <div className="card col">
        <h2>AI model for impact analysis</h2>
        <p className="muted small">Bring your own key. Keys are encrypted with Windows' built-in protection and never leave this computer, except in requests to the provider you choose.</p>
        <Field label="Provider">
          <select
            className="input"
            value={s.llmProvider}
            onChange={(e) => {
              const p = e.target.value as LlmProvider
              update({ llmProvider: p, llmModel: DEFAULT_MODELS[p] })
            }}
          >
            {LLM_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <div className="muted small">{llm.hint}</div>
        <Field label="Model"><input className="input" value={s.llmModel} onChange={(e) => update({ llmModel: e.target.value })} /></Field>
        {(s.llmProvider === 'ollama' || s.llmProvider === 'openai-compatible') && (
          <Field label="Base URL">
            <input className="input" value={s.llmBaseUrl} placeholder={s.llmProvider === 'ollama' ? 'http://localhost:11434/v1' : 'http://localhost:1234/v1'} onChange={(e) => update({ llmBaseUrl: e.target.value })} />
          </Field>
        )}
        {s.llmProvider !== 'ollama' && (
          <Field label={`API key ${s.hasKey[s.llmProvider] ? '(saved; leave blank to keep it)' : ''}`}>
            <input className="input" type="password" value={llmKey} onChange={(e) => setLlmKey(e.target.value)} placeholder={s.hasKey[s.llmProvider] ? '••••••••' : 'Paste key'} />
          </Field>
        )}
        <div className="row">
          <button
            className="btn"
            disabled={testing}
            onClick={async () => {
              setTesting(true)
              setMsg(null)
              try {
                await save()
                setMsg(await api.testLlm())
              } catch (e) {
                setError(errMsg(e))
              } finally {
                setTesting(false)
              }
            }}
          >
            {testing ? 'Testing…' : 'Save & test connection'}
          </button>
          {s.hasKey[s.llmProvider] && (
            <button className="btn ghost sm" onClick={async () => setS(await api.setSecret(s.llmProvider, ''))}>Remove saved key</button>
          )}
        </div>
      </div>

      <div className="card col">
        <h2>Speech-to-text</h2>
        <Field label="Provider">
          <select className="input" value={s.sttProvider} onChange={(e) => update({ sttProvider: e.target.value as SttProvider, sttModel: '' })}>
            {STT_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        {stt.hint && <div className="muted small">{stt.hint}</div>}
        {s.sttProvider !== 'none' && (
          <>
            <Field label="Model (blank = default)"><input className="input" value={s.sttModel} onChange={(e) => update({ sttModel: e.target.value })} /></Field>
            <Field label={`API key ${s.hasKey[s.sttProvider] ? '(saved; leave blank to keep it)' : ''}`}>
              <input className="input" type="password" value={sttKey} onChange={(e) => setSttKey(e.target.value)} placeholder={s.hasKey[s.sttProvider] ? '••••••••' : 'Paste key'} />
            </Field>
            <Field label="Live transcript chunk length in seconds (0 = no live transcript; transcribe only after the meeting)">
              <input className="input" type="number" min={0} max={120} value={s.chunkSeconds} onChange={(e) => update({ chunkSeconds: Math.max(0, Number(e.target.value)) })} />
            </Field>
          </>
        )}
        <Field label="Your name (label for your microphone)">
          <input className="input" value={s.selfName} onChange={(e) => update({ selfName: e.target.value })} />
        </Field>
      </div>

      <div className="card col">
        <h2>Meeting detection & hotkeys</h2>
        <label className="row">
          <input type="checkbox" checked={s.autoDetect} onChange={(e) => update({ autoDetect: e.target.checked })} />
          Detect meetings automatically (Zoom, Teams, Meet in the browser, Slack, Discord, Webex…) and offer to record
        </label>
        <div className="row">
          <div className="grow"><Field label="Start / stop recording"><input className="input" value={s.hotkeyRecord} onChange={(e) => update({ hotkeyRecord: e.target.value })} /></Field></div>
          <div className="grow"><Field label="Mark important moment"><input className="input" value={s.hotkeyMark} onChange={(e) => update({ hotkeyMark: e.target.value })} /></Field></div>
        </div>
        <div className="muted small">Format: Electron accelerators, e.g. CommandOrControl+Shift+M or Alt+F9. Hotkeys work even when MeetingBuddy is in the tray.</div>
      </div>

      <div className="row">
        <button
          className="btn primary"
          onClick={async () => {
            try {
              await save()
              setMsg('Settings saved.')
            } catch (e) {
              setError(errMsg(e))
            }
          }}
        >
          Save settings
        </button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      <ErrorBox error={error} />
    </div>
  )
}
