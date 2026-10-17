// Game rules: plain TypeScript, no renderer import, so Vitest covers them (game-3d skill).
export type Vec = { x: number; z: number }
export type Input = { x: number; z: number } // direction, each -1..1
export type State = { player: Vec; coins: Vec[]; score: number; timeLeft: number; seed: number }

export const ARENA = 9 // half-width of the square floor
export const ROUND_SECONDS = 30
export const SPEED = 6
export const PICKUP_RADIUS = 0.9
export const COIN_COUNT = 5

// mulberry32 as a pure step: the same seed always gives the same coins.
export function next(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

function spawn(seed: number): [Vec, number] {
  const [a, s1] = next(seed)
  const [b, s2] = next(s1)
  return [{ x: (a * 2 - 1) * (ARENA - 1), z: (b * 2 - 1) * (ARENA - 1) }, s2]
}

export function createState(seed = 1): State {
  let s = seed
  const coins: Vec[] = []
  for (let i = 0; i < COIN_COUNT; i++) {
    const [coin, s2] = spawn(s)
    coins.push(coin)
    s = s2
  }
  return { player: { x: 0, z: 0 }, coins, score: 0, timeLeft: ROUND_SECONDS, seed: s }
}

export const isOver = (state: State) => state.timeLeft <= 0

const clamp = (v: number) => Math.max(-ARENA, Math.min(ARENA, v))

// One tick: move, collect coins (each is replaced at a seeded spot), count the clock down.
export function step(state: State, input: Input, dt: number): State {
  if (isOver(state)) return state
  const len = Math.hypot(input.x, input.z) || 1
  const k = Math.min(1, len) * SPEED * dt / len
  const player = { x: clamp(state.player.x + input.x * k), z: clamp(state.player.z + input.z * k) }
  let seed = state.seed
  let score = state.score
  const coins = state.coins.map((coin) => {
    if (Math.hypot(coin.x - player.x, coin.z - player.z) > PICKUP_RADIUS) return coin
    score += 1
    const [fresh, s2] = spawn(seed)
    seed = s2
    return fresh
  })
  return { player, coins, score, timeLeft: Math.max(0, state.timeLeft - dt), seed }
}
