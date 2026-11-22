// One saved settings object (controls baseline row 7): load, save, clamp.
export type Settings = { sensitivity: number; invertY: boolean; autoCamera: boolean; reducedMotion: boolean }

export const SENSITIVITY = { min: 0.05, max: 0.6, def: 0.22 } // degrees per CSS px
export const KEY = 'kofferlauf.settings.v1'

export const defaults = (reducedMotion = false): Settings => ({ sensitivity: SENSITIVITY.def, invertY: false, autoCamera: true, reducedMotion })

export function clampSettings(raw: unknown, base: Settings = defaults()): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s = typeof r.sensitivity === 'number' && Number.isFinite(r.sensitivity) ? r.sensitivity : base.sensitivity
  return {
    sensitivity: Math.max(SENSITIVITY.min, Math.min(SENSITIVITY.max, s)),
    invertY: typeof r.invertY === 'boolean' ? r.invertY : base.invertY,
    autoCamera: typeof r.autoCamera === 'boolean' ? r.autoCamera : base.autoCamera,
    reducedMotion: typeof r.reducedMotion === 'boolean' ? r.reducedMotion : base.reducedMotion,
  }
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

// Storage can be missing or throw (private window): the game then runs on defaults.
export function loadSettings(store: Store | null, base: Settings = defaults()): Settings {
  try {
    const text = store?.getItem(KEY)
    return text ? clampSettings(JSON.parse(text), base) : base
  } catch {
    return base
  }
}

export function saveSettings(store: Store | null, s: Settings): void {
  try {
    store?.setItem(KEY, JSON.stringify({ version: 1, ...clampSettings(s) }))
  } catch {
    /* no storage: the settings last for this visit */
  }
}
