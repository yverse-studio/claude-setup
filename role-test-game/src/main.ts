import * as THREE from 'three'
import { loadPlatform, web, type Platform } from './platform'
import { loadFigure, loadSuitcase, type Figure } from './assets'
import { buildWorld } from './world'
import { createInput } from './input'
import { keyLabels, toWorld } from './intents'
import { START_PITCH, BACK, DEG, applyLook, cameraPosition, easeYaw, type Look } from './camera'
import { LAYOUTS, SPAWN_YAW, clipOf, createState, step, type Input, type State } from './rules'
import { defaults, loadSettings, saveSettings } from './settings'
import { loadSave, recordRun, writeSave } from './save'
import { installHooks } from './hooks'

// ?seed=<n> pins layout n (repeatable); without it the layouts cycle 1..5 run by run.
// ?paused=1 stops the real clock so advanceTime() is the only time (tests, bots, screenshots; game-3d section 4).
const params = new URLSearchParams(location.search)
const pinned = params.has('seed') ? Number(params.get('seed')) || 1 : null
const clockFrozen = params.has('paused')
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const canvas = $<HTMLCanvasElement>('game')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
scene.background = new THREE.Color('#9db0c0')
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 150)
scene.add(new THREE.HemisphereLight('#ffffff', '#6b6f68', 1.7))
const sun = new THREE.DirectionalLight('#fff1dc', 2.2)
sun.position.set(8, 14, 6)
scene.add(sun)
scene.add(buildWorld())

const store = (() => { try { return localStorage } catch { return null } })()
let settings = loadSettings(store, defaults(matchMedia('(prefers-reduced-motion: reduce)').matches))
let save = loadSave(store)
const applySettingsToPage = () => document.documentElement.classList.toggle('reduced', settings.reducedMotion)
applySettingsToPage()
if (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('touch')

// ---- game state --------------------------------------------------------------------------------
let runIndex = 0
let game: State = createState(pinned ?? 1)
let uiPaused = false
let optionsOpen = false
let held: Input | null = null // set by the __playInput hook
let look: Look = { yaw: SPAWN_YAW, pitch: START_PITCH }
let sinceLook = 99
let camBack = BACK
let walkW = 0
let ended = false
let lastCount = 0
let hintAfter = 0
let platform: Platform = web
let layoutMap: { get(code: string): string | undefined } | null = null
;(navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<{ get(c: string): string | undefined }> } }).keyboard?.getLayoutMap?.().then((m) => { layoutMap = m }, () => {})

const layoutFor = (run: number) => pinned ?? (run % LAYOUTS) + 1

// ---- scene objects -----------------------------------------------------------------------------
let figure: Figure | null = null
const suitcases: THREE.Group[] = []
const rings: THREE.Mesh[] = []
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28 }))
blob.rotation.x = -Math.PI / 2
blob.position.y = 0.012
scene.add(blob)

// ---- DOM ---------------------------------------------------------------------------------------
const timerEl = $('timer')
const countEl = $('count')
const nEl = $('n')
const hintEl = $('hint')
const panels = { win: $('win'), lose: $('lose'), paused: $('paused'), options: $('options') }
const input = createInput(canvas, $('stick'), $('knob'), {
  onPause: () => (optionsOpen ? closeOptions() : togglePause()),
  onRestart: () => { if (game.mode !== 'play' || uiPaused) restart() },
  onRunToggle: () => updateHint(),
})

function updateHint() {
  const d = input.device()
  hintEl.textContent = d === 'touch' ? 'Drag left to walk, drag right to look' : d === 'pad' ? 'Left stick to walk, right stick to look' : `${keyLabels(layoutMap)} / arrows to walk, Shift to run`
  if (d === 'touch') document.documentElement.classList.add('touch')
}

function setPanels() {
  panels.win.classList.toggle('show', game.mode === 'won')
  panels.lose.classList.toggle('show', game.mode === 'lost')
  panels.paused.classList.toggle('show', uiPaused && game.mode === 'play' && !optionsOpen)
  panels.options.classList.toggle('show', optionsOpen)
}

