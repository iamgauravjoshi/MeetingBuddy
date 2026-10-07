import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'

// The model's answer for the meeting below. Line and item IDs are the short refs the prompt shows the model.
const MODEL_OUTPUT = {
  summary: 'Payments moved into v1 scope, the backend switched to Supabase, and launch slipped to Nov 20.',
  changes: [
    {
      category: 'scope_change', op: 'create', target_item: null, item_type: 'requirement',
      title: 'Online payments via Razorpay in v1', body: 'Partner clinics require online payment.', owner: '', due_date: '',
      speaker: 'Priya', strength: 'firm', confidence: 0.95, impact: 'high', rationale: 'Adds payments to MVP scope.',
      evidence: [{ line: 'S1', quote: 'payments are in scope for v1' }]
    },
    {
      category: 'decision', op: 'supersede', target_item: 'DEC-1', item_type: 'decision',
      title: 'Use Supabase (Postgres) for the backend', body: '', owner: 'Rahul', due_date: '',
      speaker: 'Rahul', strength: 'firm', confidence: 0.9, impact: 'high', rationale: 'Reverses the Firebase decision.',
      evidence: [{ line: 'S2', quote: 'let us use Supabase with Postgres instead' }]
    },
    {
      category: 'timeline_change', op: 'update', target_item: 'DL-1', item_type: 'deadline',
      title: 'MVP launch', body: '', owner: '', due_date: '2026-11-20',
      speaker: 'Priya', strength: 'firm', confidence: 0.9, impact: 'high', rationale: 'Launch slips by ~3 weeks.',
      evidence: [{ line: 'S3', quote: 'the launch moves to November 20' }]
    },
    {
      category: 'open_question', op: 'close', target_item: 'Q-1', item_type: 'question',
      title: 'Do we support payments in v1?', body: '', owner: '', due_date: '',
      speaker: 'Priya', strength: 'firm', confidence: 0.85, impact: 'medium', rationale: 'Answered: yes.',
      evidence: [{ line: 'S1', quote: 'online payment is mandatory' }]
    },
    {
      category: 'requirement', op: 'create', target_item: null, item_type: 'requirement',
      title: 'Google login', body: '', owner: '', due_date: '',
      speaker: 'Rahul', strength: 'tentative', confidence: 0.4, impact: 'low', rationale: 'Only an idea.',
      evidence: [{ line: 'S4', quote: 'Maybe we could add Google login later' }]
    },
    {
      // fabricated: nobody said this, so validation must drop it
      category: 'decision', op: 'create', target_item: null, item_type: 'decision',
      title: 'Drop the iOS app', body: '', owner: '', due_date: '',
      speaker: 'Rahul', strength: 'firm', confidence: 0.8, impact: 'high', rationale: '',
      evidence: [{ line: 'S2', quote: 'we are dropping the iOS app' }]
    }
  ]
}

const model = new MockLanguageModelV4({
  doGenerate: async () =>
    ({
      content: [{ type: 'text', text: JSON.stringify(MODEL_OUTPUT) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 }
      },
      warnings: []
    }) as never
})

vi.mock('../src/main/settings', () => ({ getSettings: () => ({ llmProvider: 'anthropic', llmModel: 'mock' }) }))
vi.mock('../src/main/llm', () => ({ getModel: () => ({ model, label: 'mock:model' }) }))

import * as db from '../src/main/db'
import { analyzeMeeting, applyApproved } from '../src/main/analysis'

