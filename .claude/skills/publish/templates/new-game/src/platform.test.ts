import { describe, expect, it, vi } from 'vitest'
import { crazygames, onCrazyGames, web, type CrazySdk } from './platform'

function fakeSdk(outcome: 'finished' | 'error' | 'throws') {
  const calls: string[] = []
  const sdk: CrazySdk = {
    init: async () => {},
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
    },
    ad: {
      requestAd: (type, cb) => {
        calls.push(`ad:${type}`)
        if (outcome === 'throws') throw new Error('blocked')
        cb.adStarted()
        if (outcome === 'finished') cb.adFinished()
        else cb.adError({ code: 'unfilled' })
      },
    },
  }
  return { sdk, calls }
}

describe('platform', () => {
  it('web does nothing and never waits on an ad (bot playtests and the own site)', async () => {
    web.gameplayStart()
    await expect(web.midgame()).resolves.toBeUndefined()
    await expect(web.rewarded()).resolves.toBe(false)
  })

  it('crazygames forwards the game events to the SDK', () => {
    const { sdk, calls } = fakeSdk('finished')
    const p = crazygames(sdk)
    p.loadingStart(); p.loadingStop(); p.gameplayStart(); p.gameplayStop()
    expect(calls).toEqual(['loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop'])
  })

  it('a finished rewarded ad pays out, an unfilled or blocked one does not, and the game goes on', async () => {
    const onStart = vi.fn()
    await expect(crazygames(fakeSdk('finished').sdk).rewarded(onStart)).resolves.toBe(true)
    expect(onStart).toHaveBeenCalledOnce()
    await expect(crazygames(fakeSdk('error').sdk).rewarded()).resolves.toBe(false)
    await expect(crazygames(fakeSdk('throws').sdk).rewarded()).resolves.toBe(false)
  })

  it('a midgame ad resolves whether it was shown, unfilled or blocked', async () => {
    for (const outcome of ['finished', 'error', 'throws'] as const) {
      await expect(crazygames(fakeSdk(outcome).sdk).midgame()).resolves.toBeUndefined()
    }
  })

  it('an SDK call that throws does not stop the game', () => {
    const { sdk } = fakeSdk('finished')
    sdk.game.gameplayStart = () => { throw new Error('sitelock') }
    expect(() => crazygames(sdk).gameplayStart()).not.toThrow()
  })

  it('the SDK is requested only inside CrazyGames or with ?platform=crazygames', () => {
    const win = (search: string, referrer = '', ancestors: string[] = []) =>
      ({ location: { search, ancestorOrigins: ancestors }, document: { referrer } }) as unknown as Window
    expect(onCrazyGames(win(''))).toBe(false)
    expect(onCrazyGames(win('', 'https://example.com/crazygames.com/x'))).toBe(false)
    expect(onCrazyGames(win('', 'https://crazygames.com.evil.dev/'))).toBe(false)
    expect(onCrazyGames(win('?platform=crazygames'))).toBe(true)
    expect(onCrazyGames(win('', 'https://www.crazygames.com/game/x'))).toBe(true)
    expect(onCrazyGames(win('', '', ['https://games.crazygames.com']))).toBe(true)
  })
})
