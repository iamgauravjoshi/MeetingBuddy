import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'

// What the mock model answers next; tests set it before each analysis. `gate` holds the answer back.
const reply = vi.hoisted(() => ({ changes: [] as unknown[], gate: null as Promise<void> | null, fail: false }))

const model = new MockLanguageModelV4({
  doGenerate: async () => {
    if (reply.gate) await reply.gate
    if (reply.fail) throw new Error('model unavailable')
    return {
      content: [{ type: 'text', text: JSON.stringify({ summary: 'Project changed.', changes: reply.changes }) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
      warnings: []
    } as never
  }
})

vi.mock('../src/main/settings', () => ({ getSettings: () => ({ llmProvider: 'anthropic', llmModel: 'mock' }) }))
vi.mock('../src/main/llm', () => ({ getModel: () => ({ model, label: 'mock:model' }) }))

import * as db from '../src/main/db'
import { analyzeMeeting, applyApproved } from '../src/main/analysis'

const LINE = 'We will use Postgres for the backend, and the payments question is settled.'
const QUOTE = 'we will use Postgres for the backend'
const change = (over: Record<string, unknown>) => ({
  category: 'decision',
  op: 'create',
  target_item: null,
  item_type: 'decision',
  title: 'Change',
  body: '',
  owner: '',
  due_date: '',
  speaker: 'Priya',
  strength: 'firm',
  confidence: 0.9,
  impact: 'high',
  rationale: 'Because.',
  evidence: [{ line: 'S1', quote: QUOTE }],
  ...over
})

let projectId = ''
const meeting = (): string => {
  const id = db.createMeeting(projectId, 'Sync', 'ready').id
  db.addSegments(id, [{ speaker: 'Priya', tStart: 0, tEnd: 5, text: LINE, source: 'manual' }])
  return id
}
const item = (type: 'decision' | 'question' | 'task', title: string) =>
  db.createItem({ projectId, type, title, body: '', owner: '', dueDate: '' })
// analyze with the given model changes, then accept every proposal
const analyzeAndAccept = async (meetingId: string, changes: unknown[]): Promise<void> => {
  reply.changes = changes
  await analyzeMeeting(meetingId)
  for (const p of db.getReport(meetingId)!.proposals) db.updateProposal(p.id, { status: 'accepted' })
}

beforeEach(() => {
  db.openDb(':memory:')
  projectId = db.createProject('Phoenix', '').id
  reply.changes = []
  reply.gate = null
  reply.fail = false
})

describe('applying changes to items that changed since the analysis', () => {
  it('records the version of the target item on the proposal', async () => {
    item('decision', 'Use Firebase')
    const m = meeting()
    await analyzeAndAccept(m, [change({ op: 'update', target_item: 'DEC-1', title: 'Use Postgres' })])
    expect(db.getReport(m)!.proposals[0].targetVersion).toBe(1)
  })

  it('skips closing an item that was deleted, instead of creating a new one', async () => {
    const q = item('question', 'Do we support payments?')
    const m = meeting()
    await analyzeAndAccept(m, [
      change({ category: 'open_question', op: 'close', target_item: 'Q-1', item_type: 'question', title: 'Do we support payments?' })
    ])
    db.deleteItem(q.id)

    const result = applyApproved(m)

    expect(result.applied).toBe(0)
    expect(result.skipped).toEqual([
      expect.objectContaining({ title: 'Do we support payments?', reason: expect.stringMatching(/deleted/i) })
    ])
    expect(db.listItems(projectId)).toEqual([])
    expect(db.getReport(m)!.proposals[0].status).toBe('accepted')
  })

  it('skips an update when the item was edited after the analysis', async () => {
    const d = item('decision', 'Use Firebase')
    const m = meeting()
    await analyzeAndAccept(m, [change({ op: 'update', target_item: 'DEC-1', title: 'Use Postgres' })])
    db.updateItem(d.id, { owner: 'Rahul' })

    const result = applyApproved(m)

    expect(result.skipped).toEqual([expect.objectContaining({ reason: expect.stringMatching(/changed since/i) })])
    expect(db.getItem(d.id)?.title).toBe('Use Firebase')
  })

  it('skips a change to an item that another meeting superseded', async () => {
    const d = item('decision', 'Use Firebase')
    const a = meeting()
    const b = meeting()
    await analyzeAndAccept(a, [change({ op: 'supersede', target_item: 'DEC-1', title: 'Use Postgres' })])
    await analyzeAndAccept(b, [change({ op: 'update', target_item: 'DEC-1', title: 'Use Firebase with offline mode' })])

    expect(applyApproved(a).applied).toBe(1)
    const result = applyApproved(b)

    expect(result).toMatchObject({ applied: 0, skipped: [expect.objectContaining({ reason: expect.stringMatching(/changed since/i) })] })
    expect(db.getItem(d.id)).toMatchObject({ status: 'superseded', title: 'Use Firebase' })
  })

  it('applies several accepted changes to the same item together', async () => {
    const t = item('task', 'Write the API spec')
    const m = meeting()
    await analyzeAndAccept(m, [
      change({
        category: 'action_item',
        op: 'update',
        target_item: 'TSK-1',
        item_type: 'task',
        title: 'Write the API spec',
        owner: 'Rahul'
      }),
      change({ category: 'action_item', op: 'close', target_item: 'TSK-1', item_type: 'task', title: 'Write the API spec' })
    ])

    expect(applyApproved(m)).toEqual({ applied: 2, skipped: [] })
    expect(db.getItem(t.id)).toMatchObject({ owner: 'Rahul', status: 'done' })
  })

  it('turns a flagged conflict into an open question', async () => {
    const d = item('decision', 'Use Firebase')
    const m = meeting()
    await analyzeAndAccept(m, [
      change({ category: 'conflict', op: 'flag', target_item: 'DEC-1', item_type: 'question', title: 'Postgres vs Firebase' })
    ])

    expect(applyApproved(m).applied).toBe(1)
    expect(db.listItems(projectId).find((i) => i.type === 'question')).toMatchObject({
      title: 'Resolve conflict: Postgres vs Firebase',
      status: 'open'
    })
    expect(db.getItemHistory(d.id)[0].summary).toMatch(/Conflict flagged/)
  })

  it('does not bump the version of an item an update leaves unchanged', async () => {
    const t = item('task', 'Write the API spec')
    const m = meeting()
    await analyzeAndAccept(m, [
      change({ category: 'action_item', op: 'update', target_item: 'TSK-1', item_type: 'task', title: 'Write the API spec' })
    ])

    expect(applyApproved(m).applied).toBe(1)
    expect(db.getItem(t.id)?.version).toBe(1)
    expect(db.getItemHistory(t.id)).toEqual([])
  })
})

describe('one analysis at a time', () => {
  it('shares a running analysis instead of starting a second one', async () => {
    const m = meeting()
    let release!: () => void
    reply.gate = new Promise((r) => (release = r))
    const calls = model.doGenerateCalls.length

    const first = analyzeMeeting(m)
    const second = analyzeMeeting(m)
    expect(db.getMeeting(m)?.status).toBe('analyzing')
    release()

    expect(await second).toEqual(await first)
    expect(model.doGenerateCalls.length).toBe(calls + 1)
    expect(db.getMeeting(m)?.status).toBe('analyzed')
  })

  it('refuses to apply while a re-analysis is running', async () => {
    item('decision', 'Use Firebase')
    const m = meeting()
    await analyzeAndAccept(m, [change({ op: 'update', target_item: 'DEC-1', title: 'Use Postgres' })])
    let release!: () => void
    reply.gate = new Promise((r) => (release = r))

    const running = analyzeMeeting(m)
    expect(() => applyApproved(m)).toThrow(/analysis is running/i)
    release()
    await running
  })

  it('puts the meeting back to its previous status when the analysis fails', async () => {
    const m = meeting()
    reply.fail = true
    await expect(analyzeMeeting(m)).rejects.toThrow()
    expect(db.getMeeting(m)?.status).toBe('ready')
  })
})

describe('re-analysis after applying', () => {
  it('is refused so the applied report is kept', async () => {
    item('decision', 'Use Firebase')
    const m = meeting()
    await analyzeAndAccept(m, [change({ op: 'update', target_item: 'DEC-1', title: 'Use Postgres' })])
    applyApproved(m)
    const report = db.getReport(m)!.report.id
    const calls = model.doGenerateCalls.length

    await expect(analyzeMeeting(m)).rejects.toThrow(/already applied/i)

    expect(db.getReport(m)!.report.id).toBe(report)
    expect(db.getMeeting(m)?.status).toBe('applied')
    expect(model.doGenerateCalls.length).toBe(calls)
  })
})
