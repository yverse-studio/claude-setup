import { COMMIT } from './commit.js'

// Static game: Workers Builds puts the Vite build in dist/, the assets binding serves it.
// Only /api/* runs this code (run_worker_first in wrangler.jsonc), for the live check.
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/api/config') return Response.json({ commit: COMMIT, db: false })
    return env.ASSETS.fetch(request)
  },
}
