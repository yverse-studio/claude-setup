// Best time per layout, behind one interface (game-3d section 5, Saves): localStorage on the web build.
import { LAYOUTS, type State } from './rules'

export type Save = { version: 1; best: Record<string, number> } // layout -> best time in s (wins only)
export const SAVE_KEY = 'kofferlauf.save.v1'
type Store = Pick<Storage, 'getItem' | 'setItem'>

export const emptySave = (): Save => ({ version: 1, best: {} })

export function loadSave(store: Store | null): Save {
  try {
    const raw = JSON.parse(store?.getItem(SAVE_KEY) ?? 'null')
    if (!raw || raw.version !== 1 || typeof raw.best !== 'object' || !raw.best) return emptySave()
    const best: Record<string, number> = {}
    for (let n = 1; n <= LAYOUTS; n++) if (Number.isFinite(raw.best[n]) && raw.best[n] > 0) best[n] = raw.best[n]
    return { version: 1, best }
  } catch {
    return emptySave()
  }
}

export function writeSave(store: Store | null, save: Save): void {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    /* no storage: the best time lasts for this visit */
  }
}

// A won run may beat the best of its layout. Returns the new save, the best to show and whether it is a new record.
export function recordRun(save: Save, s: State): { save: Save; best: number | null; record: boolean } {
  if (s.mode !== 'won' || s.finishTime === null) return { save, best: save.best[s.layout] ?? null, record: false }
  const old = save.best[s.layout]
  if (old !== undefined && old <= s.finishTime) return { save, best: old, record: false }
  return { save: { ...save, best: { ...save.best, [s.layout]: s.finishTime } }, best: s.finishTime, record: old !== undefined }
}
