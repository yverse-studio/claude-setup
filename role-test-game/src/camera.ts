// Third-person camera maths: pure, no renderer import (game-ux section 5).
import { HALF, OBSTACLES, type Box, type Vec } from './rules'

export type Look = { yaw: number; pitch: number } // yaw: view direction, forward = (sin yaw, cos yaw); pitch: camera above the pivot
export const DEG = Math.PI / 180
export const PITCH_MIN = -10 * DEG
export const PITCH_MAX = 45 * DEG
export const START_PITCH = 12.5 * DEG // atan(1.0 / 4.5): camera 2.2 m up, pivot 1.2 m up, 4.5 m back
export const PIVOT_HEIGHT = 1.2
export const BACK = 4.5 // horizontal distance behind the figure
export const MIN_BACK = 0.8

export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
export const forward = (yaw: number): Vec => ({ x: Math.sin(yaw), z: Math.cos(yaw) })

// Mouse or touch counts in, a new look out. Drag right turns the view right; drag down lifts the camera (invertY flips it).
export function applyLook(look: Look, dx: number, dy: number, sensDegPerPx: number, invertY: boolean): Look {
  const s = sensDegPerPx * DEG
  const pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, look.pitch + dy * s * (invertY ? -1 : 1)))
  return { yaw: wrap(look.yaw + dx * s), pitch }
}

// The view eases back behind the figure (auto-camera).
export function easeYaw(yaw: number, target: number, dt: number, rate = 2.2): number {
  return wrap(yaw + wrap(target - yaw) * (1 - Math.exp(-rate * dt)))
}

// Distance from `from` along unit `dir` to the first wall or box, up to `max` (spring arm). Boxes grow by `pad`.
export function rayHit(from: Vec, dir: Vec, max: number, boxes: Box[] = OBSTACLES, pad = 0.3): number {
  let best = max
  const slab = (o: number, d: number, lo: number, hi: number): [number, number] => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi ? [-Infinity, Infinity] : [Infinity, -Infinity]
    const t1 = (lo - o) / d
    const t2 = (hi - o) / d
    return [Math.min(t1, t2), Math.max(t1, t2)]
  }
  for (const b of boxes) {
    const [ax, bx] = slab(from.x, dir.x, b.x - b.hw - pad, b.x + b.hw + pad)
    const [az, bz] = slab(from.z, dir.z, b.z - b.hd - pad, b.z + b.hd + pad)
    const near = Math.max(ax, az)
    const far = Math.min(bx, bz)
    if (near <= far && far >= 0 && near >= 0 && near < best) best = near
  }
  for (const [o, d] of [[from.x, dir.x], [from.z, dir.z]] as const) {
    if (d > 1e-9) best = Math.min(best, (HALF - 0.2 - o) / d)
    if (d < -1e-9) best = Math.min(best, (-HALF + 0.2 - o) / d)
  }
  return Math.max(0, best)
}

// Where the camera sits: behind the pivot along the view, shortened where a wall or car is in the way.
export function cameraPosition(target: Vec, look: Look, back = BACK): { x: number; y: number; z: number; back: number } {
  const dir = forward(look.yaw)
  const behind = { x: -dir.x, z: -dir.z }
  const radius = back / Math.cos(START_PITCH)
  const horizontal = Math.min(radius * Math.cos(look.pitch), Math.max(MIN_BACK, rayHit(target, behind, radius * Math.cos(look.pitch))))
  const height = PIVOT_HEIGHT + horizontal * Math.tan(look.pitch)
  return { x: target.x + behind.x * horizontal, y: height, z: target.z + behind.z * horizontal, back: horizontal }
}
