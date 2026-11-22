// The one file a game fills in for scripts/play.mjs, scripts/bot.mjs and scripts/shots.mjs.
// The bot walks to the nearest suitcase in a straight line and runs (the same greedy rule as rules.ts greedyInput).

// Suitcases a bot round must collect: all five (the layouts are made so the greedy bot always wins).
export const min = 5
// The bot must have at least this many seconds left on every layout (GDD, difficulty table).
export const minTimeLeft = 15

export const stepMs = 100
export const maxSteps = 700 // 70 s of game time: a round that never ends fails

export const spots = [
  { name: 'start', steps: 0 },
  { name: 'mid', steps: 120 },
  { name: 'end', steps: null },
]

// Reads render_game_to_text() and returns the arguments for window.__playInput (a world direction).
export function decide(state) {
  let best = null
  for (const c of state.suitcases) {
    if (c.taken) continue
    const d = Math.hypot(c.x - state.player.x, c.z - state.player.z)
    if (!best || d < best.d) best = { d, x: c.x - state.player.x, z: c.z - state.player.z }
  }
  return best ? [best.x, best.z] : [0, 0]
}
