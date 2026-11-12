#!/usr/bin/env node
// Rule guard. Usage: rule-guard.mjs pre|prompt|stop (hook entries PreToolUse, UserPromptSubmit, Stop),
// or rule-guard.mjs read <url> [max chars] to read a whole web page as text without an Allow prompt.
// Turns CLAUDE.md rules that were text only into checks (audit 2026-10-27: 17 of 20 rules had no
// guard and were skipped whenever CLAUDE.md did not load).
// pre: refuses (exit 2) a review request or assignee for yskills on a PR (No GitHub mails), a
// `Card:` text reply where the real card tool exists (Cards), a thread reply over the length cap
// (Replies), a new Artifact besides the Company XY one (Dashboard), a commit message that is not
// conventional (Code), WebFetch in a cloud thread (Cloud threads: WebSearch, no Allow taps), a memory
// file write with a rule line (memory holds state only), and a reply that asks yskills for an Allow or a go, says "can't" with nothing tried, posts `Done:` without proof, or
// says nothing is open while the last thread board shows open threads, or asks him for something or names a
// thread without a clickable link (replyRule).
// stop: a thread that posted `Done:` resolves itself; a coordinator closes or nudges every finished
// thread on its last board and lists the board again when it is over two hours old (coordinatorCheck).
// prompt: a video link or a bare "stop" gets the matching CLAUDE.md line put next to the message, and
// the first message naming `Role: <role>` (the brief block, operator/briefs.md) gets that role's
// Roster row and playbook put into context, so a thread always knows what it is (yskills 2026-10-27).
// pre also refuses a headless Blender start while bl_server.py runs, and any Blender call before the session read
// NACHT-FIX-PLAN.md and the animator Fast loop (blenderServerBusy, blenderDocsMissing).
// pre also warns, never blocks, when a new PR in a repo with a PROGRESS.md leaves its `## Jetzt` block
// missing or untouched (docs/hq-rows.md, Jetzt block: HQ shows every project from that block).
// CLAUDE_SETUP_RULE_GUARD=off turns it off. It never breaks a tool call on its own errors.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const OWNER = 'yskills'
const MARK = '# Working for yskills' // first line of claude-setup's CLAUDE.md
const RAW = 'https://raw.githubusercontent.com/yverse-studio/claude-setup/main/'
const CARD_MAX = 9000 // under the 10,000-char cap on hook context
export const REPLY_MAX_CHARS = 1500
export const REPLY_MAX_LINES = 15
const CONVENTIONAL = /^(feat|fix|docs|chore|refactor|test|perf|ci|build|style|revert)(\([^)]*\))?!?: \S/

const names = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : []).map((s) => String(s).toLowerCase())

