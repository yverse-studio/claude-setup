// The 1-based line of the first merge conflict marker left in a text, 0 when clean.
// 2026-11-08: PR #376 carried two stray `>>>>>>> branch` lines through a green CI, so check.mjs runs this on every file.
export const conflictMarker = (text) => text.split('\n').findIndex((l) => /^(<{7}|>{7})( |$)|^={7}$/.test(l)) + 1
