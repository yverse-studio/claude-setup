// The journey job's proof for `POST /api/test-login`: a GitHub OIDC token whose audience is the preview's host. The runner
// offers one only to a job with `id-token: write` (journey.yml `run`, which runs the default branch's specs and no PR code).
// Nothing is stored anywhere; the Worker verifies it (src/preview-login.js).
export async function previewLoginHeaders(base) {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!url || !bearer) throw new Error('no GitHub OIDC token here: the test login works only inside journey.yml (permissions: id-token: write)')
  const audience = new URL(base).hostname
  const res = await fetch(`${url}&audience=${encodeURIComponent(audience)}`, { headers: { authorization: `Bearer ${bearer}` } })
  if (!res.ok) throw new Error(`GitHub OIDC token request answered ${res.status}`)
  const { value } = await res.json()
  console.log(`::add-mask::${value}`) // a later log line or Playwright call log can never show the token
  return { authorization: `Bearer ${value}`, origin: new URL(base).origin }
}
