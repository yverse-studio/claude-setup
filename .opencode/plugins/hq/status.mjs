// Pure parts of the Luna HQ panel: budget file, spend ranges, remaining credit, open-items digest, display lines.
// No file, network or clock access here, so node --test scripts/opencode-hq.test.mjs covers all of it.
export const LOW_USD = 5
export const STALE_MIN = 60

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const pad = (n) => String(n).padStart(2, '0')

// ~/.config/opencode/luna-budget.json: {"topup_usd": 50, "since": "2026-10-28"} (a date counts from local midnight)
// or "since": "2026-10-28T23:59:00+01:00" (counts from that moment). Other fields are ignored. Null when missing or unusable.
export function parseBudget(text) {
  let json
  try { json = JSON.parse(String(text ?? '').replace(/^\uFEFF/, '')) } catch { return null }
  const topup = Number(json?.topup_usd)
  if (!Number.isFinite(topup) || topup <= 0) return null
  const since = String(json?.since ?? '')
  const m = DAY.exec(since)
  let at
  if (m) {
    at = new Date(+m[1], +m[2] - 1, +m[3])
    if (at.getFullYear() !== +m[1] || at.getMonth() !== +m[2] - 1 || at.getDate() !== +m[3]) return null
  } else if (DATETIME.test(since)) {
    at = new Date(since)
  } else return null
  if (!Number.isFinite(at.getTime())) return null
  const label = m ? since : `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
  return { topup, since: label, sinceMs: at.getTime() }
}
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

// Local-time start of today and of this week (Monday), as milliseconds.
export function ranges(now = new Date()) {
  const today = midnight(now)
  const back = (today.getDay() + 6) % 7
  return { today: today.getTime(), week: new Date(today.getFullYear(), today.getMonth(), today.getDate() - back).getTime() }
}

export function remaining(budget, spentSince) {
  if (!budget || !Number.isFinite(spentSince)) return null
  return Math.round((budget.topup - spentSince) * 100) / 100
}

export function creditState(left) {
  if (left === null) return 'unknown'
  if (left < 0) return 'over'
  return left < LOW_USD ? 'low' : 'ok'
}

// The digest of ~/.claude/open-items.md (scripts/open-items.mjs --md): the Stand time and the section headings with their counts.
export function parseOpenItems(md, now = new Date()) {
  const text = String(md ?? '')
  if (!text.trim()) return null
  const stand = /\(Stand (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})\)/.exec(text)
  const standMs = stand ? new Date(+stand[1], +stand[2] - 1, +stand[3], +stand[4], +stand[5]).getTime() : null
  const sections = []
  let cur = null
  for (const l of text.split(/\r?\n/)) {
    const h = /^##\s+(.*?)\s*$/.exec(l)
    if (h) { cur = { title: h[1].replace(/\s*\(\d+\)$/, ''), count: Number(/\((\d+)\)$/.exec(h[1])?.[1] ?? NaN), items: [] }; sections.push(cur); continue }
    const item = /^\s*-\s+(.*\S)\s*$/.exec(l)
    if (item && cur && !/^keine$/i.test(item[1])) cur.items.push(item[1])
  }
  for (const s of sections) if (!Number.isFinite(s.count)) s.count = s.items.length
  const stale = standMs === null ? true : now.getTime() - standMs > STALE_MIN * 60000
  return { stand: stand ? `${stand[1]}-${stand[2]}-${stand[3]} ${stand[4]}:${stand[5]}` : null, stale, sections }
}

const usd = (n) => (n === null || n === undefined ? '?' : `$${n.toFixed(2)}`)

export function snapshot({ budget, spent, open, now = new Date() }) {
  const left = budget && spent ? remaining(budget, spent.since) : null
  return {
    now: now.getTime(),
    credit: { state: budget && left === null ? 'unchecked' : creditState(left), left, topup: budget?.topup ?? null, since: budget?.since ?? null },
    spent: { today: spent?.today ?? null, week: spent?.week ?? null, since: spent?.since ?? null },
    open: open ?? null,
  }
}

export function creditText(s) {
  const c = s.credit
  if (c.state === 'unchecked') return 'Guthaben: nicht geprüft (Kosten von OpenCode nicht lesbar)'
  if (c.state === 'unknown') return 'Guthaben: unbekannt, Aufladung eintragen (luna-budget.json)'
  return `Guthaben: ${usd(c.left)} von ${usd(c.topup)} seit ${c.since}${c.state === 'low' ? ' (wenig)' : c.state === 'over' ? ' (leer)' : ''}`
}

export function spendText(s) {
  return `Ausgaben: heute ${usd(s.spent.today)}, Woche ${usd(s.spent.week)}`
}

export function openText(s) {
  if (!s.open) return 'Offen: ~/.claude/open-items.md fehlt (node scripts/open-items.mjs --md)'
  const parts = s.open.sections.filter((x) => x.title !== 'Projekte').map((x) => `${x.title} ${x.count}`)
  return `Offen (Stand ${s.open.stand ?? '?'}${s.open.stale ? ', alt' : ''}): ${parts.join(', ')}`
}

export function lines(s) {
  return [creditText(s), spendText(s), openText(s)]
}

// What the panel gets: the credit state (for colour), the three lines, and the open items in full (for the tooltip).
export function view(s) {
  const tip = s.open ? s.open.sections.map((x) => [`${x.title} (${x.count})`, ...x.items.map((i) => `- ${i}`)].join('\n')).join('\n') : ''
  return { state: s.credit.state, lines: lines(s), tip }
}
