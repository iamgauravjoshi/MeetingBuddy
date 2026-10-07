import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '@shared/types'

vi.mock('../src/main/settings', () => ({ getSecret: () => 'test-key' }))
import { transcribe } from '../src/main/stt'

const settings = (sttProvider: Settings['sttProvider']) => ({ sttProvider, sttModel: '', selfName: 'Me' }) as Settings

// a provider that never answers, but stops when the request is aborted
const hangingFetch = vi.fn((_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal!.reason)))
)

afterEach(() => vi.unstubAllGlobals())

describe('transcribe timeouts', () => {
  for (const provider of ['deepgram', 'openai'] as const) {
    it(`gives up on ${provider} after the timeout with a clear message`, async () => {
      vi.stubGlobal('fetch', hangingFetch)
      await expect(transcribe(settings(provider), Buffer.from('x'), 'audio/webm', 'mic', 0, 50)).rejects.toThrow(
        /timed out after 0\.05 s/i
      )
    })
  }

  it('passes other errors through unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad key', { status: 401 })))
    await expect(transcribe(settings('deepgram'), Buffer.from('x'), 'audio/webm', 'mic', 0, 1000)).rejects.toThrow('Deepgram error 401: bad key')
  })
})

describe('uploads', () => {
  // records what each provider was sent, and answers with an empty transcript
  const recordingFetch = () =>
    vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ segments: [], results: { utterances: [] } }), { status: 200 }))

  it('names the uploaded file after its real format', async () => {
    const fetch = recordingFetch()
    vi.stubGlobal('fetch', fetch)
    for (const [mime, name] of [['audio/mpeg', 'audio.mp3'], ['audio/mp4', 'audio.m4a'], ['audio/wav', 'audio.wav'], ['video/mp4', 'audio.mp4'], ['audio/webm', 'audio.webm']]) {
      await transcribe(settings('openai'), Buffer.from('x'), mime, 'system', 0, 1000)
      const file = (fetch.mock.calls.at(-1)![1].body as FormData).get('file') as File
      expect(file.name).toBe(name)
    }
  })

  for (const provider of ['openai', 'groq'] as const) {
    it(`refuses files over 25 MB for ${provider} before uploading`, async () => {
      const fetch = recordingFetch()
      vi.stubGlobal('fetch', fetch)
      await expect(transcribe(settings(provider), Buffer.alloc(26 * 1024 * 1024), 'audio/webm', 'system', 0, 1000)).rejects.toThrow(
        /26\.0 MB.*25 MB.*Deepgram/s
      )
      expect(fetch).not.toHaveBeenCalled()
    })
  }

  it('sends large files to Deepgram', async () => {
    const fetch = recordingFetch()
    vi.stubGlobal('fetch', fetch)
    await transcribe(settings('deepgram'), Buffer.alloc(30 * 1024 * 1024), 'audio/webm', 'system', 0, 1000)
    expect(fetch).toHaveBeenCalledOnce()
  })
})
