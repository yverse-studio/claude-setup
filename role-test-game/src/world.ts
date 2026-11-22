// The street plot: ground, kerb, fence, two parked cars, four bins, a bench. Grey boxes and flat colours:
// style "real" jank, no new look (no Designer on this team). Colliders live in rules.ts (OBSTACLES).
import * as THREE from 'three'
import { HALF, OBSTACLES } from './rules'

const mat = (color: string, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 })
const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  return mesh
}

export function buildWorld(): THREE.Group {
  const g = new THREE.Group()
  const asphalt = mat('#55585d')
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat('#7d8279'))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  g.add(ground)
  const plot = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), asphalt)
  plot.rotation.x = -Math.PI / 2
  g.add(plot)

  // lane marks down the middle
  const paint = mat('#d8d4c4')
  for (let z = -HALF + 1.5; z < HALF; z += 3) g.add(box(0.18, 0.01, 1.4, paint, 0, 0.006, z))
  // kerb strips on the left and right sides
  const kerb = mat('#9a9c9f')
  g.add(box(0.5, 0.16, HALF * 2, kerb, -HALF + 0.25, 0.08, 0), box(0.5, 0.16, HALF * 2, kerb, HALF - 0.25, 0.08, 0))

  // fence: posts every 2 m and two rails on all four sides
  const wood = mat('#6a5a48')
  const rail = mat('#7a6a56')
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), wood, 100)
  const m4 = new THREE.Matrix4()
  let i = 0
  for (let t = -HALF; t <= HALF + 0.01; t += 2) {
    for (const [x, z] of [[t, -HALF], [t, HALF], [-HALF, t], [HALF, t]] as const) {
      if (i < 100) posts.setMatrixAt(i++, m4.makeTranslation(x, 0.55, z))
    }
  }
  posts.count = i
  g.add(posts)
  for (const y of [0.45, 0.9]) {
    g.add(box(HALF * 2, 0.07, 0.07, rail, 0, y, -HALF), box(HALF * 2, 0.07, 0.07, rail, 0, y, HALF))
    g.add(box(0.07, 0.07, HALF * 2, rail, -HALF, y, 0), box(0.07, 0.07, HALF * 2, rail, HALF, y, 0))
  }

  // obstacles: the first two boxes are cars, then four bins, then the bench (same order as OBSTACLES)
  const carColors = ['#7b3f3f', '#3f5a7b']
  OBSTACLES.forEach((b, n) => {
    const grp = new THREE.Group()
    grp.position.set(b.x, 0, b.z)
    if (n < 2) {
      grp.add(box(b.hw * 2, 0.75, b.hd * 2, mat(carColors[n], 0.5), 0, 0.6, 0))
      grp.add(box(b.hw * 1.8, 0.6, b.hd * 1.0, mat('#a9b4bd', 0.3), 0, 1.25, -b.hd * 0.1))
      const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14)
      for (const sx of [-1, 1]) for (const sz of [-0.6, 0.6]) {
        const w = new THREE.Mesh(wheel, mat('#1d1d1f'))
        w.rotation.z = Math.PI / 2
        w.position.set(sx * b.hw, 0.34, sz * b.hd)
        grp.add(w)
      }
    } else if (n < 6) {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(b.hw, b.hw * 0.9, 1.0, 14), mat('#3e5c47'))
      bin.position.y = 0.5
      grp.add(bin, box(b.hw * 2.2, 0.08, b.hd * 2.2, mat('#2f4536'), 0, 1.02, 0))
    } else {
      const seat = mat('#8a6b45')
      grp.add(box(b.hw * 2, 0.08, b.hd * 2, seat, 0, 0.48, 0), box(b.hw * 2, 0.45, 0.07, seat, 0, 0.8, -b.hd + 0.04))
      for (const sx of [-0.75, 0.75]) grp.add(box(0.07, 0.48, b.hd * 2, mat('#2b2b2e'), sx * b.hw / 0.9 * 0.9, 0.24, 0))
    }
    g.add(grp)
  })
  return g
}
