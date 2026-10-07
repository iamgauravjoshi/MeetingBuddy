import type { Segment, SegmentSource, Settings } from '@shared/types'
import { getSecret } from './settings'

export type RawSegment = Omit<Segment, 'id' | 'meetingId' | 'idx'>

const DEFAULT_STT_MODEL = { deepgram: 'nova-3', openai: 'whisper-1', groq: 'whisper-large-v3-turbo' } as const

/**
 * Transcribes one audio file (webm/opus from MediaRecorder).
 * The mic stream is always the local user; the system stream contains everyone else.
 */
export async function transcribe(
  s: Settings,
  audio: Buffer,
  mime: string,
  source: SegmentSource,
  offsetSec: number
): Promise<RawSegment[]> {
  if (s.sttProvider === 'none') return []
  const key = getSecret(s.sttProvider)
  if (!key) throw new Error(`No API key saved for speech-to-text provider "${s.sttProvider}".`)
  const model = s.sttModel || DEFAULT_STT_MODEL[s.sttProvider]
  const self = s.selfName || 'Me'

  if (s.sttProvider === 'deepgram') {
    const params = new URLSearchParams({ model, smart_format: 'true', punctuate: 'true', utterances: 'true', diarize: String(source === 'system') })
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': mime },
      body: new Uint8Array(audio)
    })
    if (!res.ok) throw new Error(`Deepgram error ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as { results?: { utterances?: { start: number; end: number; transcript: string; speaker?: number }[] } }
    return (json.results?.utterances ?? [])
      .filter((u) => u.transcript.trim())
      .map((u) => ({
        speaker: source === 'mic' ? self : `Speaker ${(u.speaker ?? 0) + 1}`,
        tStart: offsetSec + u.start,
        tEnd: offsetSec + u.end,
        text: u.transcript.trim(),
        source
      }))
  }

  // OpenAI-compatible Whisper endpoint (OpenAI or Groq): segments, but no diarization
  const base = s.sttProvider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1'
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), 'audio.webm')
  form.append('model', model)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  const res = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
  if (!res.ok) throw new Error(`${s.sttProvider} transcription error ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { text?: string; segments?: { start: number; end: number; text: string }[] }
  const segs = json.segments ?? (json.text ? [{ start: 0, end: 0, text: json.text }] : [])
  return segs
    .filter((g) => g.text.trim())
    .map((g) => ({ speaker: source === 'mic' ? self : 'Others', tStart: offsetSec + g.start, tEnd: offsetSec + g.end, text: g.text.trim(), source }))
}

const words = (t: string): string[] => t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean)

/**
 * Without headphones the mic also hears the speakers, so remote speech shows up twice.
 * Drop mic segments that mostly repeat an overlapping system segment.
 */
export function mergeStreams(mic: RawSegment[], system: RawSegment[]): RawSegment[] {
  const keptMic = mic.filter((m) => {
    const mw = words(m.text)
    if (mw.length === 0) return false
    return !system.some((sy) => {
      if (sy.tEnd + 2 < m.tStart || sy.tStart - 2 > m.tEnd) return false
      const sw = new Set(words(sy.text))
      return mw.filter((w) => sw.has(w)).length / mw.length > 0.6
    })
  })
  return [...keptMic, ...system].sort((a, b) => a.tStart - b.tStart)
}
