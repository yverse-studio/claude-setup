// Test login for previews only: how the journey check (and Claude) gets past an app login with no human.
// `POST /api/test-login` with `Authorization: Bearer <PREVIEW_LOGIN_TOKEN>` resets the preview's test data to
// the seed and signs in as the seeded test owner. PREVIEW_LOGIN_TOKEN is set by claude-setup's new-project
// (or the preview-login workflow) on the Worker's previews env and as the repo's Actions secret, never on the
// live Worker, so live has no token and this returns null there. A preview host is `<alias>-<name>.<sub>.workers.dev`;
// the live host is `<name>.<sub>.workers.dev`. Previews have their own D1, so the reset never touches live data.
const enc = new TextEncoder()

export function isPreviewHost(hostname, name) {
  const label = String(hostname).split('.')[0]
  return String(hostname).endsWith('.workers.dev') && label.length > name.length + 1 && label.endsWith(`-${name}`)
}

// Constant time: compares HMACs of both strings under a throwaway key, so length and content leak nothing.
async function sameToken(a, b) {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(s)))))
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

// Returns a Response, or null when this is not a test login the caller should answer (the caller then answers 404).
// seed(env): wipe the preview's test data and insert the known rows. signIn(request, env): the project's own session
// (a Response with its Set-Cookie); it runs after seed, so the test owner exists.
export async function previewLogin(request, env, { name, seed, signIn }) {
  const host = new URL(request.url).hostname
  if (request.method !== 'POST' || !env.PREVIEW_LOGIN_TOKEN || !isPreviewHost(host, name)) return null
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!(await sameToken(given, env.PREVIEW_LOGIN_TOKEN))) return Response.json({ error: 'forbidden' }, { status: 403, headers: { 'cache-control': 'no-store' } })
  await seed(env)
  return signIn(request, env)
}
