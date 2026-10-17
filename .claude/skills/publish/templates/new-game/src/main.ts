import * as THREE from 'three'
import { ARENA, COIN_COUNT, createState, isOver, step, type Input, type State } from './rules'
import { installHooks } from './hooks'

const text = navigator.language.startsWith('en')
  ? { coins: 'Coins', time: 'Time', again: 'Tap to play again' }
  : { coins: 'Münzen', time: 'Zeit', again: 'Tippen zum Neustart' }

// ?seed=<n> makes a round repeatable; ?paused=1 stops the clock so advanceTime() is the only time
// (tests, bots and screenshots; game-3d skill, section 4).
const params = new URLSearchParams(location.search)
const seed = Number(params.get('seed')) || 1
const paused = params.has('paused')

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const hud = document.querySelector<HTMLDivElement>('#hud')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

const scene = new THREE.Scene()
scene.background = new THREE.Color('#fbe9d7')
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
camera.position.set(0, 20, 14)
camera.lookAt(0, 0, 0)
scene.add(new THREE.HemisphereLight('#ffffff', '#e8c9a8', 1.6))
const sun = new THREE.DirectionalLight('#fff4e0', 2)
sun.position.set(6, 12, 4)
scene.add(sun)

const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ color: '#b5d8a8' }))
floor.rotation.x = -Math.PI / 2
scene.add(floor)
const player = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#f08a6b' }))
player.position.y = 0.5
scene.add(player)
const coinGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.14, 20)
const coinMaterial = new THREE.MeshStandardMaterial({ color: '#f5c542' })
const coins = Array.from({ length: COIN_COUNT }, () => {
  const mesh = new THREE.Mesh(coinGeometry, coinMaterial)
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 0.6
  scene.add(mesh)
  return mesh
})

// Input: keys, or hold a finger/mouse on the floor and the cube walks toward it.
const keys = new Set<string>()
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()))
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
const raycaster = new THREE.Raycaster()
let pointer: THREE.Vector2 | null = null
canvas.addEventListener('pointerdown', (e) => { pointer = ndc(e); if (isOver(state)) state = createState(seed) })
canvas.addEventListener('pointermove', (e) => { if (pointer) pointer = ndc(e) })
addEventListener('pointerup', () => { pointer = null })
const ndc = (e: PointerEvent) => new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)

let held: Input | null = null // set by the __playInput hook

function readInput(): Input {
  if (held) return held
  let x = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0)
  let z = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0)
  if (pointer && !x && !z) {
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObject(floor)[0]
    if (hit) {
      x = hit.point.x - state.player.x
      z = hit.point.z - state.player.z
      if (Math.hypot(x, z) < 0.3) x = z = 0
    }
  }
  return { x, z }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.position.set(0, innerWidth < innerHeight ? 32 : 20, 14) // phone: more height to keep the floor in view
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

let state: State = createState(seed)
let last = performance.now()

function draw() {
  player.position.set(state.player.x, 0.5, state.player.z)
  coins.forEach((mesh, i) => mesh.position.set(state.coins[i].x, 0.6, state.coins[i].z))
  hud.textContent = isOver(state)
    ? `${text.coins}: ${state.score}  ·  ${text.again}`
    : `${text.coins}: ${state.score}  ·  ${text.time}: ${Math.ceil(state.timeLeft)}`
  renderer.render(scene, camera)
}

const TICK = 1 / 60
installHooks({
  state: () => state,
  hold: (input) => { held = input },
  advance: (ms) => {
    for (let t = 0; t < ms / 1000; t += TICK) state = step(state, readInput(), TICK)
    draw()
  },
})

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1)
  last = now
  if (!paused) state = step(state, readInput(), dt)
  coins.forEach((mesh) => { mesh.rotation.z += dt * 2 })
  draw()
  ;(window as unknown as { __gameReady: boolean }).__gameReady = true // shots.mjs waits for this
})
