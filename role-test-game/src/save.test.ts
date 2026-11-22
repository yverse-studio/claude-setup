import { describe, expect, it } from 'vitest'
import { emptySave, loadSave, recordRun, writeSave } from './save'
import { createState, greedyInput, simulate } from './rules'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('save', () => {
  it('a win sets the best time of its layout, a slower win keeps it', () => {
    const won = simulate(createState(1), greedyInput)
    const first = recordRun(emptySave(), won)
    expect(first.best).toBeCloseTo(won.finishTime!, 5)
    expect(first.record).toBe(false) // the first win has nothing to beat
    const slower = { ...won, finishTime: won.finishTime! + 5 }
    expect(recordRun(first.save, slower).save).toBe(first.save)
    const faster = { ...won, finishTime: won.finishTime! - 1 }
    const r = recordRun(first.save, faster)
    expect(r.record).toBe(true)
    expect(r.best).toBeCloseTo(won.finishTime! - 1, 5)
  })

  it('a loss changes nothing', () => {
    const lost = { ...createState(2), mode: 'lost' as const }
    const r = recordRun(emptySave(), lost)
    expect(r.save).toEqual(emptySave())
    expect(r.best).toBeNull()
  })

  it('round trip, bad text and broken storage', () => {
    const store = memory()
    const s = recordRun(emptySave(), simulate(createState(3), greedyInput)).save
    writeSave(store, s)
    expect(loadSave(store)).toEqual(s)
    store.setItem('kofferlauf.save.v1', '{"version":2}')
    expect(loadSave(store)).toEqual(emptySave())
    expect(loadSave(null)).toEqual(emptySave())
    expect(() => writeSave({ getItem: () => null, setItem: () => { throw new Error('x') } }, s)).not.toThrow()
  })
})
