// The one file a new game fills in for scripts/play.mjs (plays a round) and scripts/shots.mjs
// (screenshots at 390 and 1440). Rewrite it together with src/rules.ts and src/hooks.ts.

// Score a sane bot round must reach; about 60 % of what the bot scores. A bot that dies is fine,
// one that cannot move is not.
export const min = 20

// Game time per bot decision, and the most decisions per round (a round that never ends fails).
export const stepMs = 100
export const maxSteps = 1000

// What shots.mjs captures: the bot plays `steps` decisions first (null = until the round is over).
export const spots = [
  { name: 'start', steps: 0 },
  { name: 'mid', steps: 100 },
  { name: 'end', steps: null },
]

// Reads render_game_to_text() and returns the arguments for window.__playInput (here x, z).
export function decide(state) {
  let best = null
  for (const coin of state.coins) {
    const d = Math.hypot(coin.x - state.player.x, coin.z - state.player.z)
    if (!best || d < best.d) best = { d, x: coin.x - state.player.x, z: coin.z - state.player.z }
  }
  return best ? [best.x, best.z] : [0, 0]
}
