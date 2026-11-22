import { describe, expect, it } from 'vitest'
import { deadzone, keyLabels, keyboardVector, toWorld } from './intents'

describe('intents', () => {
  it('dead zone: inside nothing, outside full, direction kept', () => {
    expect(deadzone(0.1, 0.05).m).toBe(0)
    expect(deadzone(1, 0).m).toBe(1)
    const d = deadzone(0.3, 0.3)
    expect(d.x).toBeCloseTo(d.y)
    expect(d.m).toBeGreaterThan(0)
    expect(d.m).toBeLessThan(1)
  })

  it('keys by code: WASD, arrows and a French layout all walk forward', () => {
    expect(keyboardVector(new Set(['KeyW']))).toEqual({ x: 0, y: 1 })
    expect(keyboardVector(new Set(['ArrowUp', 'ArrowLeft']))).toEqual({ x: -1, y: 1 })
    expect(keyboardVector(new Set(['KeyW', 'KeyS']))).toEqual({ x: 0, y: 0 })
  })

  it('forward goes where the camera looks, right goes to its right', () => {
    const a = toWorld(0, 1, Math.PI, false) // looks to -z
    expect(a.z).toBeCloseTo(-1)
    expect(a.x).toBeCloseTo(0)
    const b = toWorld(1, 0, Math.PI, false) // right of a view to -z is +x
    expect(b.x).toBeCloseTo(1)
    const c = toWorld(1, 1, 0, true)
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(1)
    expect(c.run).toBe(true)
  })

  it('hint letters follow the layout', () => {
    expect(keyLabels(null)).toBe('WASD')
    const fr = new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd']])
    expect(keyLabels(fr)).toBe('ZQSD')
  })
})
