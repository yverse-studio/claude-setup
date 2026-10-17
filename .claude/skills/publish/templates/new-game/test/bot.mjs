// The bot scripts/play.mjs plays with: reads render_game_to_text() and returns the direction to hold.
// Rewrite it for the game; `min` is the score a sane run must reach (the play check fails below it).
export const min = 20

export function decide(state) {
  let best = null
  for (const coin of state.coins) {
    const d = Math.hypot(coin.x - state.player.x, coin.z - state.player.z)
    if (!best || d < best.d) best = { d, x: coin.x - state.player.x, z: coin.z - state.player.z }
  }
  return best ? { x: best.x, z: best.z } : { x: 0, z: 0 }
}
