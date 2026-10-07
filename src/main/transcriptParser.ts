import type { RawSegment } from './stt'

const toSec = (t: string): number => {
  const parts = t.replace(',', '.').split(':').map(Number)
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

const TIME_RANGE = /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*((\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/
const SPEAKER_LINE = /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*)?([^:[\]]{1,40}?):\s+(.+)$/
const ZOOM_HEADER = /^\[(.+?)\]\s+(\d{1,2}:\d{2}(?::\d{2})?)$/

// "Decision: …", "Action item: …" and similar note labels look like "Name: text" but aren't speakers;
// such a line stays with whoever was speaking
const NOTE_LABELS = new Set([
  'action',
  'action item',
  'action items',
  'actions',
  'agenda',
  'answer',
  'attendees',
  'blocker',
  'blockers',
  'date',
  'deadline',
  'decision',
  'decisions',
  'due',
  'follow up',
  'follow-up',
  'fyi',
  'issue',
  'issues',
  'link',
  'location',
  'next step',
  'next steps',
  'note',
  'notes',
  'owner',
  'ps',
  'question',
  'questions',
  're',
  'risk',
  'risks',
  'status',
  'subject',
  'summary',
  'time',
  'tldr',
  'tl;dr',
  'to do',
  'todo',
  'topic',
  'update',
  'updates'
])
const isNoteLabel = (name: string): boolean => NOTE_LABELS.has(name.trim().toLowerCase())

/**
 * Parses common transcript exports:
 * - WebVTT (Teams / Zoom / Meet), including <v Speaker> voice tags
 * - SRT
 * - Zoom .txt ("[Name] 00:01:02" followed by text)
 * - plain "Name: text" or "[00:01] Name: text" lines
 */
export function parseTranscript(raw: string): RawSegment[] {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '')
  const lines = text.split('\n')
  const out: RawSegment[] = []

  const push = (speaker: string, body: string, t0: number | null, t1: number | null): void => {
    const clean = body.replace(/<[^>]+>/g, '').trim()
    if (!clean) return
    const prev = out[out.length - 1]
    const start = t0 ?? (prev ? prev.tEnd : 0)
    const end = t1 ?? start + Math.max(3, clean.split(/\s+/).length / 2.5)
    // merge consecutive cues from the same speaker
    if (prev && prev.speaker === speaker && start - prev.tEnd < 2) {
      prev.text += ` ${clean}`
      prev.tEnd = end
    } else out.push({ speaker: speaker || 'Unknown', tStart: start, tEnd: end, text: clean, source: 'manual' })
  }

  const isCueFormat = lines.some((l) => TIME_RANGE.test(l.trim()))
  if (isCueFormat) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].trim().match(TIME_RANGE)
      if (!m) continue
      const [a, b] = lines[i].split('-->').map((x) => x.trim().split(/\s/)[0])
      const body: string[] = []
      while (i + 1 < lines.length && lines[i + 1].trim() !== '') body.push(lines[++i].trim())
      const joined = body.join(' ')
      const voice = joined.match(/^<v\s+([^>]+)>/)
      if (voice) push(voice[1].trim(), joined.replace(/^<v\s+[^>]+>/, ''), toSec(a), toSec(b))
      else {
        const sp = joined.match(/^([^:]{1,40}):\s+(.+)$/)
        if (sp && !isNoteLabel(sp[1])) push(sp[1].trim(), sp[2], toSec(a), toSec(b))
        else push(sp ? (out.at(-1)?.speaker ?? 'Unknown') : 'Unknown', joined, toSec(a), toSec(b))
      }
    }
    return out
  }

  let speaker = 'Unknown'
  let tHeader: number | null = null
  for (const line of lines) {
    const l = line.trim()
    if (!l) continue
    const z = l.match(ZOOM_HEADER)
    if (z) {
      speaker = z[1].trim()
      tHeader = toSec(z[2])
      continue
    }
    const m = l.match(SPEAKER_LINE)
    if (m && m[2].split(/\s+/).length <= 5 && !isNoteLabel(m[2])) {
      speaker = m[2].trim()
      push(speaker, m[3], m[1] ? toSec(m[1]) : null, null)
    } else {
      push(speaker, l, tHeader, null)
    }
    tHeader = null
  }
  return out
}
