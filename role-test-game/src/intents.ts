// Pure helpers between devices and the rules: input.ts reads devices, main.ts feeds `step` (game-ux section 1: one input layer).
import { forward } from './camera'
import type { Input, Vec } from './rules'

export const DEAD_INNER = 0.15
export const DEAD_OUTER = 0.95
export const RUN_AT = 0.9 // stick pushed past this runs

// Radial dead zone for a stick: below inner nothing, above outer full, in between rescaled, direction kept.
export function deadzone(x: number, y: number, inner = DEAD_INNER, outer = DEAD_OUTER): { x: number; y: number; m: number } {
  const len = Math.hypot(x, y)
  if (len <= inner) return { x: 0, y: 0, m: 0 }
  const m = Math.min(1, (len - inner) / (outer - inner))
  return { x: (x / len) * m, y: (y / len) * m, m }
}

// Keys by KeyboardEvent.code, so a French layout still walks on its own Z key (KeyW).
export const KEY_FORWARD = ['KeyW', 'ArrowUp']
export const KEY_BACK = ['KeyS', 'ArrowDown']
export const KEY_LEFT = ['KeyA', 'ArrowLeft']
export const KEY_RIGHT = ['KeyD', 'ArrowRight']
const any = (keys: Set<string>, codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0)

export function keyboardVector(keys: Set<string>): { x: number; y: number } {
  return { x: any(keys, KEY_RIGHT) - any(keys, KEY_LEFT), y: any(keys, KEY_FORWARD) - any(keys, KEY_BACK) }
}

// A move relative to the camera (x right, y forward) becomes a world direction.
export function toWorld(mx: number, my: number, camYaw: number, run: boolean): Input {
  const f = forward(camYaw)
  const r: Vec = { x: -f.z, z: f.x }
  const x = f.x * my + r.x * mx
  const z = f.z * my + r.z * mx
  const len = Math.hypot(x, z)
  return len > 1 ? { x: x / len, z: z / len, run } : { x, z, run }
}

// Which letters name the four keys on this layout (AZERTY shows ZQSD). `layout` is Keyboard.getLayoutMap() or null.
export function keyLabels(layout: { get(code: string): string | undefined } | null): string {
  const label = (code: string, fallback: string) => (layout?.get(code) ?? fallback).toUpperCase()
  return [label('KeyW', 'W'), label('KeyA', 'A'), label('KeyS', 'S'), label('KeyD', 'D')].join('')
}
