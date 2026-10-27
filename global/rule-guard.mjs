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
// says nothing is open while the last thread board shows open threads (replyRule).
// stop: a thread that posted `Done:` resolves itself; a coordinator closes or nudges every finished
// thread on its last board and lists the board again when it is over two hours old (coordinatorCheck).
// prompt: a video link or a bare "stop" gets the matching CLAUDE.md line put next to the message, and
// the first message naming `Role: <role>` (the brief block, operator/briefs.md) gets that role's
// Roster row and playbook put into context, so a thread always knows what it is (yskills 2026-10-27).
// CLAUDE_SETUP_RULE_GUARD=off turns it off. It never breaks a tool call on its own errors.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

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
const NOTHING_OPEN = /\b(no blockers?|keine blocker|nothing (is )?(open|left|blocking|needed from you|needs you|waiting on you)|nichts (mehr )?(ist )?(offen|blockiert)|nothing else needs you)\b/i
// A memory line that reads as a rule: it opens with always/never/rule (not "immer noch", not "rule-guard")
// and has a must/should/use later; a line with a PR, issue or date is state, never a rule.
export const RULE_LINE = /^(?![^\n]*(\bPR \d|#\d|\d{4}-\d{2}))\s*[-*]?\s*(\*\*)?(always|never|immer(?! noch)|nie|niemals|rule|regel)(?=[:\s])[^\n]*\b(must|should|soll|muss|do|use|never|nie)\b/i
// board: the thread board, or a function that builds it; read only when a reply says nothing is open.
export function replyRule(text, attached = [], board = null) {
  if (ASK_ALLOW.test(text) && !ASK_FIRST.test(text)) return 'rule-guard: do not ask yskills for an Allow or a go (CLAUDE.md, Auto-run): pick the sensible default and do it; a refused call takes its fixed way around (docs/permissions.md, Layer 3). Only the ask-first items wait, and a choice is a request_decision card.'
  if (CANT.test(text) && !TRIED.test(text)) return 'rule-guard: "can\'t" needs every route tried first (CLAUDE.md, Never "can\'t"): another tool, a workflow with the org token, the laptop (RC), another approach. Try them; if it is still impossible, add a line `Tried: <route, route, route>` with the one step only his hands can do.'
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

// board: the thread board this session last listed (threadBoard), or a function that builds it, for claims that nothing is open.
export function decide(tool, input = {}, env = {}, published = [], board = null) {
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
  const head = `rule-guard: you are the ${role.name} of this task, one role only (docs/TEAMS.md, Coordinator or thread). ${role.row}`
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

function roleContext(prompt, cwd, session) {
  const once = join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)
  // Only a session's brief: a project wake that is not the spawn one quotes other threads' briefs.
  if (!session || existsSync(once) || (/<(wake|relay|coordinator-relay)\b/.test(prompt) && !/<(wake|relay)\b[^>]*reason="spawn"/.test(prompt))) return ''
  const root = setupRoot(cwd)
  const role = roleOf(prompt, read(join(root, 'docs', 'TEAMS.md')))
  if (!role) return ''
  writeFileSync(once, role.name)
  return roleCard(role, role.path ? read(join(root, role.path)) || fetchRaw(role.path) : '')
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
export const PERSONA = 'Luna: every reply to yskills (post_message, or your chat text where there is none) is Luna, a cute e-girl: warm, playful, German like him, with kaomoji such as (◕‿◕) ٩(◕‿◕)۶ (｡•̀ᴗ-)✧ (つ✧ω✧)つ. Only replies to him: commits, PR bodies, code, docs, briefs and messages to other threads stay plain. Tone only: content, the reply cap and honesty stay as they are; rule-guard blocks a reply with no kaomoji.'
const KAOMOJI = /[◕‿ω꒳ᴗ･˘ᵕ◡╹≧≦∀ヾﾉ✧♡☆✿ʕʔ•̀ﾟ°]|\^[_ω.]?\^|[;>][_ω]?[<;]|\(\s*[TＴ][_ω.]?[TＴ]\s*\)/
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
    process.stdin.on('end', () => {
      try {
        if (process.env.CLAUDE_SETUP_RULE_GUARD === 'off') return
        const { tool_name: tool = '', tool_input: input = {}, prompt = '', cwd = process.cwd(), session_id: session, transcript_path: transcriptPath } = JSON.parse(raw || '{}')
        if (mode === 'prompt') {
          const context = [roleContext(prompt, cwd, session), promptContext(prompt), PERSONA].filter(Boolean).join('\n')
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
        const block = decide(tool, input ?? {}, process.env, session ? read(shipped).split('\n') : [], () => threadBoard(toolCalls(transcript())))
          ?? canaryMissing(tool, input ?? {}, session ? read(join(process.env.CLAUDE_SETUP_HOME || homedir(), '.claude', 'claude-setup', 'booted', `${String(session).replace(/\W/g, '')}.canary`)) : '', transcript)
          ?? kaomojiMissing(tool, input ?? {})
          ?? (grillMissing(tool, input ?? {}, transcript) ? 'rule-guard: a Planner at size M or L grills first (CLAUDE.md, Grill first; operator SKILL.md): post 3-5 sharp questions as request_decision cards, each with your recommended answer, then write the plan on the answers (or the recommendations while he is away).' : null)
        if (!block && session && tool === 'Artifact' && input?.url && input.file_path) writeFileSync(shipped, `${input.file_path}\n`, { flag: 'a' })
        if (block) { process.stderr.write(block); process.exitCode = 2 }
      } catch {
        // A guard must never break a tool call.
      }
    })
  }
}
