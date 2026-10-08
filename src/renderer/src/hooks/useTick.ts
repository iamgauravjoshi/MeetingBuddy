import { useEffect, useState } from 'react'

/** Re-renders every `ms` milliseconds (for timers). */
export function useTick(ms: number, enabled = true): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const t = window.setInterval(() => setN((x) => x + 1), ms)
    return () => window.clearInterval(t)
  }, [ms, enabled])
  return n
}
