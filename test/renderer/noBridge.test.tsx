// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { hasBridge, NoBridge } from '../../src/renderer/src/NoBridge'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'mb')
})

describe('outside the Electron window', () => {
  it('detects whether the preload bridge is present', () => {
    expect(hasBridge()).toBe(false)
    Object.assign(window, { mb: {} })
    expect(hasBridge()).toBe(true)
  })
  it('explains how to open the app instead of crashing', () => {
    render(<NoBridge />)
    expect(screen.getByRole('heading', { name: /runs in its desktop window/ })).toBeTruthy()
    expect(screen.getByText('npm run dev')).toBeTruthy()
  })
})
