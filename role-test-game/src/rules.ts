// Kofferlauf rules: plain TypeScript, no renderer import, so Vitest covers them (game-3d skill).
// World: x to the right, z toward the viewer at spawn, y up (not used here). Yaw: forward = (sin yaw, cos yaw).
export type Vec = { x: number; z: number }
export type Box = { x: number; z: number; hw: number; hd: number } // centre and half sizes
export type Input = { x: number; z: number; run?: boolean } // world direction, each -1..1; run = hold 3.0 m/s
export type Suitcase = Vec & { taken: boolean; takenAt: number }
export type Player = Vec & { vx: number; vz: number; yaw: number; speed: number; standT: number }
export type Mode = 'play' | 'won' | 'lost'
export type State = {
  mode: Mode
  timeLeft: number
  elapsed: number
  collected: number
  finishTime: number | null
  player: Player
  suitcases: Suitcase[]
  layout: number // 1..LAYOUTS
}

export const HALF = 12 // the plot is 24 x 24 m
export const RADIUS = 0.35 // figure capsule radius
export const ROUND_SECONDS = 60
export const SUITCASES = 5
export const LAYOUTS = 5
export const WALK = 1.5
export const RUN = 3.0
export const EASE = 0.15 // s to reach the target velocity
export const BRAKE = 0.06 // s to stop once the input is released: at run speed the figure coasts about 0.2 m, never into a suitcase 1 m away
export const REACH = 0.7 // contact distance, centre to centre
export const IDLE_AFTER = 0.2 // s standing before the idle clip
export const SPAWN: Vec = { x: 0, z: 4 }
export const SPAWN_YAW = Math.PI // faces -z, the first suitcase lies ahead

// The street plot: two parked cars, four bins, one bench (grey boxes, style "real").
export const OBSTACLES: Box[] = [
  { x: -6, z: -2, hw: 1.0, hd: 2.2 }, // car A
  { x: 6.5, z: 3, hw: 1.0, hd: 2.2 }, // car B
  { x: -2.5, z: -7, hw: 0.35, hd: 0.35 }, // bin
  { x: 3, z: -5, hw: 0.35, hd: 0.35 }, // bin
  { x: 9, z: -8, hw: 0.35, hd: 0.35 }, // bin
  { x: -9, z: 6.5, hw: 0.35, hd: 0.35 }, // bin
  { x: -1, z: -10, hw: 0.9, hd: 0.3 }, // bench
]

// mulberry32 as a pure step: the same seed always gives the same numbers.
export function next(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z)

// Circle against box: push the centre out along the shortest way (the figure slides along a wall).
export function pushOut(p: Vec, r: number, b: Box): Vec {
  const nx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, p.x))
  const nz = Math.max(b.z - b.hd, Math.min(b.z + b.hd, p.z))
  const dx = p.x - nx
  const dz = p.z - nz
  const d = Math.hypot(dx, dz)
  if (d >= r) return p
  if (d > 1e-9) return { x: nx + (dx / d) * r, z: nz + (dz / d) * r }
  // centre inside the box: leave by the nearest face
  const gaps = [
    { x: b.x - b.hw - r, z: p.z, d: p.x - (b.x - b.hw) },
    { x: b.x + b.hw + r, z: p.z, d: b.x + b.hw - p.x },
    { x: p.x, z: b.z - b.hd - r, d: p.z - (b.z - b.hd) },
    { x: p.x, z: b.z + b.hd + r, d: b.z + b.hd - p.z },
  ].sort((a, c) => a.d - c.d)[0]
  return { x: gaps.x, z: gaps.z }
}

export function collide(p: Vec): Vec {
  let q = { x: Math.max(-HALF + RADIUS, Math.min(HALF - RADIUS, p.x)), z: Math.max(-HALF + RADIUS, Math.min(HALF - RADIUS, p.z)) }
  for (const b of OBSTACLES) q = pushOut(q, RADIUS, b)
  return { x: Math.max(-HALF + RADIUS, Math.min(HALF - RADIUS, q.x)), z: Math.max(-HALF + RADIUS, Math.min(HALF - RADIUS, q.z)) }
}

export const inObstacle = (p: Vec, margin: number) =>
  OBSTACLES.some((b) => Math.abs(p.x - b.x) < b.hw + margin && Math.abs(p.z - b.z) < b.hd + margin)

// Greedy nearest-first route length from the spawn through all suitcases (what the layout rule measures).
export function routeLength(points: Vec[], from: Vec = SPAWN): number {
  const left = [...points]
  let at = from
  let total = 0
  while (left.length) {
    left.sort((a, b) => dist(a, at) - dist(b, at))
    const n = left.shift()!
    total += dist(at, n)
    at = n
  }
  return total
}


