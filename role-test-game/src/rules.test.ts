import { describe, expect, it } from 'vitest'
import {
  BOT_MIN_LEFT, HALF, LAYOUTS, OBSTACLES, RADIUS, REACH, ROUND_SECONDS, RUN, SPAWN, SUITCASES, WALK,
  clipOf, collide, createState, dist, greedyInput, inObstacle, routeLength, simulate, step,
} from './rules'

const still = { x: 0, z: 0 }
const layouts = Array.from({ length: LAYOUTS }, (_, i) => i + 1)

describe('layouts', () => {
  it('the same layout number gives the same round, others differ', () => {
    expect(createState(3)).toEqual(createState(3))
    expect(createState(3).suitcases).not.toEqual(createState(4).suitcases)
    expect(createState(1 + LAYOUTS)).toEqual(createState(1))
  })

  it.each(layouts)('layout %i meets the GDD rules', (n) => {
    const s = createState(n)
    expect(s.suitcases).toHaveLength(SUITCASES)
    const first = s.suitcases[0]
    expect(dist(first, SPAWN)).toBeGreaterThanOrEqual(4 - 1e-6)
    expect(dist(first, SPAWN)).toBeLessThanOrEqual(6 + 1e-6)
    expect(first.z).toBeLessThan(SPAWN.z) // in front of the spawn, in view
    for (let i = 0; i < SUITCASES; i++) {
      expect(inObstacle(s.suitcases[i], 0.5)).toBe(false)
      for (let j = i + 1; j < SUITCASES; j++) expect(dist(s.suitcases[i], s.suitcases[j])).toBeGreaterThanOrEqual(4 - 1e-6)
    }
    const len = routeLength(s.suitcases)
    expect(len).toBeGreaterThanOrEqual(55)
    expect(len).toBeLessThanOrEqual(75)
  })

  it.each(layouts)('the bot clears layout %i with at least 15 s left', (n) => {
    const done = simulate(createState(n), greedyInput)
    expect(done.mode).toBe('won')
    expect(done.collected).toBe(SUITCASES)
    expect(done.timeLeft).toBeGreaterThanOrEqual(BOT_MIN_LEFT)
  })
})

describe('movement', () => {
  it('walks at 1.5 m/s and runs at 3.0 m/s once eased in', () => {
    let s = createState(1)
    for (let i = 0; i < 60; i++) s = step(s, { x: 1, z: 0 }, 1 / 60)
    expect(Math.hypot(s.player.vx, s.player.vz)).toBeCloseTo(WALK, 1)
    for (let i = 0; i < 60; i++) s = step(s, { x: 1, z: 0, run: true }, 1 / 60)
    expect(Math.hypot(s.player.vx, s.player.vz)).toBeCloseTo(RUN, 1)
  })

  it('velocity eases to the target in about 150 ms (no jump)', () => {
    const s = step(createState(1), { x: 1, z: 0 }, 1 / 60)
    expect(Math.hypot(s.player.vx, s.player.vz)).toBeLessThan(WALK * 0.5)
  })

  it('the figure turns toward the move direction', () => {
    let s = createState(1)
    for (let i = 0; i < 30; i++) s = step(s, { x: 1, z: 0 }, 1 / 60)
    expect(Math.sin(s.player.yaw)).toBeGreaterThan(0.99) // facing +x
  })

  it('walls, cars, bins and the bench stop the figure and it slides along them', () => {
    expect(collide({ x: HALF + 5, z: 0 }).x).toBeLessThanOrEqual(HALF - RADIUS + 1e-9)
    for (const b of OBSTACLES) {
      const p = collide({ x: b.x, z: b.z })
      expect(inObstacle(p, 0.3)).toBe(false) // pushed out of the box (circle radius 0.35)
    }
    let s = { ...createState(1), player: { ...createState(1).player, x: -3, z: -2 } }
    const carEdge = -6 + 1.0 + RADIUS
    for (let i = 0; i < 120; i++) s = step(s, { x: -1, z: 0.3 }, 1 / 60)
    expect(s.player.x).toBeGreaterThanOrEqual(carEdge - 1e-6) // stopped at the car
    expect(s.player.z).toBeGreaterThan(-2) // slid along it
  })
})

describe('pick-up and the clock', () => {
  it('touching a suitcase counts it, walking past without touching does not', () => {
    const s0 = createState(1)
    const c = s0.suitcases[0]
    const near = { ...s0, player: { ...s0.player, x: c.x + REACH + 0.3, z: c.z } }
    expect(step(near, still, 1 / 60).collected).toBe(0)
    const onIt = { ...s0, player: { ...s0.player, x: c.x + REACH - 0.1, z: c.z } }
    const after = step(onIt, still, 1 / 60)
    expect(after.collected).toBe(1)
    expect(after.suitcases[0].taken).toBe(true)
    expect(after.suitcases[0].takenAt).toBeGreaterThan(0)
  })

  it('five pick-ups end the run with a win and a finish time', () => {
    const done = simulate(createState(2), greedyInput)
    expect(done.mode).toBe('won')
    expect(done.finishTime).toBeCloseTo(ROUND_SECONDS - done.timeLeft, 5)
    expect(step(done, { x: 1, z: 1 }, 1)).toBe(done)
  })

  it('the clock at 0 ends the run with a loss, not before 60 s', () => {
    let s = createState(1)
    for (let i = 0; i < 59 * 60 + 50; i++) s = step(s, still, 1 / 60)
    expect(s.mode).toBe('play')
    for (let i = 0; i < 20; i++) s = step(s, still, 1 / 60)
    expect(s.mode).toBe('lost')
    expect(s.collected).toBe(0)
    expect(s.timeLeft).toBe(0)
  })
})

describe('clips', () => {
  it('idle at the start, walk while moving, idle again after 200 ms standing', () => {
    let s = createState(1)
    expect(clipOf(s.player)).toBe('idle')
    for (let i = 0; i < 20; i++) s = step(s, { x: 1, z: 0 }, 1 / 60)
    expect(clipOf(s.player)).toBe('walk')
    for (let i = 0; i < 60; i++) s = step(s, still, 1 / 60)
    expect(clipOf(s.player)).toBe('idle')
  })
})

describe('clips after a stop', () => {
  it('idle within 0.5 s of letting go, even while the figure still coasts', () => {
    let s = createState(1)
    for (let i = 0; i < 60; i++) s = step(s, { x: 1, z: 0, run: true }, 1 / 60)
    for (let i = 0; i < 24; i++) s = step(s, still, 1 / 60) // 0.4 s
    expect(clipOf(s.player)).toBe('idle')
  })
})

describe('stopping', () => {
  it('letting go at run speed coasts less than 0.3 m, so a stop 1 m from a suitcase does not pick it up (journey step 8)', () => {
    let s = createState(1)
    for (let i = 0; i < 90; i++) s = step(s, { x: 0, z: -1, run: true }, 1 / 60)
    const z0 = s.player.z
    for (let i = 0; i < 60; i++) s = step(s, still, 1 / 60)
    expect(z0 - s.player.z).toBeLessThan(0.3)
  })
})
