import type { Api } from '../../main/api'

type Remote<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never
}

/** Typed proxy over IPC: api.listProjects() calls the main-process handler of the same name. */
export const api = new Proxy({} as Remote<Api>, {
  get:
    (_t, name: string) =>
    async (...args: unknown[]) => {
      try {
        return await window.mb.invoke(name, ...args)
      } catch (e) {
        // strip Electron's "Error invoking remote method 'api:x': Error: " prefix
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(msg.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''))
      }
    }
})

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