describe('analyze → approve → apply', () => {
  let projectId = ''
  let meetingId = ''
  const ids: Record<string, string> = {}

  beforeAll(() => {
    db.openDb(':memory:')
    projectId = db.createProject('Phoenix', 'Clinic booking app').id
    ids.firebase = db.createItem({ projectId, type: 'decision', title: 'Use Firebase for the backend', body: '', owner: 'Rahul', dueDate: '' }).id
    ids.launch = db.createItem({ projectId, type: 'deadline', title: 'MVP launch', body: '', owner: 'Priya', dueDate: '2026-11-01' }).id
    ids.payq = db.createItem({ projectId, type: 'question', title: 'Do we support payments in v1?', body: '', owner: '', dueDate: '' }).id
    meetingId = db.createMeeting(projectId, 'Weekly sync', 'ready').id
    db.addSegments(meetingId, [
      { speaker: 'Priya', tStart: 2, tEnd: 8, text: 'The partner clinics told us online payment is mandatory, so payments are in scope for v1.', source: 'manual' },
      { speaker: 'Rahul', tStart: 9, tEnd: 16, text: 'Then we need Razorpay. Also I want to move off Firebase, let us use Supabase with Postgres instead.', source: 'manual' },
      { speaker: 'Priya', tStart: 17, tEnd: 22, text: 'Fine. With payments added, the launch moves to November 20.', source: 'manual' },
      { speaker: 'Rahul', tStart: 29, tEnd: 34, text: 'Maybe we could add Google login later, not sure yet.', source: 'manual' }
    ])
  })

  it('sends project state and transcript with short refs to the model', async () => {
    await analyzeMeeting(meetingId)
    const call = model.doGenerateCalls[0]
    const prompt = JSON.stringify(call.prompt)
    expect(prompt).toContain('[DEC-1] (decision) Use Firebase for the backend')
    expect(prompt).toContain('[DL-1] (deadline) MVP launch {owner: Priya, due: 2026-11-01}')
    expect(prompt).toContain('[S3 00:17] Priya: Fine. With payments added')
  })

  it('stores validated proposals and drops the fabricated one', () => {
    const rep = db.getReport(meetingId)!
    expect(rep.report.droppedCount).toBe(1)
    expect(rep.proposals.map((p) => p.title)).not.toContain('Drop the iOS app')
    expect(rep.proposals).toHaveLength(5)
    expect(rep.proposals.find((p) => p.op === 'supersede')?.targetItemId).toBe(ids.firebase)
    expect(rep.proposals.find((p) => p.title === 'Google login')?.strength).toBe('tentative')
    expect(db.getMeeting(meetingId)?.status).toBe('analyzed')
  })

  it('applies only accepted proposals and records history', () => {
    const rep = db.getReport(meetingId)!
    for (const p of rep.proposals) db.updateProposal(p.id, { status: p.strength === 'firm' ? 'accepted' : 'rejected' })
    const { applied } = applyApproved(meetingId)
    expect(applied).toBe(4)

    const items = db.listItems(projectId)
    expect(db.getItem(ids.firebase)?.status).toBe('superseded')
    expect(items.find((i) => i.title.startsWith('Use Supabase'))?.status).toBe('open')
    expect(db.getItem(ids.launch)).toMatchObject({ dueDate: '2026-11-20', version: 2 })
    expect(db.getItem(ids.payq)?.status).toBe('done')
    expect(items.find((i) => i.title === 'Online payments via Razorpay in v1')?.type).toBe('requirement')
    expect(items.find((i) => i.title === 'Google login')).toBeUndefined()

    const hist = db.getItemHistory(ids.launch)
    expect(hist[0]).toMatchObject({ speaker: 'Priya', quote: 'the launch moves to November 20', meetingTitle: 'Weekly sync' })

    const [version] = db.listStateVersions(projectId)
    expect(version.changes.find((c) => c.op === 'update')).toMatchObject({ before: { dueDate: '2026-11-01' }, after: { dueDate: '2026-11-20' } })
    expect(db.getMeeting(meetingId)?.status).toBe('applied')
  })

  it('feeds the approved report into the next meeting as history', () => {
    const next = db.createMeeting(projectId, 'Next sync', 'ready').id
    expect(db.recentMeetingSummaries(projectId, next)[0].summary).toContain('Supabase')
  })
})
