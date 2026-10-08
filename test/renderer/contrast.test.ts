import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Checks the design tokens against WCAG 2.2 AA (DESIGN.md §8.1), so a token edit that breaks contrast fails CI.

const css = readFileSync(join(__dirname, '../../src/renderer/src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The `--name: value` declarations inside the first `{ … }` block after `marker`. */
function declarations(marker: string): Map<string, string> {
  const start = css.indexOf('{', css.indexOf(marker))
  let depth = 0
  let end = start
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++
    else if (css[end] === '}' && --depth === 0) break
  }
  const body = css.slice(start + 1, end).replace(/^[^{]*\{/, '') // the dark block nests `:root {` inside the media query
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const light = declarations('@theme static')
// dark mode overrides some variables and inherits the rest from light
const dark = new Map([...light, ...declarations('@media (prefers-color-scheme: dark)')])

type Rgba = [number, number, number, number]

function resolve(theme: Map<string, string>, name: string): string {
  const v = theme.get(name)
  if (v === undefined) throw new Error(`token ${name} is not defined`)
  const ref = v.match(/^var\((--[\w-]+)\)$/)
  return ref ? resolve(theme, ref[1]) : v
}

function parse(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => Number.parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as Rgba
  const rgb = value.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  throw new Error(`can't parse colour ${value}`)
}

/** A translucent colour as it appears over an opaque one. */
const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1]

const luminance = ([r, g, b]: Rgba): number => {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(theme: Map<string, string>, fg: string, bg: string): number {
  // tints like the dark -soft tokens sit on the surface; the surface itself is opaque
  const surface = parse(resolve(theme, '--color-surface'))
  const back = over(parse(resolve(theme, bg)), surface)
  const front = over(parse(resolve(theme, fg)), back)
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

const HUES = ['red', 'green', 'yellow', 'blue', 'purple', 'pink', 'orange', 'teal', 'neutral']

/** [foreground, background, minimum ratio]: 4.5 for text, 3 for non-text such as focus rings and indicators. */
const PAIRS: [string, string, number][] = [
  ...['--color-canvas', '--color-surface', '--color-raised', '--color-hover'].flatMap((bg): [string, string, number][] => [
    ['--color-fg', bg, 4.5],
    ['--color-fg-secondary', bg, 4.5],
    ['--color-fg-tertiary', bg, 4.5],
    ['--color-accent-fg', bg, 4.5]
  ]),
  ['--color-fg', '--color-selected', 4.5],
  ['--color-fg-secondary', '--color-selected', 4.5],
  ['--color-fg-inverse', '--color-accent', 4.5],
  ['--color-fg-inverse', '--color-accent-hover', 4.5],
  ['--color-accent-fg', '--color-accent-soft', 4.5],
  ['--color-focus', '--color-surface', 3],
  ['--color-focus', '--color-canvas', 3],
  ['--color-brand', '--color-surface', 3],
  ['--color-line-hover', '--color-surface', 3],
  ...HUES.flatMap((h): [string, string, number][] => [
    [`--color-${h}-fg`, `--color-${h}-soft`, 4.5],
    [`--color-${h}-fg`, '--color-surface', 4.5],
    [`--color-${h}-on`, `--color-${h}-solid`, 4.5]
  ])
]

describe.each([
  ['light', light],
  ['dark', dark]
])('%s theme tokens meet WCAG AA', (_name, theme) => {
  it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(min)
  })
})
