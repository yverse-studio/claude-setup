import { describe, expect, it } from 'vitest'
import { DEG, PITCH_MAX, PITCH_MIN, START_PITCH, applyLook, cameraPosition, easeYaw, forward, rayHit, wrap } from './camera'
import { HALF } from './rules'

describe('look', () => {
  it('pitch is clamped to -10 and +45 degrees, yaw wraps', () => {
    let l = { yaw: 0, pitch: START_PITCH }
    l = applyLook(l, 0, 10000, 0.22, false)
    expect(l.pitch).toBeCloseTo(PITCH_MAX, 6)
    l = applyLook(l, 0, -100000, 0.22, false)
    expect(l.pitch).toBeCloseTo(PITCH_MIN, 6)
    l = applyLook({ yaw: 3, pitch: 0 }, 1000, 0, 0.22, false)
    expect(Math.abs(l.yaw)).toBeLessThanOrEqual(Math.PI + 1e-9)
  })

  it('invert Y flips the pitch direction only', () => {
    const a = applyLook({ yaw: 0, pitch: 0.2 }, 10, 10, 0.22, false)
    const b = applyLook({ yaw: 0, pitch: 0.2 }, 10, 10, 0.22, true)
    expect(a.yaw).toBeCloseTo(b.yaw)
    expect(a.pitch - 0.2).toBeCloseTo(-(b.pitch - 0.2))
  })

  it('auto-camera eases toward the target by the short way', () => {
    const y = easeYaw(179 * DEG, -179 * DEG, 0.5)
    expect(Math.abs(wrap(y - 180 * DEG))).toBeLessThan(2 * DEG) // went over 180, not back through 0
  })
})

describe('camera position', () => {
  it('sits 4.5 m behind and 2.2 m above in the open', () => {
    const p = cameraPosition({ x: 0, z: 0 }, { yaw: Math.PI, pitch: START_PITCH })
    const f = forward(Math.PI)
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(4.5, 2)
    expect(p.z).toBeGreaterThan(0) // behind a figure that looks to -z
    expect(Math.sign(p.z)).toBe(-Math.sign(f.z))
    expect(p.y).toBeCloseTo(2.2, 2)
  })

  it('the horizontal distance stays the same whatever the view direction', () => {
    for (const yaw of [0, 1, 2, Math.PI, -2]) {
      const p = cameraPosition({ x: 0, z: 0 }, { yaw, pitch: START_PITCH })
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(4.5, 2)
    }
  })

  it('the spring arm shortens at the fence and at a car, never below 0.8 m', () => {
    const atFence = cameraPosition({ x: 0, z: HALF - 1 }, { yaw: Math.PI, pitch: START_PITCH })
    expect(atFence.back).toBeLessThan(1.5)
    expect(atFence.z).toBeLessThanOrEqual(HALF)
    const behindCar = cameraPosition({ x: -6, z: 3.5 }, { yaw: 0, pitch: START_PITCH }) // the camera would sit inside car A
    expect(behindCar.back).toBeLessThan(4.5)
    expect(behindCar.back).toBeGreaterThanOrEqual(0.8)
  })

  it('a ray misses a box that is behind it', () => {
    expect(rayHit({ x: 0, z: 0 }, { x: 0, z: 1 }, 5, [{ x: 0, z: -3, hw: 1, hd: 1 }])).toBe(5)
  })
})
