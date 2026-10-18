# App platform: auth, data, jobs, mobile, hosting

Checked 2026-10-03. Plugins are `@claude-plugins-official` unless noted. Default stack is in the
global CLAUDE.md (Nuxt 4 / Vue + Vite, Cloudflare Workers).

| Need | Pick | Why / watch out | Add it |
|---|---|---|---|
| Hosting web apps | **Cloudflare Workers** (Nuxt preset) | Default; see MyPage and TellMeY | `cloudflare` plugin |
| Long-running service, Docker | VPS + Docker + Caddy (Luna's setup), or **Render** | Costs money every month: only after yskills says yes (`CLAUDE.md`, Stack) | `render` plugin |
| Other hosts | Vercel, Netlify | Only if a project needs them | `vercel` / `netlify-skills` plugins |
| Database on Cloudflare | **D1** (SQLite) | Free tier, prepared statements | wrangler binding |
| Postgres | **Neon** or **Supabase** | Supabase adds auth + storage + realtime | `neon` / `supabase` plugins |
| Reactive backend in one package | **Convex** | | `convex` plugin |
| ORM | Drizzle (fits D1 and Postgres), Prisma | | npm; `prisma` plugin |
| Login (email link, Google, Apple) | **Better Auth** (TS library, self-hosted), Supabase Auth, or Auth0 / WorkOS for B2B SSO | Passkeys and magic links beat passwords | npm; `auth0` / `workos` plugins |
| File storage | **R2** | | wrangler binding |
| Background jobs and queues | **Cloudflare Queues** + Workflows | | wrangler binding |
| Heavy compute (FFmpeg, Python, ML) | **Cloudflare Containers** or a VPS | | `cloudflare` plugin |
| Realtime (multiplayer, live chat) | **Durable Objects** + WebSockets | | wrangler binding |
| Cache / rate limits | Workers KV, Durable Objects; Redis off-Cloudflare | | `redis-development` plugin |
| Installable app from the web | **PWA** (`@vite-pwa/nuxt`), Play Store via **Capacitor** (`store-publish`; a TWA is only a browser tab) | TellMeY's choice; cheapest path to "an app". `registerType: 'prompt'`, never `'autoUpdate'` (reloads the page after every deploy) | npm |
| Native iOS + Android from the Vue app | **Capacitor** | Reuses the web code; shipping to the stores: the `store` skill | npm |
| Native app, React | **Expo** | | `expo` plugin |
| Desktop app | **Tauri 2** | Small binaries, web UI | cargo/npm |
| CMS for content | **Sanity** | | `sanity` plugin |
| Online shop | **Shopify** | | `shopify-ai-toolkit` plugin |
| SMS, WhatsApp, phone | **Twilio** | | `twilio-developer-kit` plugin |
| PDF, Word, Excel, PowerPoint files | Anthropic document skills | | `claude plugin marketplace add anthropics/skills`, then `document-skills@anthropic-agent-skills` |
| Error tracking | **PostHog** (with analytics, EU cloud); Sentry only for deep performance tracing | | `posthog` plugin (`growth.md`) |