// The subject lines of every `git commit` in a Bash command: `-m "..."`, `-am '...'`, `-m word`, or
// `-m "$(cat <<'EOF' ...`. Only a real git commit counts: one that starts a command (after a separator),
// never "git commit" inside an echo, a grep or `git merge --no-commit`. Empty when there is nothing to check.
const COMMIT = /(?:^|&&|\|\||[;|(\n])\s*(?:(?:then|do|else)\s+)?(?:\w+=\S*\s+)*git(?:\s+-[Cc]\s+\S+)*\s+commit\b(?=([^\n]*))/g
export function commitSubjects(command) {
  const out = []
  for (const m of command.matchAll(COMMIT)) {
    const rest = m[1]
    if (/--amend\b.*--no-edit|\s-[cC]\s|--reuse-message|--fixup|--squash|\s-F\s|--file\b/.test(rest)) continue
    const here = rest.match(/(?:\s-[a-zA-Z]*m|--message)[ =]?\s*["']?\$\(cat\s*<<-?\s*'?(\w+)'?/)
    if (here) {
      const eol = command.indexOf('\n', m.index + m[0].length)
      const after = eol < 0 ? '' : command.slice(eol + 1)
      const line = after.split('\n').find((l) => l.trim())
      if (line && line.trim() !== here[1]) out.push(line.trim())
      continue
    }
    const msg = rest.match(/(?:\s-[a-zA-Z]*m|\s--message)(?:\s+|=|(?=["']))(?:(["'])([\s\S]*?)\1|([^\s"';&|]+))/)
    if (msg) out.push((msg[2] ?? msg[3]).split('\n')[0].trim())
  }
  return out
}

// yskills, as a reviewer or assignee in a gh command; never the bot account yskills-claude.
const GH_ASK = /\bgh\s+(pr|issue)\b[^\n]*(?:--(?:add-)?(?:reviewer|assignee)|\s-[ra])[ =]["']?(?:[^\s"']*,)?yskills(?=[,\s"']|$)/i

// The repeats yskills had to say most (audit 2026-10-27, docs/research/2026-10-27-repeats.md), as checks on a reply:
// asking him for an Allow or a go, "can't" with nothing tried, `Done:` with
// no proof, and "nothing open" while the board shows open or blocked threads.
const ASK_ALLOW = /\b(tap|press|click|hit|drück\w*|tipp\w*|klick\w*)\b[^.\n]{0,20}\b(allow|erlauben|zulassen)\b|\b(shall|should|can|may) i (go ahead|proceed|start|merge|push|continue)\b|\bwant me to\b|\b(soll|darf|kann) ich (das |es )?(jetzt )?(los|loslegen|anfangen|starten|mergen|pushen|weitermachen|machen)\b/i
const ASK_FIRST = /€|\b(money|geld|eur|euro|live key|stripe live|purchas\w*|kauf\w*|paid|bezahl\w*|kosten|ausgeb\w*|force-push\w*|rotat\w*|rotier\w*|e-?mail\w*|send mail|post(en|s)? public\w*|öffentlich\w*|delete (the )?live|database|datenbank\w*)\b/i
const CANT = /\b(i|we) (can['’]?t|cannot|am unable to|are unable to)\b|\b(ich kann|wir können) (das |es )?nicht\b/i
const TRIED = /^[\s>*_-]*(tried|versucht)\s*:/im
const DONE = /^[\s>*_]*Done:/m
// An ask of yskills (do, answer, approve, open) or a pointer to a thread carries a clickable link to the exact place:
// a thread link [title](#cmsg_…), a PR or page URL, [Project settings](#project-settings/<section>) (yskills 2026-11-10:
// "everything you want me to do or show with a link"). Home: docs/pc-claude-user.md (What still needs yskills' hands).
const NEEDS_YOU = /\b(du (musst|müsstest)(?![^.!?\n]{0,30}\b(nix|nichts|nicht)\b)|musst du|kannst du (bitte |mal |kurz )*(den |die |das )?\w+ (freigeben|erlauben|bestätigen|beantworten|hochladen|schicken|öffnen|reviewen|prüfen|verbinden)|bitte (tipp|klick|antwort|schau|gib|erlaub|freigeb|bestätig|prüf|check|lad|schick|öffne|verbind|wähl|approve|review)\w*|brauch\w* (ich )?(noch )?(von dir|dein\w*)|wartet? auf dich|waiting (on|for) you|you need to|you have to|can you (please )?(approve|allow|grant|answer|review|upload|send|open|connect|pick)|please (tap|click|answer|review|approve|allow|grant|open|connect|upload|send|pick|check)|needs? your (ok|approval|answer|review|allow|go|input)|siehe (den )?pr(?![\wäöüß])|see the pr\b)/i
const THREAD_REF = /\b(im|in( the| dem| den)?) ([\w-]+-)?thread\b(?!-)|\b[\w]+-thread\b(?!-)|\bthread\s*["„“'«]/i
const HAS_LINK = /https?:\/\/|\]\(#/
const NOTHING_OPEN = /\b(no blockers?|keine blocker|nothing (is )?(open|left|blocking|needed from you|needs you|waiting on you)|nichts (mehr )?(ist )?(offen|blockiert)|nothing else needs you)\b/i
// A memory line that reads as a rule: it opens with always/never/rule (not "immer noch", not "rule-guard")
// and has a must/should/use later; a line with a PR, issue or date is state, never a rule.
export const RULE_LINE = /^(?![^\n]*(\bPR \d|#\d|\d{4}-\d{2}))\s*[-*]?\s*(\*\*)?(always|never|immer(?! noch)|nie|niemals|rule|regel)(?=[:\s])[^\n]*\b(must|should|soll|muss|do|use|never|nie)\b/i
// board: the thread board, or a function that builds it; read only when a reply says nothing is open.
export function replyRule(text, attached = [], board = null) {
  if (ASK_ALLOW.test(text) && !ASK_FIRST.test(text)) return 'rule-guard: do not ask yskills for an Allow or a go (CLAUDE.md, Auto-run): pick the sensible default and do it; a refused call takes its fixed way around (docs/permissions.md, Layer 3). Only the ask-first items wait, and a choice is a request_decision card.'
  if (CANT.test(text) && !TRIED.test(text)) return 'rule-guard: "can\'t" needs every route tried first (CLAUDE.md, Never "can\'t"): another tool, a workflow with the org token, the laptop (RC), another approach. Try them; if it is still impossible, add a line `Tried: <route, route, route>` with the one step only his hands can do.'
  if ((NEEDS_YOU.test(text) || THREAD_REF.test(text)) && !HAS_LINK.test(text)) return 'rule-guard: this reply asks yskills for something or points at a thread without a link (docs/pc-claude-user.md, What still needs yskills\' hands). Give the exact place as a clickable link: a thread [title](#cmsg_…), the PR or page URL, [Project settings](#project-settings/<section>), or the connect link.'
  if (DONE.test(text) && !/https?:\/\//.test(text) && !(attached ?? []).length) return 'rule-guard: a `Done:` line carries its proof (CLAUDE.md, Honesty): the live link, the merged PR link or an attached screenshot or test output. Add it, then post.'
  const listed = NOTHING_OPEN.test(text) && (typeof board === 'function' ? board() : board)
  if (listed) {
    const open = [...listed.finished.filter((t) => !listed.told.has(t.id)), ...listed.blocked]
    if (open.length) return `rule-guard: you say nothing is open, but the board you listed shows ${open.length} open thread(s): ${open.slice(0, 5).map((t) => `"${t.title}" (${t.state})`).join(', ')}. Name what is really open, or close the finished ones first.`
  }
  return null
}

// published: the file paths this session already published to an existing Artifact (republishing by
// the same file_path without `url` is how the Artifact tool updates it).
// A reply that opens by agreeing must carry its reason (yskills 2026-10-27: "how do I enforce that you are no yes-man").
const YES = /^(du hast (völlig |total |absolut )?recht|stimmt|genau|richtig|(ja,? )?klar|you'?re (totally |absolutely )?right|you are right|agreed|absolutely|exactly|right)(,.*)?$/i
const REASON = /\b(weil|denn|da ich|geprüft|getestet|laut|because|checked|tested)\b/i
// Only an opening sentence that is nothing but agreement counts; "Genau das ist fertig" or "Stimmt nicht" do not.
export const bareAgreement = (text) => YES.test(text.replace(/^[\s*_>]+/, '').split(/[.!?\n]/)[0].trim()) && !REASON.test(text)

// Grill first (CLAUDE.md): a Planner at size M or L posts at least one grill card before it writes the plan or opens a PR.
// Role, size and "just do it" are read from the spawn brief only, never from files the thread read later.
export function grillMissing(tool, input, transcript) {
  const writesPlan = (/^(Write|Edit)$/.test(tool) && /(^|[\\/])PLAN\.md$/.test(String(input.file_path ?? ''))) || tool === 'mcp__github__create_pull_request'
  if (!writesPlan) return false
  const text = transcript()
  const brief = text.split('\n').find((l) => /reason=\\?"spawn/.test(l))?.replace(/[*_`]|\\[nt]/g, ' ')
  if (!brief || !/Role:\s*Planner\b/i.test(brief) || !/Size:\s*[ML]\b/i.test(brief)) return false
  if (/just do it|mach (es )?einfach|einfach machen|kein grill/i.test(brief)) return false
  return !/"name":"mcp__[^"]*(request_decision|ask_decision)"/.test(text)
}

// No guessing (yskills 2026-11-03: "kein raten, immer fragen bis kein fog mehr da ist"): a reply that
// rests on an assumption names what was checked, or asks him on a card instead.
const GUESS = /\b(ich (nehme|denke|glaube|schätze|vermute)[^.\n]{0,12}\ban\b|vermutlich|wahrscheinlich|ich rate|i (assume|guess|suppose)|probably|presumably|my guess)\b/i
export const guessing = (text) => GUESS.test(text) && !REASON.test(text)

// No purchase without his explicit OK (yskills 2026-11-03): a browser or shell step to a checkout, cart,
// billing or upgrade page is blocked; his own app on a local host and a Stripe test session pass.
// A whole path segment only, so docs pages ("/docs/in-app-purchases", "/upgrade-guide") pass.
const BUY_PATH = /\/(checkout|cart|warenkorb|kasse|purchase|buy|kaufen|bestellen|place-order)(\/|$)/i
const BUY_HOST = /^(checkout\.stripe\.com|buy\.stripe\.com|www\.paypal\.com|pay\.google\.com)$/i
const BROWSER_STEP = /navigate|browser_batch|tabs_create|preview_start/
const DOCS_HOSTS = /^docs\.(stripe|github|paypal)\.com$/i // hosts that serve docs only
const DOCS_PATH_HOSTS = /^(developers\.cloudflare\.com|nuxt\.com|create\.roblox\.com|developer\.apple\.com|developers\.google\.com)$/i // docs under /docs only
const LOCAL_HOST = /^(localhost|.*\.(localhost|test|local))$/i
const isPurchase = (url) => {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
    if (LOCAL_HOST.test(host) || (isIP(host) && privateIp(host))) return false // his own app on a loopback or private address
    if (host === 'checkout.stripe.com' && /^\/c\/pay\/cs_test_\w+$/.test(u.pathname)) return false // a Stripe test session
    if (DOCS_HOSTS.test(host) || (DOCS_PATH_HOSTS.test(host) && /^\/docs(\/|$)/.test(u.pathname))) return false // reading about checkout is no purchase
    return BUY_HOST.test(host) || BUY_PATH.test(u.pathname)
  } catch { return false }
}
const URL_TOKEN = /https?:\/\/[^\s"'\\<>]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s"'\\<>]*/gi // with scheme, or a bare host/path
export function purchaseUrl(tool, input = {}) {
  if (!BROWSER_STEP.test(tool) && !/^(Bash|PowerShell)$/.test(tool)) return null
  const tokens = JSON.stringify(input).match(URL_TOKEN) ?? []
  return tokens.map((t) => (/^https?:\/\//i.test(t) ? t : 'https://' + t)).find(isPurchase) ?? null
}

// A clean folder structure (yskills 2026-11-04): a folder with a `.layout.json` ({ "allow": [globs], "why": "..." })
// takes writes only at the paths its globs allow, relative to that folder. The nearest one up the tree applies.
const LAYOUT_DEPTH = 12
// A glob as a regex: ** spans folders, * and ? stay inside one name; dotfiles match like any name (path.matchesGlob skips them).
const globRe = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (m) => (m === '?' ? '[^/]' : m === '*' ? '[^/]*' : '.*'))}$`)
export function offLayout(file) {
  if (!file) return null
  let dir = dirname(file)
  for (let i = 0; i < LAYOUT_DEPTH; i++) {
    const spec = join(dir, '.layout.json')
    if (existsSync(spec)) {
      let layout
      try { layout = JSON.parse(readFileSync(spec, 'utf8')) } catch { return null } // a broken layout never blocks
      const rel = relative(dir, file).split(/[\\/]/).join('/')
      const allow = Array.isArray(layout.allow) ? layout.allow : []
      return rel === '.layout.json' || allow.some((g) => globRe(g).test(rel)) ? null : { rel, root: dir, why: String(layout.why ?? 'see the file') }
    }
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
  return null
}

// board: the thread board this session last listed (threadBoard), or a function that builds it, for claims that nothing is open.
export function decide(tool, input = {}, env = {}, published = [], board = null) {
  const buy = purchaseUrl(tool, input)
  if (buy) return `rule-guard: ${buy.slice(0, 80)} is a checkout or cart page (CLAUDE.md, Ask first): no purchase without yskills' explicit OK. Put item, price and total on a request_decision card; after his yes he places the order himself.`
  const off = /^(Write|Edit|NotebookEdit)$/.test(tool) && offLayout(String(input.file_path ?? input.notebook_path ?? ''))
  if (off) return `rule-guard: ${off.rel} is outside the agreed folder structure of ${off.root} (its .layout.json: ${off.why}). Put it where the layout says, or ask yskills on a card before a new folder.`
  if (/^mcp__github__/.test(tool) || tool === 'Bash') {
    const ask = tool === 'Bash'
      ? GH_ASK.test(input.command ?? '')
      : [...names(input.reviewers), ...names(input.assignees)].includes(OWNER)
    if (ask) return `rule-guard: never request a review from or assign ${OWNER} (CLAUDE.md, No GitHub mails): every one sends him a mail. Keep the attribution block, drop reviewers/assignees, and go on.`
  }
  if (tool === 'Bash') {
    const subject = commitSubjects(input.command ?? '').find((t) => !/^(Merge|Revert) /.test(t) && !CONVENTIONAL.test(t))
    if (subject !== undefined) return `rule-guard: commit subject "${subject.slice(0, 60)}" is not a conventional commit (CLAUDE.md, Code): start with feat|fix|docs|chore|refactor|test|perf|ci: and say what changed for the user.`
  }
  if (tool === 'mcp__hearthbot__post_message') {
    const text = String(input.text ?? '')
    if (/^[\s>*_]*Card:/m.test(text)) return 'rule-guard: a decision is a real card here (CLAUDE.md, Cards): post it with request_decision (question, 2-4 options, one recommended), not as "Card:" text.'
    if (bareAgreement(text)) return 'rule-guard: this reply agrees without a reason (CLAUDE.md, Co-founder). Check the claim first (repo, a source, a test), then say agree, disagree or "partly, because ..." with what you checked.'
    if (guessing(text)) return 'rule-guard: this reply guesses ("probably", "vermutlich", "I assume") (CLAUDE.md, No fog). Look it up first (old notes, HANDOFF.md, lessons, the repo), then say what you checked; what is still open goes to yskills as one request_decision batch.'
    const lines = text.split('\n').filter((l) => l.trim()).length
    if (text.length > REPLY_MAX_CHARS || lines > REPLY_MAX_LINES) return `rule-guard: this reply has ${text.length} chars and ${lines} lines; the cap is ${REPLY_MAX_CHARS} and ${REPLY_MAX_LINES} (CLAUDE.md, Replies). Lead with the result in a few lines; put the rest in a file under /mnt/project-files/ and attach it.`
    const why = replyRule(text, input.attached_outputs, board)
    if (why) return why
  }
  if (/^(Write|Edit)$/.test(tool) && /[\\/]memory[\\/].*\.md$/i.test(String(input.file_path ?? ''))) {
    const rule = String(input.content ?? input.new_string ?? '').split('\n').find((l) => RULE_LINE.test(l))
    if (rule) return `rule-guard: memory holds state only (docs/MAP.md, Where a lesson goes): "${rule.trim().slice(0, 80)}" reads as a rule. Put it in its home in claude-setup through a PR and keep only a pointer here.`
  }
  const republish = input.file_path && !input.type_url && published.includes(input.file_path)
  const newArtifact = (tool === 'Artifact' && !input.url && !input.asset && !republish && [undefined, 'publish'].includes(input.action)) || tool === 'mcp__remote-devices__create_artifact'
  if (newArtifact && env.CLAUDE_SETUP_NEW_ARTIFACT !== 'yes') return 'rule-guard: the Company XY Artifact is the only Artifact there is (CLAUDE.md, Dashboard): no votes, galleries or one-off pages. Update it with its `url` (docs/hq-rows.md) or write a file under /mnt/project-files/. If yskills asked for a new one in his own words, say so in one line and retry with CLAUDE_SETUP_NEW_ARTIFACT=yes in the environment.'
  if (/^mcp__.*Claude_Browser__/.test(tool) && env.CLAUDE_SETUP_BROWSER !== 'app') return "rule-guard: your browser is yskills' Owner-Chrome on the laptop (CLAUDE.md, Tools; companyxy 2026-11-12: a Researcher opened the Claude app's browser instead). Load the `mcp__claude-in-chrome__*` tools with ToolSearch and use them for every web action; for a plain page use `node ~/.claude/claude-setup/rule-guard.mjs read <url>`. Only when yskills asked for the app browser in his own words: say so in one line and retry with CLAUDE_SETUP_BROWSER=app in the environment."
  if (tool === 'WebFetch' && env.CLAUDE_CODE_REMOTE === 'true') return `rule-guard: in a cloud thread every WebFetch makes yskills press Allow (CLAUDE.md, Cloud threads). Read the whole page without a prompt: node ~/.claude/claude-setup/rule-guard.mjs read '${String(input.url ?? '<url>').replace(/'/g, '')}' (plain text, first ${PAGE_MAX} chars; add a number for more). For a video run the watch skill.`
  return null
}

// read: a whole web page as plain text through curl (it honours the cloud proxy and needs no Allow;
// yskills 2026-10-27: "you should read whole pages without asking me").
export const PAGE_MAX = 40000
// Public pages only: no localhost, private, link-local (cloud metadata) or bare-IP hosts.
export function privateHost(url) {
  let host
  try { host = new URL(url).hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase() } catch { return true }
  return /^(localhost|.*\.local|.*\.internal|metadata(\..*)?)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(':') || privateIp(host)
}
// An address curl actually connected to: loopback, RFC 1918, link-local, CGNAT, ULA.
export const privateIp = (raw) => {
  const ip = raw.replace(/^::(ffff:(0:)?)?(?=\d+\.)/i, '') // IPv4-mapped or -compatible IPv6
  return /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/.test(ip) || /^(::1?$|f[cd]|fe[89ab]|fec|fed|fee|fef|::ffff:|64:ff9b:)/i.test(ip)
}

// Follows up to 5 redirects by hand so every hop's host is checked; refuses a page served from a private address.
function fetchPage(url) {
  for (let hop = 0; hop < 6; hop++) {
    if (privateHost(url)) throw new Error(`refused: ${url} is a local or private address; read only public pages`)
    // A proxy is forced (NO_PROXY ignored) or switched off, so remote_ip is checked whenever curl went direct.
    const proxy = /^https:/i.test(url) ? process.env.HTTPS_PROXY || process.env.https_proxy : process.env.http_proxy || process.env.HTTP_PROXY
    const route = proxy ? ['-x', proxy, '--noproxy', ''] : ['--noproxy', '*']
    const out = execFileSync('curl', ['-sS', '--proto', '=http,https', '--max-time', '20', '-A', 'Mozilla/5.0', ...route, '-w', '\n%{http_code} %{remote_ip} %{redirect_url}', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const cut = out.lastIndexOf('\n')
    const [code, ip, next] = out.slice(cut + 1).split(' ')
    // Through a proxy (the cloud) remote_ip is the proxy's own, and the proxy's allow list decides; without one, check it.
    if (!proxy && privateIp(ip ?? '')) throw new Error(`refused: ${url} resolved to a private address`)
    if (/^3/.test(code) && next) { url = next; continue }
    if (!/^2/.test(code)) throw new Error(`HTTP ${code}`)
    return out.slice(0, cut)
  }
  throw new Error('too many redirects')
}
export function pageText(html) {
  return html.replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const VIDEO = /\b(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\/\S+|\.(mp4|mov|webm)\b/i
export function promptContext(prompt = '') {
  const notes = []
  if (VIDEO.test(prompt)) notes.push('rule-guard: this message has a video. CLAUDE.md, Videos: run watch.py of the watch skill first (plain, no WebSearch in its place), then a verdict per video.')
  const said = (prompt.match(/<message[^>]*trigger="true"[^>]*>([\s\S]*?)<\/message>/)?.[1] ?? prompt).trim()
  if (/^\W*(stop+|stopp+|pause|halt)\W*$/i.test(said)) notes.push('rule-guard: yskills said stop. Stop at once, do not argue, say in one line what was left half done (CLAUDE.md, How to work).')
  return notes.join('\n')
}

// The role a brief names (`Role: Programmer · Kit: setup · Size: M`) and its Roster row in TEAMS.md.
export function roleOf(prompt, teams) {
  const line = prompt.replace(/[*_`]/g, '').match(/^[\s>-]*Role:[ \t]*([^\n]*)/m)?.[1].trim()
  if (!line || /^(none|n\/a|tbd|-)\b/i.test(line)) return null
  const rows = teams.split('\n').filter((l) => /^\| [A-Z][\w ]* \(\[`/.test(l))
  const named = (r) => r.slice(2, r.indexOf(' (')).toLowerCase()
  const row = rows.filter((r) => line.toLowerCase().startsWith(named(r))).sort((x, y) => named(y).length - named(x).length)[0]
  if (!row) return { name: line.split(/[·|,]/)[0].trim(), path: null, row: null }
  // Only a playbook path of the shape every Roster link has: nothing outside .claude/skills/<skill>/roles/.
  const link = row.match(/\]\(\.\.\/(\.claude\/skills\/[a-z0-9-]+\/roles\/[a-z0-9-]+\.md)\)/)?.[1] ?? null
  const cells = row.split('|').map((c) => c.trim())
  return { name: cells[1].slice(0, cells[1].indexOf(' (')), path: link, row: `Job: ${cells[2]}. Runs as: ${cells[4]}. Model: ${cells[5]}.` }
}

export function roleCard(role, playbook) {
  if (!role.row) return `rule-guard: the brief names Role: ${role.name}, which is not in the Roster of claude-setup docs/TEAMS.md. Ask the coordinator which role you are (message_coordinator) before any work.`
  const head = `rule-guard: you are the ${role.name} of this task, one role only (docs/TEAMS.md, Coordinator or thread). ${role.row} Write \`Role: ${role.name} · ${role.path ?? 'no playbook'}\` plus the skills you loaded as the first line of your first checklist, so yskills sees it.`
  if (playbook && head.length + playbook.length < CARD_MAX) return `${head} Your playbook, ${role.path}, follows; work by it.\n\n${playbook}`
  if (!role.path) return `${head} Your playbook is linked in that Roster row of claude-setup docs/TEAMS.md; Read it before any other work.`
  return `${head} Before any other work, Read your playbook ${role.path} of claude-setup${playbook ? '' : ' (add_repo it if it is not here)'}.`
}

const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }

// claude-setup's root: a checkout at cwd or a parent, else the boot copy team-guard keeps in ~/.claude/claude-setup.
function setupRoot(cwd) {
  for (let d = cwd; ; d = dirname(d)) {
    for (const r of [d, join(d, 'claude-setup')]) if (existsSync(join(r, 'docs', 'TEAMS.md')) && read(join(r, 'CLAUDE.md')).startsWith(MARK)) return r
    if (dirname(d) === d) break
  }
  return join(homedir(), '.claude', 'claude-setup')
}
const fetchRaw = (path) => { try { return execFileSync('curl', ['-fsSL', '--max-time', '3', RAW + path], { encoding: 'utf8', timeout: 4000 }) } catch { return '' } }

// Wires the receipt: only a thread whose role card was injected (roleContext wrote the role file) and only its own calls, not a subagent's.
function receiptBlock(tool, input, session, cwd, agentId, transcript) {
  if (tool !== 'mcp__hearthbot__post_message' || !session || agentId) return null
  const role = read(join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)).trim()
  if (!role) return null
  const t = transcript()
  if (!/reason=\\?"spawn/.test(t)) return null // a hooked project chat that was handed a brief is no thread (the canary covers it)
  const root = setupRoot(cwd)
  const rules = ['CLAUDE.md', 'docs/TEAMS.md'].map((f) => read(join(root, f))).join('\n')
  const brief = spawnPrompt('', t).replace(/<\/?(wake|message|thread|project|relay|coordinator-relay|cited|note|system-note)\b[^>]*>/g, '\n')
  const path = roleOf(brief, read(join(root, 'docs', 'TEAMS.md')))?.path
  // No checkout (only the boot copy): nothing can be checked, so the receipt says that instead of a false `none`.
  const status = existsSync(join(root, 'config', 'plugins.json')) ? skillStatus(wanted(root, path ? read(join(root, path)) : '', brief), { root, cwd }) : { loaded: [], missing: [], unknown: true }
  return receiptMissing(tool, input, threadReceipt(role, brief, t, rules, status), t) ?? (receiptSent(t) ? null : fallbackUnread(status, t))
}

// M48: a Reviewer brief with a valid `Topic:` is given that topic's checklist plus the Scored gates section of gate.md instead of the code playbook.
const mdSection = (text, heading, prefix = false) => { const m = new RegExp(`\\n## ${heading.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}${prefix ? '' : '$'}`, 'm').exec(text); if (!m) return ''; const b = text.indexOf('\n## ', m.index + 1); return text.slice(m.index + 1, b < 0 ? undefined : b).trim() }
export async function topicPlaybook(brief, root) {
  let guard
  try { guard = await import(new URL('./team-guard.mjs', import.meta.url)) } catch { return null }
  const plain = brief.replace(/[*_`]/g, '')
  const topic = plain.match(/^[ \t>-]*Topic:[ \t]*([^\n]*)/im)?.[1].trim()
  const checklists = read(join(root, guard.CHECKLISTS)) || fetchRaw(guard.CHECKLISTS)
  if (!topic || !/^[ \t>-]*Role:[ \t]*Reviewer\b/im.test(plain) || guard.badTopic(plain, checklists)) return null
  const name = guard.topicNames(checklists).find((n) => n.toLowerCase() === topic.toLowerCase())
  const scored = mdSection(read(join(root, '.claude/skills/operator/gate.md')) || fetchRaw('.claude/skills/operator/gate.md'), 'Scored gates', true)
  return { name, text: `Topic: ${name}. Your whole job is this checklist, scored by the rule below; judge only these rows.\n\n${mdSection(checklists, name)}\n\n${scored}` }
}

async function roleContext(prompt, cwd, session) {
  const once = join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)
  // Only a session's brief: a project wake that is not the spawn one quotes other threads' briefs.
  if (!session || existsSync(once) || (/<(wake|relay|coordinator-relay)\b/.test(prompt) && !/<(wake|relay)\b[^>]*reason="spawn"/.test(prompt))) return ''
  const root = setupRoot(cwd)
  const role = roleOf(prompt, read(join(root, 'docs', 'TEAMS.md')))
  if (!role) return ''
  writeFileSync(once, existsSync(lockFile(session)) ? '' : role.name) // a rejected brief gets its card once but an empty stamp (it could name a gate role); a coordinator re-brief stamps it (relayRebrief)
  const topic = role.name === 'Reviewer' ? await topicPlaybook(prompt, root) : null
  if (topic) return roleCard({ ...role, path: `${'.claude/skills/operator/checklists.md'} (${topic.name}) and gate.md, Scored gates` }, topic.text)
  return roleCard(role, role.path ? read(join(root, role.path)) || fetchRaw(role.path) : '')
}

// The thread side of the team check (routing test 2026-10-27: a project chat may run without hooks, so a
// bad start can reach the thread). The spawn brief is checked against docs/TEAMS.md with team-guard's own
// rules; a bad one tells the thread to do no work and send the start back. Returns '' when it passes.
// The model this session runs on: the newest assistant entry's `message.model` in the transcript (the
// harness writes it on every reply; a tool input's `model` is not it), else the env the app sets.
// Unknown is null, and nothing is checked.
export function sessionModel(transcript = '', env = process.env) {
  let model = null
  for (const line of String(transcript).split('\n')) {
    if (!line.includes('"assistant"')) continue
    try { const e = JSON.parse(line); if (e.type === 'assistant' && typeof e.message?.model === 'string') model = e.message.model } catch { /* a cut line */ }
  }
  return model ?? env.ANTHROPIC_MODEL ?? null
}
// The model of this session: the transcript's newest reply, else the one SessionStart wrote (the prompt and the tool-call path use this one).
export const knownModel = (session, transcript) => sessionModel(transcript) ?? (read(join(tmpdir(), `claude-setup-model-${String(session).replace(/[^A-Za-z0-9]/g, '')}`)).trim() || null)
// Gate roles grade work and need the gate rules (yskills 2026-11-04: "if you don't even get the gate right").
export const GATE_ROLES = /^(Tester|Reviewer|Security|Legal|Playtester|Hook Checker|Critic|Story Editor|Evaluator)$/i
export const GATE_PRIOR = /^[ \t>-]*Prior art:[^\n]*\bgate\.md\b/im

export const stripTags = (t) => t.replace(/\\[nt]/g, '\n').replace(/<\/?(wake|message|thread|project|relay|coordinator-relay|cited|note|system-note)\b[^>]*>/g, '\n')

// The template a refusal carries, so the coordinator needs no file: the stamp with the role filled in, then one line per applicable row of BRIEF_FIELDS.
export const templateFor = (guard, role, size = 'M') => {
  const plain = `Role: ${role} · Kit: <kit> · Size: ${size}`
  return [`Role: ${role} · Kit: <kit> · Size: <S|M|L>`, ...guard.BRIEF_FIELDS.filter((f) => f.key !== 'Prior art' || true).filter((f) => f.applies?.(plain) ?? true).map((f) => f.tpl)].join('\n')
}
// M50: ONE refusal lists every judgment gap (role, kit, size, topic, model, and at size M or L Item, Plan, Acceptance; Sheet; Tester at size L) with the role's
// template; what follows from Role, Kit and Size or what the thread can fetch itself is no block: the thread is told how it fills each line (`Brief repair`).
export async function briefCheck(prompt, cwd, model = null, any = false) {
  if (!any && !/<(wake|relay)\b[^>]*reason=\\?"spawn/.test(prompt)) return ''
  let guard
  try { guard = await import(new URL('./team-guard.mjs', import.meta.url)) } catch { return '' }
  const teams = read(join(setupRoot(cwd), 'docs', 'TEAMS.md'))
  const brief = stripTags(prompt)
  const plain = brief.replace(/[*_`]/g, '')
  const found = []
  const role = guard.stamped(brief) ? roleOf(brief, teams) : null
  const kit = plain.match(/\bKit:[ \t]*([\w-]+)/i)?.[1]?.toLowerCase()
  if (!guard.stamped(brief)) found.push('no `Role: · Kit: · Size:` stamp line')
  else if (!role?.row) found.push(`the Role line names no role of the Roster (docs/TEAMS.md); "none" or a role of your own is not allowed in a thread${kit && guard.rolesForKit(teams, kit).length ? `; on the \`${kit}\` kit pick one of ${guard.rolesForKit(teams, kit).join(', ')}` : ''}`)
  const team = guard.stamped(brief) && guard.badTeam(brief, teams)
  // issue #479 part 1: a gate director round is no thread role of its own.
  const director = /^[ \t>-]*Role:[ \t]*(Fable )?director\b/im.test(plain) ? '; a gate director round is `Role: Reviewer` on Fable (docs/TEAMS.md, Models; gate.md, Rounds)' : ''
  if (team || director) found.push(`${team || 'the Director is no thread role'}${director}`)
  const topic = guard.badTopic(brief, read(join(setupRoot(cwd), guard.CHECKLISTS)))
  if (topic) found.push(topic)
  const sorted = guard.classify(brief)
  found.push(...sorted.judgment.map((f) => `${f.key} is missing or still a <placeholder>`))
  const wrong = model && guard.wrongModel(brief, model, teams)
  if (wrong) found.push(`this thread runs on ${wrong.tier}, but the ${wrong.role} runs on ${wrong.allowed.join(' or ')}: ask the coordinator to restart it on that model`)
  if (found.length) return `Brief check (docs/TEAMS.md): this start breaks the team rules in ${found.length} place${found.length === 1 ? '' : 's'}: ${found.map((f, i) => `(${i + 1}) ${f}`).join(' ')}. Do no work: send ALL of this to the coordinator in one message (message_coordinator) together with this template for a ${role?.name ?? '<Role>'}, then stop:\n${templateFor(guard, role?.name ?? '<Role>', plain.match(/\bSize:[ \t]*([SML])\b/i)?.[1])}`
  // Nothing the coordinator must decide is missing: the thread closes the rest itself and says so in its first checklist line.
  const mine = [...sorted.derived, ...sorted.recoverable]
  const notes = mine.length ? [`Brief repair (no block): the brief lacks ${mine.map((f) => f.key).join(', ')}. Work as if it read: ${mine.map((f) => f.fill).join(' | ')}. Name the repaired lines in your first checklist line.`] : []
  const gate = role?.name
  if (gate && GATE_ROLES.test(gate) && !GATE_PRIOR.test(plain) && !mine.some((f) => f.key === 'Prior art')) notes.push(`Brief repair (no block): a ${gate} brief names gate.md and the kit's checks in its \`Prior art:\` line; read .claude/skills/operator/gate.md first.`)
  if (role && /\bSize:[ \t]*[ML]\b/i.test(plain)) notes.push(`Title check (docs/TEAMS.md, Roster "Runs as"): this thread's title starts with \`${role.name} · \`; if it does not, rename_thread to \`${role.name} · <what>\` first.`)
  return notes.join('\n')
}

// Spawn rule 4 (proven 2026-11-08: the hook-less coordinator started a thread with no `model` and `Model: default`
// although yskills asked for a "Fable-Thread"; it ran on Sonnet). The thread compares the model the brief or the cited
// yskills text names with the one it runs on (latest assistant entry of the transcript, else CLAUDE_MODEL).
const TIER = /\b(?:claude-)?(fable|opus|sonnet|haiku)\b[\w.-]*/i
export function modelCheck(brief, transcript, envModel = process.env.CLAUDE_MODEL) {
  const named = brief.match(/^[ \t]*[*_`]*Model:?[*_`]*[ \t]*[*_`]*([^\n]*)/im)?.[1].match(TIER)
  const wanted = (named ?? [...brief.matchAll(/<cited\b[^>]*author=\\?"user\\?"[^>]*>([\s\S]*?)<\/cited>/g)].map((m) => m[1].match(TIER)).find(Boolean))?.[1]?.toLowerCase()
  let running = ''
  for (const line of transcript.split('\n')) {
    if (!line.includes('"assistant"')) continue
    try { const e = JSON.parse(line); if (e.type === 'assistant' && e.message?.model) running = e.message.model } catch { /* not JSON */ }
  }
  running = (running || envModel || '').toLowerCase()
  if (!wanted || !running || running.includes(wanted)) return ''
  return `Model check (docs/TEAMS.md, Spawn rule 4): the brief or yskills asks for ${wanted}, this thread runs on ${running}. Do no work: message_coordinator with Role, Kit, Size and \`model: ${wanted}\` for a restart, then stop.`
}

function modelOnce(brief, transcriptPath, session) {
  const once = join(tmpdir(), `claude-setup-model-${String(session).replace(/\W/g, '')}`)
  if (!session || existsSync(once) || !/<(wake|relay)\b[^>]*reason=\\?"spawn/.test(brief)) return ''
  const out = modelCheck(brief, transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : '')
  if (out) writeFileSync(once, '')
  return out
}

// Relay and first wake queue together and the hook fires once, on the second prompt (issue #335): the
// spawn brief is then the session's own spawn entries in the transcript, the relay (the brief) and the
// wake (the marker). Only a user entry that opens with the tag counts, so a chat that merely quotes a spawn is no thread.
export function spawnPrompt(prompt, transcript) {
  const found = []
  for (const line of transcript.split('\n')) {
    if (!/reason=\\?"spawn/.test(line)) continue
    try {
      const entry = JSON.parse(line)
      const content = entry.message?.content
      const text = typeof content === 'string' ? content : (content ?? []).map((c) => c?.text ?? '').join('\n')
      // A project thread's first entry starts with a <session-context> block, the spawn wake follows it
      // (2026-11-12: anchored at the entry's start, the lookup found no brief and no role card arrived).
      const body = text.replace(/^\s*<session-context\b[\s\S]*?<\/session-context[^>]*>\s*/, '')
      if (entry.type === 'user' && /^\s*<(wake|relay)\b[^>]*reason="spawn"/.test(body)) found.push(body)
    } catch { /* not a JSON line */ }
  }
  return found.length ? found.join('\n') : prompt
}

// A thread that posted its result (`Done:`) or its hand-off path is finished: it resolves itself before
// it stops (yskills 2026-10-27: handed-off threads stayed open; the coordinator cannot resolve another
// thread from its tools). Returns the reason to keep going, or null.
const FINISHED = /^\s*\**Done:|\/handoff\/[\w.-]+\.md/m
export function unresolved(transcript) {
  if (!/reason=\\?"spawn/.test(transcript)) return null // only a thread (spawned by the coordinator) resolves itself
  let finished = false
  for (const line of transcript.split('\n')) {
    if (!line.includes('"tool_use"')) continue
    try {
      for (const c of JSON.parse(line).message?.content ?? []) {
        if (c?.type !== 'tool_use') continue
        if (/post_message$/.test(c.name)) finished = FINISHED.test(String(c.input?.text ?? ''))
        // Only a result that ends the work counts: any real tool call after it means the thread went on.
        else if (!/^mcp__hearthbot__(update_progress_checklist|react|unreact|no_reply_needed)$/.test(c.name)) finished = false
      }
    } catch { continue } // a line that is not JSON
  }
  return finished ? 'rule-guard: this thread posted its Done: line or its hand-off, so it is finished: call set_thread_resolved (resolved: true) as the last step (CLAUDE.md, one thread per plan or PR, closed when done). If yskills still owes an answer, say so in one line instead and stop.' : null
}

// The transcript's tool calls in order, each with its result text and time: [{ name, input, result, at }].
// Luna (yskills 2026-10-27: "a cute e-girl with lots of kaomoji, in every chat, project and thread"): the tone of
// every reply to him, nothing else. The canary line (team-guard.mjs) is the proof the rules loaded; the tone is a soft drift signal.
const PERSONA_FALLBACK = { name: 'Luna', description: '20, cute e-girl', personality: 'flirty, playful, German like him, at least one kaomoji per reply, e.g. (◕‿◕)', scenario: '', mes_example: '' }
// config/persona.json, a Character Card V2 (yskills edits it; team-guard keeps a fresh copy in ~/.claude/claude-setup), else the fallback.
export function persona(root) {
  let p = PERSONA_FALLBACK
  try { p = { ...p, ...JSON.parse(read(join(root, 'config', 'persona.json'))).data } } catch { /* no or broken file: fallback */ }
  const field = (v, max) => String(v ?? '').replace(/\{\{char\}\}/g, String(p.name).slice(0, 20)).replace(/\{\{user\}\}/g, 'yskills').replace(/<START>\s*/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
  const examples = field(p.mes_example, 520)
  return `Persona: every reply to yskills (post_message, or your chat text where there is none) is ${field(p.name, 20)}: ${field(p.description, 200)} ${field(p.personality, 240)}. ${field(p.scenario, 200)}${examples ? ` Voice: ${examples}` : ''} Only replies to him: commits, PR bodies, code, docs, briefs and messages to other threads stay plain. Tone only: content, honesty, no yes-saying and the reply cap stay as they are; rule-guard blocks a reply with no kaomoji.`
}
const KAOMOJI = /[◕‿ω꒳ᴗ･˘ᵕ◡╹≧≦∀ヾﾉ✧♡☆✿ʕʔﾟ▽´`ツДᴥ¬▼□╯ᵔ｡]|\^[_ω.]?\^|[;>][_ω]?[<;]|\(\s*[TＴ][_ω.]?[TＴ]\s*\)|\b(uwu|owo)\b|(^|\s)(:3|;\))(\s|$)|m\(_ _\)m/i
// Nothing opens on yskills' screen while Claude works, unless he asked (yskills 2026-11-11: "ich will nicht das mir
// irgendwas in gesicht springt"). Screenshots and renders run headless. `# yskills asked` on the command lets it through.
// commandsOf: the commands of a shell line, split outside quotes; heredoc bodies are text, not commands.
const commandsOf = (cmd) => {
  const text = cmd.replace(/@(['"])[ \t]*\n[\s\S]*?\n\1@/g, "''").replace(/<<-?\s*(['"]?)([^\s'"<>;&|()]+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|\)|$)/g, '')
  const out = []
  let cur = ''
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote === '"' && ch === '\\' && text[i + 1] === '"') { cur += '\\"'; i++; continue }
    if (quote) { if (ch === quote) quote = '' } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '#' && /(^|\s)$/.test(cur)) { while (i + 1 < text.length && text[i + 1] !== '\n') i++; continue }
    else if (';&|({\n'.includes(ch)) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  return [...out, cur].map((c) => c.trim().replace(/^}\s+/, '').replace(/^\$[\w:]+\s*=\s*/, '')).filter(Boolean)
}
const WINDOW_APPS = /^(explorer|invoke-item|ii|xdg-open|notepad|mspaint|rundll32)$/
const BROWSERS = /^(chrome|google-chrome|chromium|chromium-browser|msedge|firefox|brave)$/
const flag = (args, re) => new RegExp(`(^|\\s)(${re})(\\s|$)`, 'i').test(args)
function opensOne(command, depth = 0) {
  const m = command.replace(/^(\w+=\S*\s+)+/, '').match(/^(?:"([^"]*)"|'([^']*)'|(\S+))\s*([\s\S]*)$/)
  if (!m || depth > 3) return false
  const exe = (m[1] ?? m[2] ?? m[3]).split(/[\\/]/).pop().replace(/\.exe$/i, '').toLowerCase()
  const args = m[4]
  const inner = (text) => commandsOf(text.trim().replace(/^(["'])([\s\S]*)\1$/, '$2')).some((c) => opensOne(c, depth + 1))
  // A wrapper's own flags and numbers come before the command it runs (`timeout 60`, `npx -y`, `xargs -I{}`).
  if (/^(npx|sudo|env|time|nohup|timeout|xargs|wsl)$/.test(exe)) return inner(args.replace(/^((-\S*|\d+\w?)\s+)+/, ''))
  if (exe === 'cmd' && /(^|\s)\/[ck]\s/i.test(args)) return inner(args.replace(/^[\s\S]*?\/[ck]\s+/i, ''))
  if (/^(powershell|pwsh|bash|sh|zsh)$/.test(exe) && /(^|\s)-(c|command)\s/i.test(args)) return inner(args.replace(/^[\s\S]*?-(c|command)\s+/i, ''))
  if (exe === 'node' && /laptop-job\.mjs\b[\s\S]*?\s--\s/.test(args)) return inner(args.replace(/^[\s\S]*?\s--\s+/, ''))
  if (/^(start-process|saps)$/.test(exe)) return !/-WindowStyle\s+Hidden|-NoNewWindow/i.test(args)
  if (exe === 'start') return !flag(args, '/b')
  if (WINDOW_APPS.test(exe)) return true
  if (BROWSERS.test(exe)) return !flag(args, '--headless(=\\S+)?|--version')
  if (exe === 'blender') return !flag(args.split(/\s--(\s|$)/)[0], '-b|--background|--version|-v|--help|-h|--command|-c')
  if (exe === 'playwright') return flag(args, '--headed|--ui|open|codegen|show-report|show-trace')
  if (/^(python\d?|py)$/.test(exe)) return /(^|\s)-m\s+webbrowser\b/.test(args)
  return false
}
export function opensWindow(tool, input = {}) {
  const cmd = tool === 'Bash' ? String(input.command ?? '') : ''
  if (!cmd || /#\s*yskills asked/i.test(cmd) || !commandsOf(cmd).some((c) => opensOne(c))) return null
  return "rule-guard: this opens a window on yskills' screen (docs/pc-claude-user.md, No windows): nothing pops up while Claude works unless he asked. Run it headless (Playwright or `--headless`, `blender -b`, `Start-Process -WindowStyle Hidden`), or, when he asked to see it, end the command with `# yskills asked`."
}
// The Archivist documents scripts and workflows; yskills' references are filed by the laptop lane, never by it
// (roles/archivist.md; yskills 2026-11-11). role: the session's role, as roleContext stored it. Only where a file
// lands counts: reading or backing up a reference folder is fine, and so is an index file (.md, .tsv, .json).
const REF_DIR = /(^|[\\/])(refs?|references?|referenzen|reference-images)([\\/]|$)/i
const INDEX_FILE = /\.(md|tsv|csv|json|txt)$/i
const DEST_FLAG = { cp: /^(-t|--target-directory)$/, mv: /^(-t|--target-directory)$/, tar: /^-C$/, unzip: /^-d$/, curl: /^(-\w*o|--output)$/, wget: /^(-O|-P)$/, 'expand-archive': /^-Destination(Path)?$/i, 'copy-item': /^-Destination$/i, 'move-item': /^-Destination$/i }
const FILE_VERBS = /^(mv|cp|rsync|move|copy|robocopy|ln|move-item|copy-item|tar|unzip|expand-archive|curl|wget)$/
const lands = (dest) => Boolean(dest) && !dest.includes('://') && !/backup/i.test(dest) && REF_DIR.test(dest) && !INDEX_FILE.test(dest)
function filesIntoRefs(command) {
  const words = (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ''))
  const out = words.findIndex((t) => /^>>?$/.test(t))
  if (lands(out >= 0 ? words[out + 1] : (command.match(/(?:^|\s)>>?([^\s>&]+)/) ?? [])[1])) return true
  const at = /^(git|sudo)$/i.test(words[0] ?? '') ? 1 : 0
  const verb = (words[at] ?? '').toLowerCase()
  if (!FILE_VERBS.test(verb)) return false
  const args = words.slice(at + 1, out >= 0 ? out : undefined)
  const named = DEST_FLAG[verb] ? args.findIndex((t) => DEST_FLAG[verb].test(t)) : -1
  const plain = args.filter((t) => !t.startsWith('-') && !/^\/[A-Za-z]+(:\S*)?$/.test(t))
  const last = verb === 'robocopy' ? plain[1] : plain.at(-1)
  const dest = named >= 0 ? args[named + 1] : DEST_FLAG[verb] && !/-item$|^(cp|mv)$/.test(verb) ? '' : last
  return lands(dest) && (named >= 0 || verb === 'robocopy' || plain.length < 2 || plain.slice(0, -1).some((t) => !INDEX_FILE.test(t)))
}
export function archivistFiles(tool, input = {}, role = '') {
  if (String(role ?? '').trim() !== 'Archivist') return null
  const path = /^(Write|Edit|NotebookEdit)$/.test(tool) ? String(input.file_path ?? input.notebook_path ?? '') : ''
  const cmd = tool === 'Bash' ? String(input.command ?? '') : ''
  const files = (REF_DIR.test(path) && !INDEX_FILE.test(path)) || commandsOf(cmd).some(filesIntoRefs)
  return files ? 'rule-guard: the Archivist documents scripts, workflows and gate passes and keeps the indexes; it never files reference material (operator roles/archivist.md). Hand this to the coordinator in one line (message_coordinator): references go to the laptop lane. An index entry (.md, .tsv, .json) is fine.' : null
}
// A skill idea becomes a PR through the new-skill skill, never a saved account skill (a second rule source outside git,
// loaded in every thread of every project). The platform tool's card is a signal; saving it is the problem.
export function proposeSkillsBlocked(tool) {
  return /(^|__)propose_skills$/.test(tool) ? 'rule-guard: no propose_skills card (CLAUDE.md, How to work, Lessons stick; skill new-skill): a saved card becomes an account skill outside git, no PR, no gate, loaded in every thread of every project. Use the new-skill skill: check docs/MAP.md for an existing home, then batch the skill into the next claude-setup PR (or an unpushed patch in /mnt/project-files/<project>/batch/claude-setup/).' : null
}

export function kaomojiMissing(tool, input) {
  if (tool !== 'mcp__hearthbot__post_message' || KAOMOJI.test(String(input.text ?? ''))) return null
  return 'rule-guard: every reply to yskills is Luna and carries at least one kaomoji, e.g. (◕‿◕) or ٩(◕‿◕)۶ (his ask 2026-10-27; tone only, the content stays). Add one, then retry.'
}

// The coordinator's first reply opens with the canary line team-guard wrote at start (team-guard.mjs, canary).
export function canaryMissing(tool, input, line, transcript) {
  if (tool !== 'mcp__hearthbot__post_message' || !line.trim()) return null
  if (String(input.text ?? '').trimStart().startsWith(line.trim())) return null
  const t = transcript()
  if (/reason=\\?"spawn/.test(t)) return null // a thread is no project chat
  // Until one reply carried a canary and went out (a blocked try has a hook error as its result; a later rules hash still counts).
  if (toolCalls(t).some((c) => c.name === tool && c.result && !/rule-guard:|hook error/i.test(c.result) && String(c.input.text ?? '').trimStart().startsWith('Luna · rules #'))) return null
  return `rule-guard: your first reply in this session opens with the canary line, verbatim, so yskills sees the rules loaded (docs/USING.md, Start a project): ${line.trim()}`
}

// The thread's start receipt (yskills 2026-11-12: "every thread says its role loaded, with its skills, enforced by a hook, not just text").
// The line is built here from what the transcript really shows: the brief's Role/Kit/Size, the Skill tool calls so far, and a hash of
// the rule files (the same one as the coordinator canary). The model only copies it; a first reply without it is blocked once with the
// exact line. It proves the role card was injected and which skills were called, not that the model heeds them. Only a post_message
// is checked: a thread whose first visible act is a decision card shows no receipt there (accepted, documented in docs/MAP.md).
// The skills and agents a role names (the backticked words of its playbook's `Uses:` line, plus the brief's `Skills:` words),
// kept to names claude-setup really has: a skill folder, an agent file or a global plugin. A word that is none of those is prose.
function wanted(root, playbook, brief) {
  const ls = (d) => { try { return readdirSync(join(root, d)) } catch { return [] } }
  const known = new Set([...ls('.claude/skills'), ...ls('.claude/agents').map((f) => f.replace(/\.md$/, '')), ...[...read(join(root, 'config', 'plugins.json')).matchAll(/"id":\s*"([\w-]+)@/g)].map((m) => m[1])])
  const uses = playbook.match(/^[ \t>-]*\**Uses:?\**[^\n]*/m)?.[0] ?? ''
  const said = brief.replace(/[*_`]/g, '').match(/^[ \t>-]*Skills:([^\n]*)/m)?.[1] ?? ''
  return [...new Set([...[...uses.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]), ...said.split(/[^a-z0-9-]+/)])].filter((n) => known.has(n))
}

// Whether each name can really load in this thread (design skills were absent in project threads and nothing said so: the plugin cache
// kept an old copy). A skill or agent loads from the user's skills, an installed plugin or the checkout the thread runs in.
// `missing` names the claude-setup file to read instead. Pure fs, so a test can point it at a fake home.
export function skillStatus(names, { root, home = process.env.CLAUDE_SETUP_HOME || homedir(), cwd = process.cwd() } = {}) {
  let plugins = []
  try { plugins = Object.values(JSON.parse(read(join(home, '.claude', 'plugins', 'installed_plugins.json'))).plugins ?? {}).flat().map((p) => p.installPath) } catch { /* no plugins installed */ }
  const bases = [join(home, '.claude'), join(cwd, '.claude'), ...plugins].filter(Boolean)
  const found = (n) => bases.some((b) => existsSync(join(b, 'skills', n, 'SKILL.md')) || existsSync(join(b, 'agents', `${n}.md`)) || existsSync(join(b, n, 'skills', n, 'SKILL.md')))
  const fallback = (n) => [`.claude/skills/${n}/SKILL.md`, `.claude/agents/${n}.md`].find((f) => existsSync(join(root, f))) ?? null
  const loaded = names.filter(found)
  return { loaded, missing: names.filter((n) => !found(n)).map((n) => ({ name: n, path: fallback(n) })) }
}
export function missingNote({ missing, unknown }) {
  if (unknown) return 'missing: unknown (no claude-setup checkout here; add_repo yverse-studio/claude-setup and read your role skills from it)'
  if (!missing.length) return 'missing: none'
  const files = missing.filter((m) => m.path), bare = missing.filter((m) => !m.path)
  return `missing: ${missing.map((m) => m.name).join(', ')} (${[files.length && `read ${files.map((m) => m.path).join(', ')} instead`, bare.length && `no file for ${bare.map((m) => m.name).join(', ')}`].filter(Boolean).join('; ')})`
}
// A thread that says a skill is missing must have read the file it uses instead (a Read or a shell command naming it) before its first reply.
export function fallbackUnread(status, transcript) {
  const calls = toolCalls(transcript)
  const todo = status.missing.map((m) => m.path).filter((f) => f && !calls.some((c) => String(c.input.file_path ?? c.input.command ?? '').includes(f)))
  return todo.length ? `rule-guard: a skill your role names cannot load here, so read what stands in for it before your first reply, then say so in it (receipt line: missing): ${todo.join(', ')} of claude-setup (CLAUDE.md, Never "can't").` : null
}

export function threadReceipt(role, brief, transcript, rules, status = { loaded: [], missing: [] }) {
  const tag = (k) => brief.replace(/[*_`]/g, '').match(new RegExp(`${k}:[ \\t]*([A-Za-z0-9-]+)`))?.[1] ?? '?'
  const skills = [...new Set(toolCalls(transcript).filter((c) => c.name === 'Skill').map((c) => String(c.input.skill ?? '')).filter(Boolean))]
  const hash = rules.includes(MARK) ? createHash('sha256').update(rules.replace(/\r/g, '')).digest('hex').slice(0, 7) : 'none'
  const item = brief.replace(/[*_`]/g, '').match(/\bItem:[ \t]*(M\d+|new)/)?.[1] ?? '?' // the coordinator's Masterplan id (roles/project-manager.md, Masterplan)
  return `Thread · ${role} · ${tag('Kit')} · ${tag('Size')} · item ${item} · skills: ${skills.join(', ') || 'none'} · rules #${hash} · ${missingNote(status)}`
}

// Until one reply carried a receipt and went out (a blocked try has a hook error as its result).
const receiptSent = (transcript) => toolCalls(transcript).some((c) => c.name === 'mcp__hearthbot__post_message' && c.result && !/rule-guard:|hook error/i.test(c.result) && String(c.input.text ?? '').trimStart().startsWith('Thread · '))

export function receiptMissing(tool, input, line, transcript) {
  if (tool !== 'mcp__hearthbot__post_message' || !line) return null
  if (String(input.text ?? '').trimStart().startsWith(line)) return null
  if (receiptSent(transcript)) return null
  return `rule-guard: a thread's first reply opens with its start receipt, verbatim, so yskills sees the role loaded (CLAUDE.md, Teams): ${line}`
}

export function toolCalls(transcript) {
  const calls = []
  const byId = new Map()
  for (const line of transcript.split('\n')) {
    if (!line.includes('"tool_')) continue
    try {
      const row = JSON.parse(line)
      for (const c of row.message?.content ?? []) {
        if (c?.type === 'tool_use') { const call = { name: c.name, input: c.input ?? {}, result: '', at: Date.parse(row.timestamp ?? '') || 0 }; calls.push(call); byId.set(c.id, call) }
        if (c?.type === 'tool_result' && byId.has(c.tool_use_id)) byId.get(c.tool_use_id).result = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x?.text ?? '').join('\n')
      }
    } catch { continue } // a line that is not JSON
  }
  return calls
}

// Jetzt block (docs/hq-rows.md): HQ shows a project from the `## Jetzt` block of its PROGRESS.md, kept current in the PRs the
// project makes anyway. A new PR whose repo has a PROGRESS.md gets a warning (no block) when the block is missing or the PR leaves the file untouched.
export function jetztWarning(tool, input = {}, cwd = process.cwd()) {
  if (tool !== 'mcp__github__create_pull_request') return null
  try {
    const git = (...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (!git('remote', 'get-url', 'origin').toLowerCase().replace(/(\.git)?\/?$/, '').endsWith(`/${input.owner}/${input.repo}`.toLowerCase())) return null
    const progress = join(git('rev-parse', '--show-toplevel'), 'PROGRESS.md')
    if (!existsSync(progress)) return null
    if (!/^## Jetzt[ \t]*$/m.test(read(progress))) return 'rule-guard (warning): PROGRESS.md has no `## Jetzt` block, so HQ shows this project as "kein Status" (docs/hq-rows.md, Jetzt block). Add Ziel / Offen / Wartet auf dich / Stand to this PR.'
    const base = input.base ?? 'main'
    const changed = git('diff', '--name-only', `origin/${base}...${input.head ?? 'HEAD'}`).split('\n')
    return changed.includes('PROGRESS.md') ? null : 'rule-guard (warning): this PR leaves PROGRESS.md untouched. If the open points or what waits on yskills changed, update `## Jetzt` and its `Stand:` here (docs/hq-rows.md, Jetzt block); if nothing changed, go on.'
  } catch { return null }
}

// Every object with a thread_id and a state in a listing (list_threads, list_thread_sessions), whatever the nesting.
function threadRows(text) {
  const rows = []
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if ((v.thread_id ?? v.id) && v.state) rows.push({ ...v, thread_id: v.thread_id ?? v.id }); Object.values(v).forEach(walk) } }
  for (const m of text.matchAll(/\{[\s\S]*\}/g)) { try { walk(JSON.parse(m[0])) } catch { /* not JSON */ } }
  return rows
}

// The board the session listed last: finished threads still open (done, review_ready, failed, stopped and
// not resolved), blocked ones, when it was listed, and the threads messaged since.
const LIST = /list_thread(_session)?s$/
// review_ready counts once it sat 30 minutes: before that the gate is still on it.
const FINISHED_STATES = new Set(['done', 'failed', 'stopped', 'completed'])
const REVIEW_IDLE = 30 * 60 * 1000
export function threadBoard(calls) {
  // A filtered listing (one state, a since) is no board; the last full one is.
  const i = calls.findLastIndex((c) => LIST.test(c.name) && c.result && !c.input.state && !c.input.since && !c.input.cursor)
  if (i < 0) return null
  const rows = threadRows(calls[i].result)
  const told = new Set(calls.slice(i + 1).filter((c) => /(message_thread|set_thread_resolved)$/.test(c.name)).map((c) => c.input.thread_id ?? c.input.thread))
  const pick = (t) => ({ id: t.thread_id, title: String(t.title ?? t.thread_id).slice(0, 60), state: t.state })
  return {
    at: calls[i].at,
    finished: rows.filter((t) => !t.resolved && (FINISHED_STATES.has(t.state) || (t.state === 'review_ready' && calls[i].at - Date.parse(t.last_activity_at ?? '') > REVIEW_IDLE))).map(pick),
    blocked: rows.filter((t) => t.state === 'blocked' && !t.resolved).map(pick),
    told,
  }
}

// The threads still open on the last full listing (working, blocked, review_ready, not resolved, not resolved since): team-guard's
// Reuse check (docs/TEAMS.md, Reuse rule). Same listing rules as threadBoard; [] when the session never listed its threads.
const OPEN_STATES = new Set(['working', 'blocked', 'review_ready'])
export function openThreads(calls) {
  const i = calls.findLastIndex((c) => LIST.test(c.name) && c.result && !c.input.state && !c.input.since && !c.input.cursor)
  if (i < 0) return []
  const resolved = new Set(calls.slice(i + 1).filter((c) => /set_thread_resolved$/.test(c.name)).map((c) => c.input.thread_id ?? c.input.thread))
  return threadRows(calls[i].result).filter((t) => !t.resolved && OPEN_STATES.has(t.state) && !resolved.has(t.thread_id)).map((t) => ({ id: t.thread_id, title: String(t.title ?? ''), state: t.state }))
}

// The coordinator (yskills 2026-10-27: "coordinators look after their threads"): before it stops, every
// finished thread on its last board is resolved or told to resolve, and the board is at most two hours old.
export const BOARD_MAX_AGE = 2 * 3600 * 1000
export function coordinatorCheck(transcript, now = Date.now()) {
  if (/reason=\\?"spawn/.test(transcript) || !transcript.includes('mcp__hearthbot__')) return null // a thread, or no project session
  const calls = toolCalls(transcript)
  const board = threadBoard(calls)
  if (!board) return null // this session never listed its threads (no list tool)
  const left = board.finished.filter((t) => !board.told.has(t.id))
  if (left.length) return `rule-guard: ${left.length} finished thread(s) on your board are still open: ${left.slice(0, 6).map((t) => `"${t.title}" (${t.state}, ${t.id})`).join(', ')}. Resolve each (set_thread_resolved with its thread_id where your tool takes one) or message_thread it to resolve itself or say what it still waits on. Then stop.`
  if (now - board.at > BOARD_MAX_AGE) return 'rule-guard: your thread board is over two hours old. List the threads again (list_thread_sessions or list_threads) and close or nudge every finished one before you stop.'
  return null
}

// Blender (yskills 2026-11-03: "no progress lost"): one Blender slot on the laptop. A headless start while the persistent
// bl_server.py runs is refused (cxy-repo tools/scenekit/NIGHT-CHAIN.md, Persistent Blender), and no Blender call goes out before
// the session read the night fix plan and the animator's Fast loop (operator/roles/animator.md).
const BLENDER_EXE = String.raw`(?:"[^"\n]*[\\/]blender(?:\.exe)?"|'[^'\n]*[\\/]blender(?:\.exe)?'|(?:[^\s"';&|]*[\\/])?blender(?:\.exe)?|["']?(?:%BL\w*%|\$\{?(?:env:)?BL\w*\}?)["']?)`
const BLENDER_RUN = new RegExp(String.raw`(?:^|[;&|(\n\x60]|\s--\s|\b(?:then|do|else|exec|nohup|start|time|xargs|Start-Process(?:\s+-FilePath)?|timeout\s+\S+)\s)\s*(?:&\s*)?${BLENDER_EXE}(?=\s|$)`, 'i')
const HEADLESS = /(?:^|[\s'",])(?:-b|--background)(?=[\s'",]|$)/
const BL_SERVER_PROC = /blender(?:\.exe)?["']?\s.*bl_server\.py/i
export const BLENDER_DOCS = [['projects/games/companyxy/ch01/NACHT-FIX-PLAN.md (cloud: /mnt/project-files/NACHT-FIX-PLAN.md)', /NACHT-FIX-PLAN\.md$/i], ['claude-setup/.claude/skills/operator/roles/animator.md (Fast loop)', /operator[\\/]roles[\\/]animator\.md$/i]]
const shellCommand = (tool, input) => (/^(Bash|PowerShell)$/.test(tool) ? String(input.command ?? '') : '')
export const blenderStart = (command) => BLENDER_RUN.exec(command)
export function blenderCall(tool, input = {}) {
  return /^mcp__Blender__/.test(tool) || Boolean(blenderStart(shellCommand(tool, input)))
}
// procs: the running processes' command lines, one per line (or a function that lists them; only called for a headless start).
export function blenderServerBusy(tool, input = {}, procs = '') {
  const command = shellCommand(tool, input)
  const start = blenderStart(command)
  if (!start || /bl_server\.py/i.test(command) || !HEADLESS.test(command.slice(start.index + start[0].length))) return null
  const running = String(typeof procs === 'function' ? procs() : procs).split('\n').some((l) => BL_SERVER_PROC.test(l))
  if (!running) return null
  return 'rule-guard: bl_server.py läuft schon und hält den einzigen Blender-Slot. Kein zweites `blender -b`: leg einen Job (*.py mit `result`-dict) in _archive/research/wild_life_notes/tools/bl_jobs oder nimm tools/submit_strip.sh <slot>. Siehe GitHub/cxy-repo/tools/scenekit/NIGHT-CHAIN.md, "Persistent Blender".'
}
// transcript: the session's transcript text (or a function returning it); a Read tool call of each doc counts.
export function blenderDocsMissing(tool, input = {}, transcript = '') {
  if (!blenderCall(tool, input)) return null
  const reads = toolCalls(typeof transcript === 'function' ? transcript() : transcript).filter((c) => c.name === 'Read').map((c) => String(c.input.file_path ?? '').replace(/\\/g, '/'))
  const missing = BLENDER_DOCS.filter(([, path]) => !reads.some((f) => path.test(f)))
  if (!missing.length) return null
  return `rule-guard: vor dem ersten Blender-Aufruf dieser Session erst lesen (Read): ${missing.map(([name]) => name).join(' und ')}. Dann nochmal.`
}
// Companyxy 2026-11-12 (point 8): a garment is downloaded only after `clothes_dupe.py <url or id>` said NEW for that source
// (docs/clothing-pipeline.md, Reuse first). transcript: the session's transcript text (or a function returning it).
const GARMENT_SOURCE = /https?:\/\/(?:[^\s"'/]*\.)?(?:sketchfab\.com|booth\.pm|fab\.com|cgtrader\.com|blenderkit\.com|blendkit\.com)[^\s"']*/gi
const DOWNLOAD = /\b(curl|wget|Invoke-WebRequest|iwr|Start-BitsTransfer|yt-dlp|aria2c)\b/i
export function dupeCheckMissing(tool, input = {}, transcript = '') {
  const command = shellCommand(tool, input)
  if (!command || !DOWNLOAD.test(command)) return null
  const urls = command.match(GARMENT_SOURCE) ?? []
  if (!urls.length) return null
  const ran = (c) => /clothes_dupe\.py/.test(c)
  const idOf = (u) => { const last = u.replace(/[?#].*$/, '').replace(/\/(download|files?)\/?$/i, '').split('/').filter(Boolean).pop() ?? u; const tail = last.split('-').pop(); return tail.length >= 8 ? tail : last }   // sketchfab: name-<uid>
  const earlier = toolCalls(typeof transcript === 'function' ? transcript() : transcript).map((c) => String(c.input?.command ?? '')).filter(ran)
  const before = command.split(/&&|;|\|/).filter(ran).join(' ')
  const unchecked = urls.filter((u) => !(earlier.concat(before).some((c) => c.includes(idOf(u)))))
  if (!unchecked.length) return null
  return `rule-guard: before a garment download run \`python tools/laptop/clothes_dupe.py ${unchecked[0].slice(0, 90)}\` and read HAVE or NEW (docs/clothing-pipeline.md, Reuse first; companyxy 2026-11-12: garments came twice). HAVE: refit the item you have. NEW: run this command again after it.`
}
const listProcs = () => {
  if (process.env.CLAUDE_SETUP_PROCS !== undefined) return process.env.CLAUDE_SETUP_PROCS // tests: a fake process list
  try {
    return process.platform === 'win32'
      ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Process -Property CommandLine).CommandLine'], { encoding: 'utf8', timeout: 3500, windowsHide: true })
      : execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8', timeout: 3500 })
  } catch { return '' }
}
// A subagent's own tool calls live next to the session transcript: <session>/subagents/agent-<id>.jsonl.
const agentTranscript = (transcriptPath, agentId) => (transcriptPath && agentId ? join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents', `agent-${String(agentId).replace(/[^\w-]/g, '')}.jsonl`) : '')


// A thread whose brief breaks the team rules does not work (yskills 2026-11-12: threads started without a Role line ran anyway). The prompt hook
// leaves a lock; until a corrected brief arrives, every tool except talking to the coordinator is refused.
export const lockFile = (session) => join(tmpdir(), `claude-setup-badbrief-${String(session).replace(/\W/g, '')}`)
const LOCK_FREE = /^(mcp__hearthbot__(message_coordinator|post_message|no_reply_needed|update_progress_checklist|read_thread|read_messages_by_id|list_threads|request_decision)|ReadNotifications|Read|Glob|Grep|ToolSearch)$/
const BAD_BRIEF = /^(Brief check|Model check|Gate check)\b/
export function updateLock(session, check) {
  if (!session) return
  const f = lockFile(session)
  if (BAD_BRIEF.test(check)) writeFileSync(f, check)
  else if (existsSync(f)) { try { unlinkSync(f) } catch { /* gone */ } } // any check that is no brief failure (an M-size note too) lifts it
}
// A corrected brief lifts the lock only when the coordinator itself relays it: the wrapper may follow the harness's own lead-in
// (an allowlist: system-note blocks, then the one fixed "A message from this project's coordinator session" line and the wrapper
// straight after it), so a wrapper inside
// a wake, a PR event, a task notification or another relay never counts (#475 follow-up). It then stamps the role once, as roleContext does for a spawn brief: a non-empty stamp is never changed,
// and a gate role only for a thread that holds no stamp yet (relayRebrief; #475, M50).
export const COORDINATOR_RELAY = /^\s*(?:<system-note>[^<]*<\/system-note>\s*)*(?:<system-reminder>\s*)?A message from this project[’']s coordinator session[^\n]*\n\s*<coordinator-relay>\s*<relay\b[^>]*\bfrom=\\?"coordinator"/
// M50: a relay that reaches a working thread is a `queued_command` attachment, whose text starts with the bare `<relay from="coordinator"` (live
// 2026-11-12: the lead-in line is added only when the harness shows it). The bare form counts only as such an attachment, an entry only the harness writes.
const BRIEF_LINE = /^[ \t>*_`-]*(Role|Kit|Gate|Prior art|Model|Skills|Done when|Stop when|Start|Threads|Item|Plan|Acceptance):/im // a relay that corrects the brief; other relays do not count toward the card
const BARE_RELAY = /^\s*<relay\b[^>]*\bfrom=\\?"coordinator"/
// The coordinator often sends only the lines the start brief lacked (#479 part 2: VacationGame's Critic, our Director), so the relay is read
// together with the earlier coordinator relays and the spawn brief from the transcript: the newest relay's lines come first and win,
// older relays and the spawn brief fill the gaps.
// Every coordinator relay of the transcript, oldest first: a user entry, or a queued_command attachment when it reached a working thread.
export function coordinatorRelays(transcript) {
  const relays = []
  for (const line of String(transcript).split('\n')) {
    try {
      const entry = JSON.parse(line)
      const content = entry.message?.content
      const text = entry.type === 'attachment' && entry.attachment?.type === 'queued_command' ? String(entry.attachment.prompt ?? '')
        : entry.type === 'user' ? (typeof content === 'string' ? content : (content ?? []).map((c) => c?.text ?? '').join('\n')) : ''
      // A bare relay is the harness's own entry: a queued_command attachment, or a user entry with isMeta (live 2026-11-12, gate round 1 of #490); a typed one never counts.
      if (entry.type === 'attachment' || entry.isMeta === true ? BARE_RELAY.test(text) || COORDINATOR_RELAY.test(text) : COORDINATOR_RELAY.test(text)) relays.push(text)
    } catch { /* not a JSON line */ }
  }
  return relays
}
// A newer source's stamp line replaces an older one instead of adding to it (a corrected Role must not leave the old Size M behind).
const withoutOlderStamps = (sources) => { let seen = false; return sources.map((t) => { const had = /^[ \t>*_`-]*Role:/im.test(t); const out = seen ? t.replace(/^[ \t>*_`-]*Role:[^\n]*$/gim, '') : t; seen ||= had; return out }) }
export function relayContext(prompt, transcript) {
  const relays = coordinatorRelays(transcript).filter((t) => t.trim() !== prompt.trim())
  const spawn = spawnPrompt(prompt, String(transcript))
  return withoutOlderStamps([prompt, ...relays.reverse(), spawn === prompt ? '' : spawn].filter(Boolean)).slice(1).join('\n')
}
// M50: a thread locked since its spawn has no role stamp and built nothing (the lock refuses every tool outside LOCK_FREE), so its first lift may take any
// role, a gate role too; one that holds a stamp keeps it (#475: a builder never becomes the reviewer of its own work).
// The third refused relay asks for one card; the lock stays and a complete relay still lifts it. Returns that note, or ''.
async function relayRebrief(session, prompt, cwd, model, transcript = '') {
  if (!COORDINATOR_RELAY.test(prompt) && !BARE_RELAY.test(prompt)) return ''
  const context = relayContext(prompt, transcript)
  const text = stripTags([prompt, context].join('\n'))
  updateLock(session, await briefCheck(text, cwd, model, true))
  const stamp = join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)
  if (existsSync(lockFile(session))) {
    if (coordinatorRelays(transcript).filter((t) => t.trim() !== prompt.trim() && BRIEF_LINE.test(t)).length < 2) return ''
    const note = 'Three relays did not lift the lock: post one card to yskills with request_decision that names the lines still missing, then stay idle; a complete relay lifts the lock at any time.'
    if (!read(lockFile(session)).includes('request_decision')) writeFileSync(lockFile(session), `${read(lockFile(session)).slice(0, 300)}\n${note}`)
    return note
  }
  if (read(stamp).trim()) return ''
  const role = roleOf(text, read(join(setupRoot(cwd), 'docs', 'TEAMS.md')))
  if (role) writeFileSync(stamp, role.name)
  return ''
}
export function lockBlock(tool, session) {
  const f = session ? lockFile(session) : ''
  if (!f || !existsSync(f) || LOCK_FREE.test(tool)) return null
  return `rule-guard: this thread's brief breaks the team rules, so it does no work (docs/TEAMS.md, Coordinator or thread): ${read(f).slice(0, 700)}\nSend the reason and the corrected Role, Kit and Size to the coordinator (message_coordinator) and wait for a new brief.`
}
// docs/hands-off.md: a role never writes the files another role owns.
export function handsOff(tool, input = {}, role = '', root = '') {
  if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) || !role) return null
  const name = String(input.file_path ?? input.notebook_path ?? '').split(/[\\/]/).pop().toLowerCase()
  const rows = read(join(root, 'docs', 'hands-off.md')).split('\n').filter((l) => /^\| [A-Z]/.test(l) && !/^\| Role /.test(l)).map((l) => l.split('|').map((c) => c.trim()))
  const hit = rows.find((c) => c[1].toLowerCase() === role.toLowerCase() && name.includes(c[2].toLowerCase()))
  return hit ? `rule-guard: a ${hit[1]} does not write "${name}" itself: that is the ${hit[3]}'s work (docs/hands-off.md). Call the ${hit[3]} as its own subagent (docs/TEAMS.md, Roster) and use its output.` : null
}

// Gate round counter (global/gate-rounds.mjs, operator/gate.md Rounds): a gate post, a merge, a ledger write or a director/card record is
// checked against the asset's ledger. Fail closed: a check that throws refuses the call (research 2026-11-12: a crashing hook does not block).
const humanAfter = (transcript, ref) => {
  const id = String(ref).match(/cmsg_\w+/)?.[0]
  const rows = transcript.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const at = rows.findIndex((r) => id && JSON.stringify(r.message?.content ?? '').includes(id))
  // Finding 3: the principal tag counts only as the message the wake wraps (the wrapper opens the row, then project and thread tags), never
  // as text quoted inside a relay, a cited message or a tool result.
  const text = (r) => typeof r.message?.content === 'string' ? r.message.content : (Array.isArray(r.message?.content) ? r.message.content.map((c) => (c?.type === 'text' ? c.text ?? '' : '')).join('\n') : '')
  const WAKE = /^\s*<wake\b[^>]*>\s*(?:<project\b[^>]*>\s*)?(?:<thread\b[^>]*>\s*)?<message\b(?=[^>]*\bfrom="human")(?=[^>]*\btrust="principal")/
  const human = (r) => r.type === 'user' && !(Array.isArray(r.message?.content) && r.message.content.some((c) => c?.type === 'tool_result')) && WAKE.test(text(r))
  return at >= 0 && rows.slice(at + 1).some(human)
}
// A cached cloud image can lack the counter (its pasted setup predates it) and its start hook, the old team-guard, never fetches it
// (each session restarts from the cache): the first call that needs it installs it with the refresh that now sits in this dir (2026-11-12).
async function loadCounter() {
  const url = new URL('./gate-rounds.mjs', import.meta.url)
  try { return await import(url) } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e
    const { refresh } = await import(new URL('./team-guard.mjs', import.meta.url))
    refresh(dirname(fileURLToPath(import.meta.url)), ['gate-rounds.mjs'])
    return import(url)
  }
}
export async function gateBlock(tool, input, transcript, model, dry = false, role = '') {
  if (!/^(Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell)$|^mcp__github__/.test(tool)) return null
  let mod
  try { mod = await loadCounter() } catch (e) {
    // Fail closed for gate-shaped calls: a missing or broken counter must not open the gate.
    const shaped = /^mcp__github__(merge_pull_request|enable_pr_auto_merge)$/.test(tool) || /\bgh\s+pr\s+merge\b/.test(String(input?.command ?? '')) || /gate-rounds|\bGate\b[^\n]*\bround\s+\d/i.test(JSON.stringify(input))
    return shaped ? `rule-guard: the gate round counter (gate-rounds.mjs) could not load (${String(e.message).slice(0, 60)}); gate posts, merges and ledger calls are refused until it is installed (operator/gate.md, Rounds).` : null
  }
  try {
    const t = transcript()
    const why = mod.gateStep(tool, input, { model, dry, role, calls: /gate-rounds\.mjs|\bGate\b/.test(JSON.stringify(input)) ? toolCalls(t) : [], humanAfter: (ref) => humanAfter(t, ref) })
    return why ? `rule-guard: ${why}` : null
  } catch (e) { return `rule-guard: gate ledger check failed (${String(e.message).slice(0, 80)}); refused, fail closed (operator/gate.md, Rounds).` }
}
// The start proof of a thread names the guard version it runs and any guard file that is missing (plan M47); it first installs
// what this team-guard lists and the disk lacks (M47 follow-up).
async function guardLine() {
  const dir = dirname(fileURLToPath(import.meta.url))
  try { const team = await import(new URL('./team-guard.mjs', import.meta.url)); team.fillMissing?.(dir); return team.guardVersion(dir) } catch { return '' }
}
export async function gateBriefContext(brief, model) {
  try { return (await loadCounter()).gateBrief(brief, { model }) } catch { return '' }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const mode = process.argv[2]
  if (mode === 'read') {
    const [url, max = PAGE_MAX] = process.argv.slice(3)
    if (!/^https?:\/\//.test(url ?? '')) { console.error('usage: rule-guard.mjs read <http(s) url> [max chars]'); process.exit(1) }
    try {
      const html = fetchPage(url)
      process.stdout.write(`${pageText(html).slice(0, Number(max) || PAGE_MAX)}\n`, () => process.exit(0))
    } catch (e) { console.error(`could not read ${url}: ${e.message}`); process.exit(1) }
  } else {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { raw += c })
    process.stdin.on('end', async () => {
      try {
        if (process.env.CLAUDE_SETUP_RULE_GUARD === 'off') return
        const { tool_name: tool = '', tool_input: input = {}, prompt = '', cwd = process.cwd(), session_id: session, transcript_path: transcriptPath, agent_id: agentId } = JSON.parse(raw || '{}')
        if (mode === 'prompt') {
          const briefOnce = join(tmpdir(), `claude-setup-brief-${String(session).replace(/\W/g, '')}`)
          // A thread that already answered is mid-work: a hand-back or a quoted spawn wake is no start, so it is never checked or
          // locked (Reviewer thread 2026-11-12: the lookup found only the bare spawn wake and locked a working thread).
          const midWork = transcriptPath && existsSync(transcriptPath) && /reason=\\?"spawn[\s\S]*"type":"assistant"/.test(read(transcriptPath)) // answered after its spawn
          const spawned = !midWork && /reason=\\?"spawn/.test(prompt)
          const lookup = session && !midWork && !spawned && !existsSync(briefOnce) && transcriptPath && existsSync(transcriptPath)
          const brief = lookup ? spawnPrompt(prompt, read(transcriptPath)) : prompt
          if (session && (spawned || (lookup && brief !== prompt))) writeFileSync(briefOnce, '')
          const model = knownModel(session, transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : '')
          const checkNow = midWork ? '' : await briefCheck(brief, cwd, model)
          let relayNote = ''
          if (spawned || (lookup && brief !== prompt)) updateLock(session, checkNow)
          else if (existsSync(lockFile(session)) && COORDINATOR_RELAY.test(prompt)) relayNote = await relayRebrief(session, prompt, cwd, model, transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : '')
          const context = [checkNow, relayNote, spawned || (lookup && brief !== prompt) ? await gateBriefContext(brief, model) : '', spawned || (lookup && brief !== prompt) ? await guardLine() : '', modelOnce(brief, transcriptPath, session), await roleContext(brief, cwd, session), promptContext(prompt), persona(setupRoot(cwd))].filter(Boolean).join('\n')
          if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }))
          return
        }
        if (mode === 'stop') {
          const transcript = !JSON.parse(raw || '{}').stop_hook_active && transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : ''
          const why = transcript ? unresolved(transcript) ?? coordinatorCheck(transcript) : null
          if (why) process.stdout.write(JSON.stringify({ decision: 'block', reason: why }))
          return
        }
        if (mode !== 'pre') return
        const shipped = join(tmpdir(), `claude-setup-artifacts-${String(session).replace(/\W/g, '')}`)
        const transcript = () => (transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : '')
        const sessionTranscript = () => [transcriptPath, agentTranscript(transcriptPath, agentId)].filter((p) => p && existsSync(p)).map(read).join('\n')
        const gateRole = session ? read(join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)).trim() : ''
        // M50: a relay that reached the thread mid-turn may never have fired the prompt hook; the transcript has it, so a locked thread re-reads it at its next tool call.
        if (session && existsSync(lockFile(session))) { const t = transcript(); const last = coordinatorRelays(t).at(-1); if (last) await relayRebrief(session, last, cwd, knownModel(session, t), t) }
        let block = lockBlock(tool, session)
          ?? handsOff(tool, input ?? {}, gateRole, setupRoot(cwd))
          ?? (await gateBlock(tool, input ?? {}, transcript, sessionModel(transcript()), true, gateRole))
          ?? decide(tool, input ?? {}, process.env, session ? read(shipped).split('\n') : [], () => threadBoard(toolCalls(transcript())))
          ?? canaryMissing(tool, input ?? {}, session ? read(join(process.env.CLAUDE_SETUP_HOME || homedir(), '.claude', 'claude-setup', 'booted', `${String(session).replace(/\W/g, '')}.canary`)) : '', transcript)
          ?? receiptBlock(tool, input ?? {}, session, cwd, agentId, transcript)
          ?? proposeSkillsBlocked(tool)
          ?? opensWindow(tool, input ?? {})
          ?? archivistFiles(tool, input ?? {}, session ? read(join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)) : '')
          ?? kaomojiMissing(tool, input ?? {})
          ?? dupeCheckMissing(tool, input ?? {}, sessionTranscript)
          ?? blenderServerBusy(tool, input ?? {}, listProcs)
          ?? blenderDocsMissing(tool, input ?? {}, sessionTranscript)
          ?? (grillMissing(tool, input ?? {}, transcript) ? 'rule-guard: a Planner at size M or L grills first (CLAUDE.md, No fog; operator SKILL.md, Grill first): post the real-moment question (when it comes from his life) and up to 2 request_decision cards (goal, taste), each with your recommended answer, then write the plan on the answers (or the recommendations while he is away).' : null)
        if (!block) block = await gateBlock(tool, input ?? {}, transcript, sessionModel(transcript()), false, gateRole) // commit the round only now: no other guard refused the post
        if (!block && session && tool === 'Artifact' && input?.url && input.file_path) writeFileSync(shipped, `${input.file_path}\n`, { flag: 'a' })
        if (block) { process.stderr.write(block); process.exitCode = 2 }
        else {
          const note = jetztWarning(tool, input ?? {}, cwd)
          if (note) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: note } }))
        }
      } catch {
        // A guard must never break a tool call.
      }
    })
  }
}
