// Devices to intents: keyboard, mouse drag, touch (floating stick left, drag-look right) and a standard gamepad.
import { RUN_AT, deadzone, keyboardVector } from './intents'

export type Device = 'keyboard' | 'touch' | 'pad'
const STICK_RADIUS = 60 // px of knob travel for full deflection

export type InputLayer = {
  /** camera-relative move: x right, y forward, each -1..1, plus whether the stick asks for a run */
  move(): { x: number; y: number; run: boolean }
  /** accumulated look since the last call, in CSS px (a pad adds its right stick, scaled) */
  takeLook(dt: number): { dx: number; dy: number; touched: boolean }
  /** Q/E turn: -1, 0, 1 */
  turn(): number
  runToggled(): boolean
  device(): Device
  pressed: Set<string>
}

export type Handlers = { onPause(): void; onRestart(): void; onRunToggle(): void }

export function createInput(canvas: HTMLElement, stick: HTMLElement, knob: HTMLElement, h: Handlers): InputLayer {
  const keys = new Set<string>()
  let device: Device = 'keyboard'
  let runOn = false
  let lookDx = 0
  let lookDy = 0
  let lookTouched = false
  let stickId: number | null = null
  let stickVec = { x: 0, y: 0 }
  let dragId: number | null = null
  let last = { x: 0, y: 0 }
  const home = () => ({ x: 84, y: innerHeight - 104 })
  const place = (x: number, y: number) => { stick.style.left = `${x - 60}px`; stick.style.top = `${y - 60}px` }
  place(home().x, home().y)
  let origin = home()

  addEventListener('keydown', (e) => {
    device = 'keyboard'
    if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) h.onPause(); return }
    if (e.code === 'KeyR') { if (!e.repeat) h.onRestart(); return }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) { runOn = !runOn; h.onRunToggle(); return } // a toggle, not a hold (accessibility floor)
    keys.add(e.code)
  })
  addEventListener('keyup', (e) => keys.delete(e.code))
  addEventListener('blur', () => keys.clear())
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, input, label, .panel')) return
    if (e.pointerType === 'mouse') {
      if (e.button === 2 && dragId === null) { dragId = e.pointerId; last = { x: e.clientX, y: e.clientY } } // right-drag orbits
      return
    }
    device = 'touch'
    if (e.clientX < innerWidth / 2 && stickId === null) {
      stickId = e.pointerId
      origin = { x: e.clientX, y: e.clientY }
      place(origin.x, origin.y)
      knob.style.transform = 'translate(0px, 0px)'
    } else if (dragId === null) {
      dragId = e.pointerId
      last = { x: e.clientX, y: e.clientY }
    }
  })
  addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) {
      const dx = (e.clientX - origin.x) / STICK_RADIUS
      const dy = (e.clientY - origin.y) / STICK_RADIUS
      const len = Math.hypot(dx, dy)
      const k = len > 1 ? 1 / len : 1
      stickVec = { x: dx * k, y: -dy * k } // screen up is forward
      knob.style.transform = `translate(${dx * k * 36}px, ${dy * k * 36}px)`
    } else if (e.pointerId === dragId) {
      lookDx += e.clientX - last.x
      lookDy += e.clientY - last.y
      lookTouched = true
      last = { x: e.clientX, y: e.clientY }
    }
  })
  const up = (e: PointerEvent) => {
    if (e.pointerId === stickId) { stickId = null; stickVec = { x: 0, y: 0 }; origin = home(); place(origin.x, origin.y); knob.style.transform = 'translate(0px, 0px)' }
    if (e.pointerId === dragId) dragId = null
  }
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)

  let padStart = false
  let padA = false
  const pad = () => {
    const p = [...(navigator.getGamepads?.() ?? [])].find((g) => g && g.mapping === 'standard') // other pads: not supported
    if (!p) return null
    if (p.buttons[9]?.pressed && !padStart) { padStart = true; device = 'pad'; h.onPause() } else if (!p.buttons[9]?.pressed) padStart = false
    if (p.buttons[0]?.pressed && !padA) { padA = true; device = 'pad'; h.onRestart() } else if (!p.buttons[0]?.pressed) padA = false
    return p
  }

  return {
    pressed: keys,
    device: () => device,
    runToggled: () => runOn,
    turn: () => (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0),
    move() {
      const p = pad()
      if (p) {
        const d = deadzone(p.axes[0] ?? 0, -(p.axes[1] ?? 0))
        if (d.m > 0) { device = 'pad'; return { x: d.x, y: d.y, run: d.m > RUN_AT } }
      }
      const k = keyboardVector(keys)
      if (k.x || k.y) return { x: k.x, y: k.y, run: runOn }
      const s = deadzone(stickVec.x, stickVec.y, 0.1, 0.95)
      return { x: s.x, y: s.y, run: s.m > RUN_AT }
    },
    takeLook(dt) {
      let dx = lookDx
      let dy = lookDy
      const touched = lookTouched
      lookDx = lookDy = 0
      lookTouched = false
      const p = pad()
      if (p) {
        const r = deadzone(p.axes[2] ?? 0, p.axes[3] ?? 0)
        if (r.m > 0) { dx += r.x * 520 * dt; dy += r.y * 520 * dt; device = 'pad'; return { dx, dy, touched: true } }
      }
      return { dx, dy, touched }
    },
  }
}
