import { describe, expect, it, vi } from 'vitest'

// analysis.ts pulls in the Electron-only modules; the pure functions under test don't need them
vi.mock('../src/main/db', () => ({}))
vi.mock('../src/main/llm', () => ({}))
vi.mock('../src/main/settings', () => ({}))

import { quoteMatches, validateChanges } from '../src/main/analysis'
import type { Item, Segment } from '@shared/types'

const seg = (id: string, speaker: string, text: string, t = 0): Segment => ({
  id, meetingId: 'm', idx: 0, speaker, tStart: t, tEnd: t + 5, text, source: 'manual'
})
const item = (id: string, type: Item['type'], title: string): Item => ({
  id, projectId: 'p', type, title, body: '', status: 'open', owner: '', dueDate: '', version: 1, createdAt: '', updatedAt: ''
})

const change = (over: Record<string, unknown> = {}) => ({
  category: 'decision' as const, op: 'create' as const, target_item: null, item_type: 'decision' as const,
  title: 'Use Postgres', body: '', owner: '', due_date: '', speaker: 'Priya', strength: 'firm' as const,
  confidence: 0.9, impact: 'high' as const, rationale: '', evidence: [{ line: 'S1', quote: 'we will use Postgres' }],
  ...over
})

describe('quoteMatches', () => {
  it('accepts exact quotes ignoring case and punctuation', () => {
    expect(quoteMatches('We will use Postgres!', 'OK, so we will use postgres for the MVP.')).toBe(true)
  })
  it('rejects fabricated quotes', () => {
    expect(quoteMatches('we decided to drop the mobile app', 'we will use postgres for the MVP')).toBe(false)
  })
  it('tolerates a dropped filler word', () => {
    expect(quoteMatches('we will definitely ship on the twentieth', 'we will um definitely ship it on the twentieth')).toBe(true)
  })
})

describe('validateChanges', () => {
  const segments = [seg('a', 'Priya', 'OK, so we will use Postgres for the MVP.', 0), seg('b', 'Rahul', 'Launch moves to November 20.', 10)]
  const segRef = new Map([['S1', segments[0]], ['S2', segments[1]]])
  const items = [item('i1', 'deadline', 'Launch on Nov 1')]
  const itemRef = new Map([['DL-1', items[0]]])

  it('keeps evidence-backed changes and maps line IDs to segments', () => {
    const { kept, dropped } = validateChanges([change()], segRef, itemRef, segments)
    expect(dropped).toBe(0)
    expect(kept[0].evidence[0]).toMatchObject({ segmentId: 'a', speaker: 'Priya' })
  })
  it('drops changes whose quotes are not in the transcript', () => {
    const { kept, dropped } = validateChanges([change({ evidence: [{ line: 'S1', quote: 'we will use MongoDB' }] })], segRef, itemRef, segments)
    expect(kept).toHaveLength(0)
    expect(dropped).toBe(1)
  })
  it('recovers when the model cites a neighbouring line', () => {
    const { kept } = validateChanges([change({ evidence: [{ line: 'S2', quote: 'we will use Postgres' }] })], segRef, itemRef, segments)
    expect(kept[0].evidence[0].segmentId).toBe('a')
  })
  it('resolves target item refs and downgrades unknown targets to create', () => {
    const upd = change({ category: 'timeline_change', op: 'update', target_item: 'DL-1', item_type: 'deadline', evidence: [{ line: 'S2', quote: 'Launch moves to November 20' }] })
    const bad = change({ op: 'update', target_item: 'DEC-99' })
    const { kept } = validateChanges([upd, bad], segRef, itemRef, segments)
    expect(kept.find((k) => k.category === 'timeline_change')).toMatchObject({ op: 'update', targetItemId: 'i1' })
    expect(kept.find((k) => k.category === 'decision')).toMatchObject({ op: 'create', targetItemId: null })
  })
  it('replaces an unknown speaker with the speaker of the evidence', () => {
    const { kept } = validateChanges([change({ speaker: 'Someone else' })], segRef, itemRef, segments)
    expect(kept[0].speaker).toBe('Priya')
  })
})
