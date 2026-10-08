import type { CSSProperties } from 'react'

/** The categorical hues in styles/tokens.css; each has -soft, -line, -fg, -solid and -on tokens. */
export type Hue = 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'pink' | 'orange' | 'teal' | 'neutral'

/** Semantic tones (DESIGN.md §2.2) and the raw hues, for components that colour by meaning. */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'record' | Exclude<Hue, 'neutral'>

const ROLE: Partial<Record<Tone, string>> = { success: 'success', warning: 'warning', danger: 'danger', info: 'info', record: 'record' }

/**
 * CSS variables `--tone-soft/line/fg/solid/on` for a tone, set through `style`. Components then use fixed utilities like
 * `bg-(--tone-soft)`, so Tailwind sees every class at build time while the colour stays data-driven.
 */
export function toneVars(tone: Tone): CSSProperties {
  if (tone === 'accent')
    return {
      '--tone-soft': 'var(--color-accent-soft)',
      '--tone-line': 'var(--color-green-line)',
      '--tone-fg': 'var(--color-accent-fg)',
      '--tone-solid': 'var(--color-accent)',
      '--tone-on': 'var(--color-fg-inverse)'
    } as CSSProperties
  const name = ROLE[tone] ?? tone
  return Object.fromEntries(['soft', 'line', 'fg', 'solid', 'on'].map((k) => [`--tone-${k}`, `var(--color-${name}-${k})`])) as CSSProperties
}
