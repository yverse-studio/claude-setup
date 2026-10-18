# Growth: analytics, SEO, social, email

Checked 2026-10-03. Plugins are `@claude-plugins-official` unless noted. The marketing plan,
launch sequence and German advertising law are in the `market` skill; this table is the tools.

| Need | Pick | Why / watch out | Add it |
|---|---|---|---|
| Product analytics, error tracking, funnels, session replay, feature flags | **PostHog** (EU cloud; errors free up to 100k a month [S, 2026-10-06]) | Plugin is ~30k tokens: per project only | `posthog` plugin; MCP `https://mcp.posthog.com/mcp` |
| Simple, cookieless page analytics | **Plausible** or **Umami** | No consent banner needed for analytics alone | script tag |
| A/B tests | **GrowthBook** or PostHog experiments | | `growthbook` plugin |
| Error tracking | **PostHog** error tracking (one tool, one AVV with analytics); **Sentry** only for deep performance tracing | | `posthog` / `sentry` plugin |
| SEO (technical, content, structured data) | | | agent `seo-specialist` and ECC skill `seo` (both global) |
| Social posting and scheduling | **Postiz**, Metricool (connector), upload-post (free tier), Ayrshare (plugin) [S, 2026-10-17] | Pick one per `social-team` (TikTok drafts + scheduled post); 13+ platforms, analytics | `postiz` plugin; ECC skills `social-publisher`, `crosspost`, `x-api` |
| Instagram comment-to-DM, follower-only replies | **Instagram Messaging API** from a Worker; ManyChat if Meta's app review blocks [S, 2026-10-17] | One private reply per comment within 7 days, 24-hour window, `is_user_follow_business` for the follower check; Business/Creator account | `social-team` Community role |
| Content plan, scripts, threads | | | ECC skills `content-engine`, `brand-voice` |
| Marketing campaigns, landing copy, ad copy | | | ECC skill `marketing-campaign` |
| Transactional email (login links, receipts) | **Resend** | Simple API, React/HTML templates | `resend` plugin |
| Marketing email / newsletters | Resend audiences, or ActiveCampaign | Needs double opt-in in Germany | `activecampaign` plugin |
| Conversion tracking for ads | Meta Pixel / Conversions API, TikTok Pixel, Google tag | Only after consent; server-side events are more reliable | tags via consent manager |
| Report numbers | The project's HQ rows (`docs/hq-rows.md`) | HQ is the one dashboard for all projects | none |
