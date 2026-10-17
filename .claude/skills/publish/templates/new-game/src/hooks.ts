// Test hooks: let a headless thread (or a bot) play the game. game-3d skill, section 4.
// render_game_to_text() = what a player sees, as JSON; advanceTime(ms) = play that much game time
// at once and draw; __playInput(x, z) = hold a direction (null lets go). Add every state a bot needs
// to see to the text; keep the names, scripts/play.mjs and the gate's evaluator call them.
import { ARENA, isOver, type Input, type State } from './rules'

export type Hooks = {
  state: () => State
  advance: (ms: number) => void
  hold: (input: Input | null) => void
}

export function installHooks(hooks: Hooks) {
  Object.assign(window, {
    render_game_to_text: () => {
      const s = hooks.state()
      return JSON.stringify({ mode: isOver(s) ? 'over' : 'playing', score: s.score, timeLeft: s.timeLeft, player: s.player, coins: s.coins, arena: ARENA })
    },
    advanceTime: (ms: number) => hooks.advance(ms),
    __playInput: (x: number, z: number) => hooks.hold(Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null),
  })
}