function candidate(seed: number): Vec[] {
  let s = seed
  const rnd = () => {
    const [v, s2] = next(s)
    s = s2
    return v
  }
  // First suitcase: 4 to 6 m ahead of the spawn, within 25 degrees of its view direction (-z).
  const d = 4 + rnd() * 2
  const a = (rnd() * 2 - 1) * ((25 * Math.PI) / 180)
  const pts: Vec[] = [{ x: SPAWN.x + Math.sin(a) * d, z: SPAWN.z - Math.cos(a) * d }]
  for (let tries = 0; pts.length < SUITCASES && tries < 400; tries++) {
    const p = { x: (rnd() * 2 - 1) * (HALF - 1.5), z: (rnd() * 2 - 1) * (HALF - 1.5) }
    if (inObstacle(p, 1.2) || dist(p, SPAWN) < 3) continue
    if (pts.some((q) => dist(p, q) < 4)) continue
    pts.push(p)
  }
  return pts
}

// The greedy bot of test/game.mjs, as a pure function (also used to keep layouts winnable).
export function greedyInput(state: State): Input {
  let best: Suitcase | null = null
  for (const c of state.suitcases) if (!c.taken && (!best || dist(c, state.player) < dist(best, state.player))) best = c
  return best ? { x: best.x - state.player.x, z: best.z - state.player.z, run: true } : { x: 0, z: 0 }
}

export function simulate(state: State, decide: (s: State) => Input, stepMs = 100, maxSeconds = ROUND_SECONDS): State {
  let s = state
  const ticks = Math.round(stepMs / (1000 / 60))
  for (let t = 0; t < (maxSeconds * 1000) / stepMs && s.mode === 'play'; t++) {
    const input = decide(s)
    for (let i = 0; i < ticks && s.mode === 'play'; i++) s = step(s, input, 1 / 60)
  }
  return s
}

export const BOT_MIN_LEFT = 15 // s the bot must have left on every layout (GDD, difficulty table)
const ROUTE_MIN = 55
const ROUTE_MAX = 75

function fresh(layout: number, points: Vec[]): State {
  return {
    mode: 'play', timeLeft: ROUND_SECONDS, elapsed: 0, collected: 0, finishTime: null, layout,
    player: { ...SPAWN, vx: 0, vz: 0, yaw: SPAWN_YAW, speed: 0, standT: 1 },
    suitcases: points.map((p) => ({ ...p, taken: false, takenAt: 0 })),
  }
}

// One fixed layout per number 1..LAYOUTS: the first attempt that meets the rules of the GDD wins
// (route 55 to 75 m, five suitcases at least 4 m apart, the greedy bot clears it with 15 s left).
export function createState(layout = 1): State {
  const n = ((((layout - 1) % LAYOUTS) + LAYOUTS) % LAYOUTS) + 1
  for (let attempt = 0; attempt < 4000; attempt++) {
    const pts = candidate(n * 7919 + attempt * 104729)
    if (pts.length < SUITCASES) continue
    const len = routeLength(pts)
    if (len < ROUTE_MIN || len > ROUTE_MAX) continue
    const done = simulate(fresh(n, pts), greedyInput)
    if (done.mode === 'won' && done.timeLeft >= BOT_MIN_LEFT) return fresh(n, pts)
  }
  throw new Error(`no layout ${n} meets the rules`)
}

const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

// One tick of the run: move, pick up, count the clock down. After the end nothing changes.
export function step(state: State, input: Input, dt: number): State {
  if (state.mode !== 'play') return state
  const len = Math.hypot(input.x, input.z)
  const go = len > 0.05
  const target = go ? (input.run ? RUN : WALK) : 0
  const tvx = go ? (input.x / len) * target : 0
  const tvz = go ? (input.z / len) * target : 0
  const k = 1 - Math.exp(-dt / (go ? EASE : BRAKE))
  const vx = state.player.vx + (tvx - state.player.vx) * k
  const vz = state.player.vz + (tvz - state.player.vz) * k
  const moved = collide({ x: state.player.x + vx * dt, z: state.player.z + vz * dt })
  const speed = Math.hypot((moved.x - state.player.x) / dt, (moved.z - state.player.z) / dt)
  const moving = go && speed > 0.1
  let yaw = state.player.yaw
  if (go) yaw = yaw - angleDiff(yaw, Math.atan2(input.x, input.z)) * (1 - Math.exp(-dt / 0.04)) // about 120 ms to turn
  const elapsed = state.elapsed + dt
  let collected = state.collected
  const suitcases = state.suitcases.map((c) => {
    if (c.taken || dist(c, moved) > REACH) return c
    collected += 1
    return { ...c, taken: true, takenAt: elapsed }
  })
  const timeLeft = Math.max(0, state.timeLeft - dt)
  const won = collected >= SUITCASES
  const lost = !won && timeLeft <= 0
  return {
    ...state,
    mode: won ? 'won' : lost ? 'lost' : 'play',
    timeLeft, elapsed, collected,
    finishTime: won ? ROUND_SECONDS - timeLeft : null,
    player: { x: moved.x, z: moved.z, vx, vz, yaw, speed: Math.hypot(vx, vz), standT: moving ? 0 : state.player.standT + dt },
    suitcases,
  }
}

// Idle once the figure has had no move input for 200 ms (it may still coast to a stop under the clip).
export const clipOf = (p: Player): 'idle' | 'walk' => (p.standT >= IDLE_AFTER ? 'idle' : 'walk')
