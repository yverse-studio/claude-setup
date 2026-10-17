import { describe, expect, it } from 'vitest'
import { ARENA, COIN_COUNT, ROUND_SECONDS, createState, isOver, step } from './rules'

describe('rules', () => {
  it('the same seed gives the same round', () => {
    expect(createState(7)).toEqual(createState(7))
    expect(createState(7).coins).not.toEqual(createState(8).coins)
    expect(createState().coins).toHaveLength(COIN_COUNT)
  })

  it('the player moves and stays on the floor', () => {
    let s = createState()
    for (let i = 0; i < 600; i++) s = step(s, { x: 1, z: 0 }, 1 / 60)
    expect(s.player.x).toBeLessThanOrEqual(ARENA)
    expect(s.player.x).toBeGreaterThan(0)
  })

  it('touching a coin scores and respawns it', () => {
    const s = createState()
    const onCoin = { ...s, player: { ...s.coins[0] } }
    const after = step(onCoin, { x: 0, z: 0 }, 1 / 60)
    expect(after.score).toBe(1)
    expect(after.coins).toHaveLength(COIN_COUNT)
    expect(after.coins[0]).not.toEqual(s.coins[0])
  })

  it('the round ends when the clock runs out and then nothing changes', () => {
    const s = step({ ...createState(), timeLeft: 0.01 }, { x: 0, z: 0 }, 1)
    expect(isOver(s)).toBe(true)
    expect(step(s, { x: 1, z: 1 }, 1)).toBe(s)
    expect(createState().timeLeft).toBe(ROUND_SECONDS)
  })
})
