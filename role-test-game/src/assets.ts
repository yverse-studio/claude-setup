// Loads the figure (Rocketbox, FBX), its two clips and the suitcase. Style "real": a ready third-party
// figure, shipped as the FBX it came as (written exception to game-3d section 3, "VRM only": a
// Rocketbox avatar is a plain humanoid, vacation-game ships it the same way, see the PR text).
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import figureUrl from '../assets/characters/CH_rb_male_adult_01/player.fbx?url'
import bodyUrl from '../assets/characters/CH_rb_male_adult_01/player_body.jpg?url'
import headUrl from '../assets/characters/CH_rb_male_adult_01/player_head.jpg?url'
import opacityUrl from '../assets/characters/CH_rb_male_adult_01/player_opacity.png?url'
import idleUrl from '../assets/moves/idle.json?url'
import walkUrl from '../assets/moves/walk.json?url'
import suitcaseUrl from '../assets/props/vintage_suitcase.glb?url'

export const FIGURE_HEIGHT = 1.8 // m, the figure is scaled to this
export const SUITCASE_SIZE = 0.8 // m, longest side

export type Figure = {
  root: THREE.Group
  mixer: THREE.AnimationMixer
  idle: THREE.AnimationAction
  walk: THREE.AnimationAction
  triangles: number
}

const triangles = (root: THREE.Object3D) => {
  let n = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3
  })
  return n
}

function colorTexture(loader: THREE.TextureLoader, url: string) {
  const t = loader.load(url)
  t.colorSpace = THREE.SRGBColorSpace
  t.flipY = true
  return t
}

export async function loadFigure(): Promise<Figure> {
  const manager = new THREE.LoadingManager()
  // The FBX names seven .tga files by a Windows temp path and none ship. One neutral 1x1 texture answers
  // every such request, so nothing is fetched (no 404) and no placeholder warning is logged; the real
  // materials are set below from the three shipped images.
  const neutral = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1)
  neutral.needsUpdate = true
  manager.addHandler(/\.tga$/i, { load: () => neutral, setPath() {}, setCrossOrigin() {}, setWithCredentials() {}, setRequestHeader() {}, setResourcePath() {}, loadAsync: async () => neutral, parse: () => neutral } as unknown as THREE.Loader)
  const fbx = await new FBXLoader(manager).loadAsync(figureUrl)

  const tex = new THREE.TextureLoader()
  const body = colorTexture(tex, bodyUrl)
  const head = colorTexture(tex, headUrl)
  const opacity = colorTexture(tex, opacityUrl)
  fbx.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    mesh.frustumCulled = false // skinned bounds are stale while it walks
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = list.map((m) => {
      const name = (m.name || '').toLowerCase()
      const std = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, name: m.name })
      if (name.includes('opacity')) Object.assign(std, { map: opacity, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide })
      else if (name.includes('head')) std.map = head
      else std.map = body
      return std
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })

  const box = new THREE.Box3().setFromObject(fbx)
  const scale = FIGURE_HEIGHT / Math.max(0.001, box.max.y - box.min.y)
  const root = new THREE.Group()
  fbx.scale.setScalar(scale)
  fbx.position.y = -box.min.y * scale
  root.add(fbx)

  // Both clips are named "Take 001" in their files: name them here, or a lookup by name mixes them up.
  const clip = async (url: string, name: string) => {
    const json = await (await fetch(url)).json()
    const c = THREE.AnimationClip.parse(json)
    c.name = name
    return c
  }
  const mixer = new THREE.AnimationMixer(fbx)
  const idle = mixer.clipAction(await clip(idleUrl, 'idle'))
  const walk = mixer.clipAction(await clip(walkUrl, 'walk'))
  idle.play()
  walk.play()
  walk.weight = 0
  return { root, mixer, idle, walk, triangles: triangles(root) }
}

export async function loadSuitcase(): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(suitcaseUrl)
  const model = gltf.scene
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const s = SUITCASE_SIZE / Math.max(size.x, size.y, size.z)
  model.scale.setScalar(s)
  const placed = new THREE.Box3().setFromObject(model)
  const centre = placed.getCenter(new THREE.Vector3())
  model.position.set(-centre.x, -placed.min.y, -centre.z) // stands on the ground, centred
  const g = new THREE.Group()
  g.add(model)
  return g
}
export { triangles }
