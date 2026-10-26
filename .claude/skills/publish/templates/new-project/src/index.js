import { COMMIT } from './commit.js'
import { previewLogin } from './preview-login.js'

const texts = {
  de: { title: '__NAME__', line: 'Hier entsteht gerade etwas.', note: 'Bald mehr.' },
  en: { title: '__NAME__', line: 'Something is being made here.', note: 'More soon.' },
}

function page(lang) {
  const t = texts[lang]
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 18px/1.5 system-ui, sans-serif; color: #1f2937; background: #fffdf7; }
  main { padding: 24px; max-width: 32rem; }
  h1 { font-size: 2rem; margin: 0 0 8px; color: #1f3fbf; }
  p { margin: 0; }
  small { color: #6b7280; }
</style>
</head>
<body>
<main>
  <h1>${t.title}</h1>
  <p>${t.line}</p>
  <p><small>${t.note}</small></p>
</main>
</body>
</html>`
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/config') {
      return Response.json({ commit: COMMIT, db: Boolean(env.DB) })
    }
    if (url.pathname === '/api/test-login') {
      // Day-zero seed: the one `meta` row a journey can read back; a project with a login replaces both callbacks.
      const out = await previewLogin(request, env, {
        name: '__NAME__',
        repo: 'yverse-studio/__NAME__',
        seed: async (e) => { if (e.DB) await e.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seed', 'test')").run() },
        signIn: async () => Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } }),
      })
      return out || Response.json({ error: 'not_found' }, { status: 404 })
    }
    const lang = (request.headers.get('accept-language') || '').toLowerCase().startsWith('en') ? 'en' : 'de'
    return new Response(page(lang), { headers: { 'content-type': 'text/html; charset=utf-8' } })
  },
}
