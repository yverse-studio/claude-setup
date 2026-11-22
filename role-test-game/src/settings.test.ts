import { describe, expect, it } from 'vitest'
import { KEY, SENSITIVITY, clampSettings, defaults, loadSettings, saveSettings } from './settings'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('settings', () => {
  it('clamps sensitivity and drops wrong types', () => {
    expect(clampSettings({ sensitivity: 99 }).sensitivity).toBe(SENSITIVITY.max)
    expect(clampSettings({ sensitivity: -1 }).sensitivity).toBe(SENSITIVITY.min)
    expect(clampSettings({ sensitivity: 'x', invertY: 'yes', autoCamera: 1 })).toEqual(defaults())
    expect(clampSettings(null)).toEqual(defaults())
  })

  it('saves and loads what was set', () => {
    const store = memory()
    saveSettings(store, { sensitivity: 0.4, invertY: true, autoCamera: false, reducedMotion: true })
    expect(loadSettings(store)).toEqual({ sensitivity: 0.4, invertY: true, autoCamera: false, reducedMotion: true })
  })

  it('broken storage or text gives the defaults', () => {
    const store = memory()
    store.setItem(KEY, '{not json')
    expect(loadSettings(store)).toEqual(defaults())
    expect(loadSettings(null)).toEqual(defaults())
    const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadSettings(throwing)).toEqual(defaults())
    expect(() => saveSettings(throwing, defaults())).not.toThrow()
  })

  it('reduced motion default follows the system, a saved choice wins', () => {
    expect(loadSettings(memory(), defaults(true)).reducedMotion).toBe(true)
    const store = memory()
    saveSettings(store, { ...defaults(), reducedMotion: false })
    expect(loadSettings(store, defaults(true)).reducedMotion).toBe(false)
  })
})
