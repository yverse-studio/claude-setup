// The game talks to a portal only through this file. On the own site (and in tests, and in the bot
// playtest) `web` does nothing and every ad call resolves at once; inside CrazyGames the SDK is
// loaded and the same calls reach it. Docs: https://docs.crazygames.com/sdk/intro/

export interface Platform {
  name: 'web' | 'crazygames'
  loadingStart(): void
  loadingStop(): void
  gameplayStart(): void
  gameplayStop(): void
  /** Resolves when the ad finished, failed or was not filled. Never rejects. Pause and mute while it runs. */
  midgame(onStart?: () => void): Promise<void>
  /** Resolves true only when the player watched the ad to the end: give the reward then. */
  rewarded(onStart?: () => void): Promise<boolean>
}

const nothing = () => {}
export const web: Platform = {
  name: 'web',
  loadingStart: nothing,
  loadingStop: nothing,
  gameplayStart: nothing,
  gameplayStop: nothing,
  midgame: async () => {},
  rewarded: async () => false,
}

interface AdCallbacks { adStarted(): void; adFinished(): void; adError(error: unknown): void }
export interface CrazySdk {
  init(): Promise<void>
  game: { loadingStart(): void; loadingStop(): void; gameplayStart(): void; gameplayStop(): void }
  ad: { requestAd(type: 'midgame' | 'rewarded', callbacks: AdCallbacks): void }
}

// An SDK call must never take the game down (the portal QA also runs it with ads blocked).
const safely = (call: () => void) => { try { call() } catch (error) { console.warn('CrazyGames SDK', error) } }

export function crazygames(sdk: CrazySdk): Platform {
  const ad = (type: 'midgame' | 'rewarded', onStart?: () => void) =>
    new Promise<boolean>((resolve) => {
      try {
        sdk.ad.requestAd(type, { adStarted: () => onStart?.(), adFinished: () => resolve(true), adError: () => resolve(false) })
      } catch {
        resolve(false)
      }
    })
  return {
    name: 'crazygames',
    loadingStart: () => safely(() => sdk.game.loadingStart()),
    loadingStop: () => safely(() => sdk.game.loadingStop()),
    gameplayStart: () => safely(() => sdk.game.gameplayStart()),
    gameplayStop: () => safely(() => sdk.game.gameplayStop()),
    midgame: async (onStart) => { await ad('midgame', onStart) },
    rewarded: (onStart) => ad('rewarded', onStart),
  }
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
const SDK_TIMEOUT_MS = 4000

// The script is only requested when the page runs inside CrazyGames (or with ?platform=crazygames for the
// portal's QA tool), so the own site makes no third-party request and needs no consent for it.
const hostOf = (url: string) => { try { return new URL(url).hostname } catch { return '' } }

export function onCrazyGames(win: Window = window): boolean {
  const ancestors = Array.from(win.location.ancestorOrigins ?? [])
  return new URLSearchParams(win.location.search).get('platform') === 'crazygames'
    || [...ancestors, win.document.referrer].map(hostOf).some((host) => host === 'crazygames.com' || host.endsWith('.crazygames.com'))
}

function loadScript(win: Window): Promise<CrazySdk | null> {
  return new Promise((resolve) => {
    const script = win.document.createElement('script')
    const done = () => resolve((win as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK ?? null)
    script.src = SDK_URL
    script.onload = done
    script.onerror = () => resolve(null)
    win.document.head.append(script)
    setTimeout(() => resolve(null), SDK_TIMEOUT_MS)
  })
}

export async function loadPlatform(win: Window = window): Promise<Platform> {
  if (!onCrazyGames(win)) return web
  try {
    const sdk = await loadScript(win)
    if (!sdk) return web
    await sdk.init()
    return crazygames(sdk)
  } catch (error) {
    console.warn('CrazyGames SDK did not start, playing without it', error)
    return web
  }
}
