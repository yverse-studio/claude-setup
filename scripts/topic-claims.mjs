// Topic claims (#760): a workflow rule has one home (docs/TEAMS.md or the operator gate.md). A sentence elsewhere that
// states one of these topics again is counted per file and may only fall (config/rule-budget.json, `topics`).
// A sentence that names TEAMS.md or gate.md is a pointer and is not counted; `topicAllow` exempts a named sentence.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import { sentences } from './dup-rules.mjs'
import { budgetFiles } from './rule-budget.mjs'

export const TOPICS = {
  gateModel: { home: 'docs/TEAMS.md', re: /\b(Fable|Opus|Sonnet|Haiku)\b[^.|]{0,40}\b(gates?|gated|reviews?|reviewers?|verdict)\b|\b(gate|review|reviewer|verdict)\b[^.|]{0,25}\b(is|on|runs on)\s+(Fable|Opus|Sonnet|Haiku)\b/i },
  whoMerges: { home: '.claude/skills/operator/gate.md', re: /\b(gate|author thread|gate thread|reviewer|tester|builder|programmer|lead|coordinator)\b[^.|]{0,30}\bmerges?\b|\b(don'?t|never|cannot|does not)\s+merge\b/i },
  gateWhere: { home: 'docs/TEAMS.md', re: /\b(author thread|gate thread)\b[^.|]{0,60}\b(size|S and M|S, M|L)\b|\b(size [SML]|S and M|S, M)\b[^.|]{0,60}\b(author thread|gate thread)\b/ },
  threadCount: { home: 'docs/TEAMS.md', re: /\b(max(imum)?|at most|never more than|no more than)\s+(one|two|three|\d)\b[^.|]{0,30}\b(threads?|programmers?|builders?)\b|\bone build thread\b/i },
}

const stripMarker = (s) => s.replace(/^[\s>*|-]*(\d+\.\s*)?/, '').trim()

// Returns [{topic, sentence}] for every topic sentence of the text that is not a pointer.
export function topicHits(text) {
  const out = []
  for (const s of sentences(text)) {
    if (/TEAMS\.md|gate\.md/.test(s)) continue
    for (const [topic, { re }] of Object.entries(TOPICS)) if (re.test(s)) out.push({ topic, sentence: s })
  }
  return out
}

// files: [[path, text]]; allow: [{file, starts, reason}].
export function countTopics(files, allow = []) {
  const perFile = {}
  const hits = []
  for (const [file, text] of files) {
    for (const h of topicHits(text)) {
      if (TOPICS[h.topic].home === file) continue
      const t = stripMarker(h.sentence)
      if (allow.some((a) => a.file === file && t.startsWith(a.starts))) continue
      perFile[file] = (perFile[file] ?? 0) + 1
      hits.push({ file, topic: h.topic, sentence: h.sentence })
    }
  }
  return { perFile, hits }
}

export function compareTopics(now, baseline = {}) {
  return Object.entries(now.perFile).filter(([f, n]) => n > (baseline[f] ?? 0)).map(([f, n]) =>
    `${f}: ${n - (baseline[f] ?? 0)} more workflow-topic sentence(s) restated outside their home (${n}, budget ${baseline[f] ?? 0}); say it once in docs/TEAMS.md or operator gate.md and link it (docs/MAP.md)`)
}

const HISTORY = /^docs\/(incidents|research)\/|^docs\/(RESEARCH|TEST-PROJECTS)\.md$|^docs\/LESSONS-/
// The string and template literals of a .mjs file, joined by newlines.
const literals = (src) => [...src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]).join('\n')

export function measureTopics(root, allow = []) {
  const files = budgetFiles(root).filter((f) => !HISTORY.test(f)).map((f) => [f, readFileSync(join(root, f), 'utf8')])
  for (const n of readdirSync(join(root, 'global'))) if (n.endsWith('.mjs')) files.push([`global/${n}`, literals(readFileSync(join(root, 'global', n), 'utf8'))])
  return countTopics(files, allow)
}