function togglePause() {
  if (game.mode !== 'play') return
  uiPaused = !uiPaused
  optionsOpen = false
  if (uiPaused) platform.gameplayStop(); else platform.gameplayStart()
  setPanels()
}
function closeOptions() { optionsOpen = false; setPanels() }

function restart() {
  runIndex += 1
  game = createState(layoutFor(runIndex))
  uiPaused = false
  optionsOpen = false
  ended = false
  lastCount = 0
  look = { yaw: SPAWN_YAW, pitch: START_PITCH }
  camBack = BACK
  sinceLook = 99
  hintAfter = game.elapsed
  syncSuitcases()
  setPanels()
  platform.gameplayStart()
}

function syncSuitcases() {
  game.suitcases.forEach((c, i) => {
    if (suitcases[i]) suitcases[i].position.set(c.x, 0, c.z)
  })
}

document.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
  const isPause = (e.target as HTMLElement).closest('#pause')
  if (isPause) togglePause()
  else if (act === 'restart') restart()
  else if (act === 'resume') togglePause()
  else if (act === 'options') { optionsOpen = true; setPanels(); syncOptions() }
  else if (act === 'back') closeOptions()
})
addEventListener('blur', () => { if (game.mode === 'play' && !uiPaused && !clockFrozen) togglePause() })
document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'play' && !uiPaused) togglePause() })

const sensEl = $<HTMLInputElement>('opt-sens')
const invertEl = $<HTMLInputElement>('opt-invert')
const autoEl = $<HTMLInputElement>('opt-auto')
const reducedEl = $<HTMLInputElement>('opt-reduced')
function syncOptions() {
  sensEl.value = String(settings.sensitivity)
  invertEl.checked = settings.invertY
  autoEl.checked = settings.autoCamera
  reducedEl.checked = settings.reducedMotion
}
for (const el of [sensEl, invertEl, autoEl, reducedEl]) {
  el.addEventListener('input', () => {
    settings = { sensitivity: Number(sensEl.value), invertY: invertEl.checked, autoCamera: autoEl.checked, reducedMotion: reducedEl.checked }
    saveSettings(store, settings)
    applySettingsToPage()
  })
}

// ---- one tick of game time ---------------------------------------------------------------------
function readInput(): Input {
  if (held) return held
  const m = input.move()
  return toWorld(m.x, m.y, look.yaw, m.run)
}

