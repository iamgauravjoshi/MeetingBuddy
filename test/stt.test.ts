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
