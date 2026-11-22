// Test hooks: let a headless thread (or a bot) play the game. game-3d skill, section 4, and the contract in
// role-test/tester-journey.md. render_game_to_text() = what a player sees, as JSON; advanceTime(ms) = play that
// much game time at once and draw; __playInput(x, z) = hold a world direction ((0,0) or NaN lets go);
// __lookBy(dx, dy) = turn the camera by mouse counts.
import { clipOf, type Input, type State } from './rules'

export type Hooks = {
  state: () => State
  paused: () => boolean
  camera: () => { x: number; y: number; z: number }
  advance: (ms: number) => void
  hold: (input: Input | null) => void
  look: (dx: number, dy: number) => void
  stats: () => Record<string, number>
}

export function installHooks(h: Hooks) {
  Object.assign(window, {
    render_game_to_text: () => {
      const s = h.state()
      const clip = clipOf(s.player)
      return JSON.stringify({
        mode: h.paused() && s.mode === 'play' ? 'paused' : s.mode,
        timeLeft: Math.round(s.timeLeft * 1000) / 1000,
        collected: s.collected,
        layout: s.layout,
        finishTime: s.finishTime,
        player: { x: s.player.x, z: s.player.z, yaw: s.player.yaw, speed: s.player.speed, clip },
        clip,
        suitcases: s.suitcases.map((c) => ({ x: c.x, z: c.z, taken: c.taken })),
        camera: h.camera(),
      })
    },
    advanceTime: (ms: number) => h.advance(ms),
    __playInput: (x: number, z: number) => h.hold(Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) > 0.001 ? { x, z, run: true } : null),
    __lookBy: (dx: number, dy: number) => h.look(dx, dy),
    __stats: () => h.stats(),
  })
}
