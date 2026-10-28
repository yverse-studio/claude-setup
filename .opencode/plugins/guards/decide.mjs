// Pure decisions of the OpenCode guards plugin (index.js). Hooks do not run in OpenCode, so the
// [guard: ...] lines of CLAUDE.md that matter here are enforced by this plugin and by `permissions` in opencode.json.
// Data comes from docs/TEAMS.md at runtime and the tier logic from global/team-guard.mjs; nothing is copied.
import { wrongModel } from '../../../global/team-guard.mjs'

const PROVIDER = 'anthropic'
const TIERS = ['fable', 'opus', 'sonnet', 'haiku']

// tier -> `anthropic/<id>`, read from the Models line of docs/TEAMS.md (scripts/check.mjs allows no second copy of an id).
export function modelIds(teams) {
  const line = teams.match(/^Models: .*$/m)?.[0] ?? ''
  return Object.fromEntries(TIERS.flatMap((t) => {
    const id = line.match(new RegExp(`claude-${t}-[\\d-]+`))?.[0]
    return id ? [[t, `${PROVIDER}/${id}`]] : []
  }))
}

// CLAUDE.md, Code: never read real .env files (deny Read(**/.env)); .env.example stays readable.
const ENV_FILE = /(^|[\\/])(\.env(\.[^\\/]*)?|\.dev\.vars)$/i
export const isEnvFile = (p) => ENV_FILE.test(p) && !/\.example$/i.test(p)
const ENV_WHY = 'guards (env rule): real .env files are never read or edited (CLAUDE.md, Code; deny Read(**/.env)). Read .env.example for the names; a value only yskills can set is a step for him.'

// Plain shell denies of global/settings.json, kept here because a deny in opencode.json shows the model only
// "Permission denied: shell" (tested live), while a plugin block carries the rule. [test, rule it enforces]
const AT = '(^|[\\s"\';&|(])'
const FORCE = /(^|\s)(--force\S*|--mirror|-[a-zA-Z]*f[a-zA-Z]*)(\s|$)|\s\+\S*\b(main|master)\b/
const SHELL = [
  [(c) => new RegExp(`${AT}(npm|pnpm|yarn)\\s+run\\s+(deploy|ship)`, 'i').test(c), 'npm run deploy* / npm run ship* (CLAUDE.md, Before calling work done: never a deploy script; the merge is the deploy; deny Bash(npm run deploy *))'],
  [(c) => new RegExp(`${AT}(wrangler\\s+deploy|firebase\\s+deploy|vercel\\s[^\\n]*--prod)`, 'i').test(c), 'a direct deploy (wrangler, firebase, vercel --prod; CLAUDE.md, the merge is the deploy)'],
  [(c) => new RegExp(`${AT}(pkill|killall|taskkill|Stop-Process)\\b[^\\n]*wrangler`, 'i').test(c), 'pkill *wrangler* (CLAUDE.md, Tools: stop a dev server by port, never pkill it)'],
  [(c) => /\bgit\b[^\n]*\bpush\b/.test(c) && FORCE.test(c) && /\b(main|master)\b/.test(c), 'git push --force to main (CLAUDE.md, Ask first only before: force-pushing main; deny Bash(git push* --force*main*))'],
]

// action and resources as the permission check sees them: a path for read and edit, command segments for shell.
export function permissionBlock(action, resources = []) {
  if (action === 'shell') {
    for (const c of resources) {
      const rule = SHELL.find(([hit]) => hit(c))?.[1]
      if (rule) return `guards (shell rule): \`${c.slice(0, 80)}\` is blocked: ${rule}. Run what CI runs instead and let the PR gate merge.`
    }
  }
  const paths = action === 'shell' ? resources.flatMap((r) => r.split(/[\s"'<>=|;&(),`]+/)) : ['read', 'edit'].includes(action) ? resources : []
  return paths.some(isEnvFile) ? ENV_WHY : null
}

// docs/TEAMS.md, Spawn rule 4: a subagent without its own model inherits its parent's (Opus), so a call needs an agent with a model, and the role named in its prompt must allow that tier.
export function subagentBlock({ agent, prompt = '' }, model, teams) {
  if (!model) return `guards (team-guard): the subagent "${agent}" has no model of its own, so it would inherit the parent's (docs/TEAMS.md, Spawn rule 4). Call the tier agent the role's Roster row names (${TIERS.join(', ')}) and retry.`
  const ref = typeof model === 'string' ? model : `${model.providerID}/${model.id}`
  const wrong = wrongModel(prompt, ref, teams)
  return wrong ? `guards (team-guard): the ${wrong.role} runs on ${wrong.allowed.join(' or ')} (docs/TEAMS.md, Roster), not ${wrong.tier}. Call that tier's agent. For an exception the row names add \`Model: <tier> (<why>)\` to the prompt; if yskills named this model, say "yskills named <model>". Then retry.` : null
}
