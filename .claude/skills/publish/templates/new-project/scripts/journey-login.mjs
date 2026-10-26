// The journey job's proof for `POST /api/test-login`: a GitHub OIDC token whose audience is the preview's origin, sent as the
// JSON body `{token}` (src/preview-login.js verifies it). The runner offers one only to a job with `id-token: write`
// (journey.yml `run`, which runs the default branch's specs and no PR code). Nothing is stored anywhere. For a local run
// against a preview, `JOURNEY_LOGIN_TOKEN` (a token minted for that origin) is used instead of asking the runner.
export async function previewLoginRequest(base) {
  const { origin } = new URL(base)
  const token = process.env.JOURNEY_LOGIN_TOKEN || (await mintToken(origin))
  console.log(`::add-mask::${token}`) // a later log line or Playwright call log can never show the token
  return { data: { token }, headers: { origin } }
}

async function mintToken(audience) {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!url || !bearer) throw new Error('no GitHub OIDC token here: the test login works only inside journey.yml (permissions: id-token: write) or with JOURNEY_LOGIN_TOKEN')
  const res = await fetch(`${url}&audience=${encodeURIComponent(audience)}`, { headers: { authorization: `Bearer ${bearer}` } })
  if (!res.ok) throw new Error(`GitHub OIDC token request answered ${res.status}`)
  return (await res.json()).value
}
