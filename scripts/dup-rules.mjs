// One home per rule (docs/MAP.md; yskills 2026-10-27: "kein doppeln mehr"): finds a rule sentence of 12 or
// more words that stands in two files. A sentence that links or names a `.md` file is a pointer to the
// home and may repeat; so may the fixed section intros every role file shares. Used by scripts/check.mjs.
const SHARED_INTROS = ['added at the end of each project operator step 9 date project and its type what to do differently']
const MIN_WORDS = 12

// Hard-wrapped lines join back into their paragraph or list item before the split into sentences.
export function sentences(text) {
  const blocks = []
  for (const line of text.replace(/```[\s\S]*?```/g, '').split('\n')) {
    const starts = !line.trim() || /^\s*([-*|#>]|\d+\.)/.test(line)
    if (starts || !blocks.length) blocks.push(line.trim())
    else blocks[blocks.length - 1] += ` ${line.trim()}`
  }
  return blocks.flatMap((b) => b.split(/(?<=[.!?])\s+/))
}

// files: [[path, text]]. Returns [[normalized sentence, [paths]]] for every sentence in two or more files.
export function duplicateRules(files) {
  const homes = new Map()
  for (const [f, text] of files) {
    for (const s of sentences(text)) {
      if (/\]\(|`[^`]*\.md/.test(s)) continue
      const n = s.toLowerCase().replace(/[^a-z0-9äöüß ]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (n.split(' ').length < MIN_WORDS || SHARED_INTROS.includes(n)) continue
      homes.set(n, [...new Set([...(homes.get(n) ?? []), f])])
    }
  }
  return [...homes].filter(([, fs]) => fs.length > 1)
}
