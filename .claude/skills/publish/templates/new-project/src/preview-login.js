// Test login for previews only: how the journey check (and Claude) gets past an app login with no human and no stored
// secret. The journey job (journey.yml `run`, default branch only) asks GitHub for an OIDC token whose audience is the
// preview's origin (`https://<host>`) and sends it as `POST /api/test-login` with the JSON body `{"token": "<jwt>"}`
// (the wire format of social#41, the live protocol). The Worker checks the
// signature against GitHub's published keys and that the token comes from THIS repo's journey.yml job on the default
// branch (job_workflow_ref, event pull_request_target, github-hosted runner), then resets the preview's test data to the
// seed and signs in as the seeded test owner. A preview host is `<alias>-<name>.<sub>.workers.dev`; the live host is
// `<name>.<sub>.workers.dev` and answers nothing, and previews have their own D1, so the reset never touches live data.
const ISSUER = 'https://token.actions.githubusercontent.com'
const JWKS_URL = `${ISSUER}/.well-known/jwks`
const KEY_REFRESH_MS = 60 * 1000
const CLOCK_SKEW_S = 60
const MAX_BODY = 8192 // a JWT is ~1 KB; a bigger body is not a login
const keys = { at: 0, list: [] } // module cache: one JWKS fetch serves many logins; an unknown key id refetches at most once a minute

export function isPreviewHost(hostname, name) {
  const label = String(hostname).split('.')[0]
  return String(hostname).endsWith('.workers.dev') && label.length > name.length + 1 && label.endsWith(`-${name}`)
}

const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
const part = (seg) => JSON.parse(new TextDecoder().decode(b64u(seg)))

async function signingKey(kid, fetchJwks, now) {
  const find = () => keys.list.find((k) => k.kid === kid && k.kty === 'RSA')
  if (!find() && now - keys.at > KEY_REFRESH_MS) {
    keys.at = now
    const res = await fetchJwks(JWKS_URL)
    const body = res.ok ? await res.json() : null
    if (Array.isArray(body?.keys)) keys.list = body.keys // a malformed answer is ignored, never cached
  }
  const jwk = find()
  return jwk && crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
}

// True only for a live GitHub OIDC token meant for `audience` that this repo's journey job on `branch` minted.
export async function verifyJourneyToken(token, { audience, repo, branch, fetchJwks = fetch, now = Date.now() }) {
  try {
    const [h, p, s, extra] = String(token).split('.')
    if (!h || !p || !s || extra !== undefined) return false
    const header = part(h)
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false
    const key = await signingKey(header.kid, fetchJwks, now)
    if (!key || !(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`)))) return false
    const c = part(p)
    const t = now / 1000
    return c.iss === ISSUER && c.aud === audience && c.exp > t && c.iat <= t + CLOCK_SKEW_S && !(c.nbf > t + CLOCK_SKEW_S)
      && c.repository === repo && c.repository_owner === repo.split('/')[0]
      && c.job_workflow_ref === `${repo}/.github/workflows/journey.yml@refs/heads/${branch}`
      && c.ref === `refs/heads/${branch}` && c.event_name === 'pull_request_target' && c.runner_environment === 'github-hosted'
  } catch {
    return false
  }
}

// The `token` string of a JSON body `{token}`, or '' for a missing, oversized, non-JSON or wrong-shaped body.
async function bodyToken(request) {
  try {
    const raw = await request.text()
    const token = raw.length <= MAX_BODY ? JSON.parse(raw)?.token : ''
    return typeof token === 'string' ? token : ''
  } catch {
    return ''
  }
}

// Returns a Response, or null when this is not a test login the caller should answer (the caller then answers 404).
// repo: "<org>/<repo>" whose journey.yml may log in; branch: its default branch. seed(env): wipe the preview's test data
// and insert the known rows. signIn(request, env): the project's own session (a Response with its Set-Cookie); it runs
// after seed, so the test owner exists. fetchJwks and now are for tests.
export async function previewLogin(request, env, { name, repo, branch = 'main', seed, signIn, fetchJwks, now }) {
  const { hostname: host, origin } = new URL(request.url)
  if (request.method !== 'POST' || !isPreviewHost(host, name)) return null
  if (!(await verifyJourneyToken(await bodyToken(request), { audience: origin, repo, branch, fetchJwks, now }))) {
    return Response.json({ error: 'forbidden' }, { status: 403, headers: { 'cache-control': 'no-store' } })
  }
  await seed(env)
  return signIn(request, env)
}