function tick(dt: number) {
  if (uiPaused) return
  const l = input.takeLook(dt)
  const turn = input.turn()
  if (l.dx || l.dy || turn) {
    look = applyLook(look, l.dx + turn * 90 / Math.max(0.0001, settings.sensitivity) * dt, l.dy, settings.sensitivity, settings.invertY)
    if (l.touched || turn) sinceLook = 0
  } else sinceLook += dt
  const before = game
  game = step(game, readInput(), dt)
  if (game.player.speed > 0.2 && settings.autoCamera && sinceLook > 1.5) look = { ...look, yaw: easeYaw(look.yaw, game.player.yaw, dt, 1.4) }
  if (game.collected > lastCount) {
    lastCount = game.collected
    if (!settings.reducedMotion) { countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump') }
  }
  if (before.mode === 'play' && game.mode !== 'play') onEnd()
  updateVisuals(dt)
}

function onEnd() {
  platform.gameplayStop()
  ended = true
  if (game.mode === 'won') {
    const r = recordRun(save, game)
    save = r.save
    writeSave(store, save)
    $('win-title').textContent = `5/5 in ${game.finishTime!.toFixed(1)} s`
    $('win-best').textContent = r.best !== null ? `Best: ${r.best.toFixed(1)} s${r.record ? ' (new)' : ''}` : ''
  } else {
    $('lose-title').textContent = `Time's up: ${game.collected}/5`
    $('lose-more').textContent = `${5 - game.collected} suitcase${5 - game.collected === 1 ? '' : 's'} left on the street`
  }
  if (runIndex % 3 === 2) void platform.midgame() // only after the end panel, at most every third run
  setPanels()
}

let camPos = { x: 0, y: 2.2, z: 0 }
function updateVisuals(dt: number) {
  const p = game.player
  if (figure) {
    figure.root.position.set(p.x, 0, p.z)
    figure.root.rotation.y = p.yaw
    const moving = clipOf(p) === 'walk'
    walkW += ((moving ? 1 : 0) - walkW) * (1 - Math.exp(-dt / 0.07)) // about a 200 ms crossfade
    figure.walk.weight = walkW
    figure.idle.weight = 1 - walkW
    figure.walk.timeScale = Math.max(0.6, Math.min(1.6, 1 + ((p.speed - 1.5) / 1.5) * 0.6))
    figure.mixer.update(dt)
    blob.position.set(p.x, 0.012, p.z)
  }
  game.suitcases.forEach((c, i) => {
    const g = suitcases[i]
    if (!g) return
    const k = c.taken ? Math.max(0, 1 - (game.elapsed - c.takenAt) / 0.15) : 1
    g.visible = k > 0
    g.scale.setScalar(k)
    g.position.y = c.taken ? 0.3 * (1 - k) : 0
    g.rotation.y += dt * 0.9
    rings[i].visible = !c.taken
  })
  const target = game.mode === 'won' ? 6 : BACK
  camBack += (target - camBack) * (1 - Math.exp(-dt / 0.2))
  const c = cameraPosition({ x: p.x, z: p.z }, look, camBack)
  if (c.back < camBack - 0.01) camBack = Math.min(camBack, c.back) // the spring arm never lets the view sit inside a wall
  camPos = { x: c.x, y: c.y, z: c.z }
  camera.position.set(c.x, c.y, c.z)
  camera.lookAt(p.x, 1.2, p.z)
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  const aspect = innerWidth / innerHeight
  camera.aspect = aspect
  camera.fov = aspect >= 1 ? 60 : 60 + (1 - aspect) * 45 // portrait keeps the street in view
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

function draw() {
  const t = Math.max(0, game.timeLeft)
  timerEl.textContent = t.toFixed(1)
  timerEl.classList.toggle('hot', game.mode === 'play' && t <= 10)
  nEl.textContent = String(game.collected)
  hintEl.classList.toggle('off', game.mode !== 'play' || uiPaused || game.elapsed - hintAfter > 6)
  renderer.render(scene, camera)
}

// ---- hooks, assets, loop -----------------------------------------------------------------------
const TICK = 1 / 60
installHooks({
  state: () => game,
  paused: () => uiPaused,
  camera: () => camPos,
  hold: (i) => { held = i },
  look: (dx, dy) => { look = applyLook(look, dx, dy, settings.sensitivity, settings.invertY) },
  advance: (ms) => {
    for (let t = 0; t < ms / 1000 - 1e-9; t += TICK) tick(Math.min(TICK, ms / 1000 - t))
    draw()
  },
  stats: () => ({ figureTriangles: figure?.triangles ?? 0, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, layout: game.layout }),
})

async function start() {
  const [fig, suitcase] = await Promise.all([loadFigure(), loadSuitcase()])
  figure = fig
  scene.add(fig.root)
  for (let i = 0; i < game.suitcases.length; i++) {
    const g = suitcase.clone(true)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28), new THREE.MeshBasicMaterial({ color: '#f5c542', side: THREE.DoubleSide }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#f5c542', transparent: true, opacity: 0.35, depthWrite: false }))
    beam.position.y = 1.5
    g.add(ring, beam)
    suitcases.push(g)
    rings.push(ring)
    scene.add(g)
  }
  syncSuitcases()
  hintAfter = game.elapsed
  updateHint()
  updateVisuals(0)
  draw()
  ;(window as unknown as { __gameReady: boolean }).__gameReady = true // shots.mjs, play.mjs and the journey wait for this
}

let last = performance.now()
let acc = 0
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.5) // a slow frame (software GL) still plays real time, in fixed steps
  last = now
  if (!figure) return
  if (!clockFrozen) {
    acc += dt
    for (let n = 0; acc >= TICK && n < 40; n++, acc -= TICK) tick(TICK)
  }
  if (input.device() && hintEl.textContent === '') updateHint()
  draw()
})

void loadPlatform().then((loaded) => {
  platform = loaded
  platform.loadingStart()
  platform.loadingStop()
  platform.gameplayStart()
})
void start()
void DEG
void ended
