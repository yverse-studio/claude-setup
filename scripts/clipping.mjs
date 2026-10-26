#!/usr/bin/env node
// Clipping numbers of the clothing done report (docs/clothing-pipeline.md): per garment piece the
// smallest signed clearance to the body in mm (positive = outside) and the share of its vertices
// below 0 in %, at rest (glTF bind pose, no skinning, morph weights 0). GLB or VRM in, JSON plus
// one summary line out; exit 1 when a piece is over the limit (min >= 0 mm and 0 % inside).
// Pieces are mesh primitives named "<node>/<material>". Body = pieces matching --body, parts =
// pieces matching --parts, in one file (VRoid bakes both into one mesh) or two (--body-file).
// Run: node scripts/clipping.mjs model.vrm [--body SKIN] [--parts CLOTH] [--body-file b.glb]
//      [--parts-file c.glb] [--limit-mm 0] [--label rest] [--out result.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const COMPONENTS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const WELD = 1e6
const EPS_M = 1e-9 // float noise: 0.000001 mm
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB/VRM file (magic)')
  let json = null
  let bin = null
  for (let at = 12; at < buf.length;) {
    const len = buf.readUInt32LE(at)
    const type = buf.readUInt32LE(at + 4)
    const data = buf.subarray(at + 8, at + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'))
    else if (type === 0x004e4942 && !bin) bin = data
    at += 8 + len + ((4 - (len % 4)) % 4)
  }
  if (!json || !bin) throw new Error('GLB without JSON or BIN chunk')
  const bad = (json.extensionsRequired || []).filter((e) => /draco|meshopt|quantization/i.test(e))
  if (bad.length) throw new Error(`unsupported extension ${bad.join(', ')}: export the mesh uncompressed`)
  return { json, bin }
}

function accessor({ json, bin }, index) {
  const a = json.accessors[index]
  if (a.sparse) throw new Error(`accessor ${index} is sparse`)
  const view = json.bufferViews[a.bufferView]
  const Cls = COMPONENTS[a.componentType]
  const n = TYPE_SIZE[a.type]
  const stride = view.byteStride || n * Cls.BYTES_PER_ELEMENT
  const base = (view.byteOffset || 0) + (a.byteOffset || 0)
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const get = { 5126: 'getFloat32', 5125: 'getUint32', 5123: 'getUint16', 5121: 'getUint8' }[a.componentType]
  if (!get) throw new Error(`accessor ${index}: component type ${a.componentType} not supported`)
  const out = new Float64Array(a.count * n)
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < n; k++) out[i * n + k] = dv[get](base + i * stride + k * Cls.BYTES_PER_ELEMENT, true)
  }
  return out
}

const det3 = (m) => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2])
const mul = (a, b) => {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}

function local(node) {
  if (node.matrix) return node.matrix
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale || [1, 1, 1]
  const [tx, ty, tz] = node.translation || [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function worldMatrices(json) {
  const world = new Array(json.nodes.length)
  const parent = new Array(json.nodes.length).fill(-1)
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i }))
  const up = (i) => {
    if (world[i]) return world[i]
    const l = local(json.nodes[i])
    world[i] = parent[i] < 0 ? l : mul(up(parent[i]), l)
    return world[i]
  }
  json.nodes.forEach((_, i) => up(i))
  return world
}

// Pieces of a GLB/VRM: { name, positions: Float64Array (world, metres), indices: Uint32Array }.
export function loadPieces(buf) {
  const glb = readGlb(buf)
  const { json } = glb
  const world = worldMatrices(json)
  const cache = new Map()
  const pieces = []
  json.nodes.forEach((node, ni) => {
    if (node.mesh === undefined) return
    const m = node.skin === undefined ? world[ni] : IDENTITY // glTF ignores a skinned node's own transform
    json.meshes[node.mesh].primitives.forEach((p, pi) => {
      if ((p.mode ?? 4) !== 4) return
      const key = `${ni}:${p.attributes.POSITION}`
      if (!cache.has(key)) {
        const src = accessor(glb, p.attributes.POSITION)
        const out = new Float64Array(src.length)
        for (let i = 0; i < src.length; i += 3) {
          const [x, y, z] = [src[i], src[i + 1], src[i + 2]]
          out[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
          out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
          out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
        }
        cache.set(key, out)
      }
      const indices = p.indices === undefined
        ? Uint32Array.from({ length: cache.get(key).length / 3 }, (_, i) => i)
        : Uint32Array.from(accessor(glb, p.indices))
      const positions = cache.get(key)
      const count = positions.length / 3
      if (indices.length % 3 !== 0) throw new Error(`${node.name}: index count ${indices.length} is not a multiple of 3`)
      if (indices.some((i) => i >= count)) throw new Error(`${node.name}: an index points past the ${count} vertices`)
      if (positions.some((v) => !Number.isFinite(v))) throw new Error(`${node.name}: a vertex position is not finite`)
      if (det3(m) < 0) for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]] // mirrored node flips the winding
      const mat = json.materials?.[p.material]?.name ?? `material${p.material ?? ''}`
      pieces.push({ name: `${node.name ?? `node${ni}`}/${mat}`, primitive: pi, positions: cache.get(key), indices })
    })
  })
  return pieces
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => { const l = Math.hypot(...a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0] }

// Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5).
// region: 0 face, 1/2/3 vertex a/b/c, 4/5/6 edge ab/bc/ca.
function closestOnTriangle(p, a, b, c) {
  const ab = sub(b, a)
  const ac = sub(c, a)
  const ap = sub(p, a)
  const d1 = dot(ab, ap)
  const d2 = dot(ac, ap)
  if (d1 <= 0 && d2 <= 0) return { q: a, region: 1 }
  const bp = sub(p, b)
  const d3 = dot(ab, bp)
  const d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return { q: b, region: 2 }
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3)
    return { q: [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]], region: 4 }
  }
  const cp = sub(p, c)
  const d5 = dot(ab, cp)
  const d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return { q: c, region: 3 }
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6)
    return { q: [a[0] + t * ac[0], a[1] + t * ac[1], a[2] + t * ac[2]], region: 6 }
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + d5 - d6)
    return { q: [b[0] + t * (c[0] - b[0]), b[1] + t * (c[1] - b[1]), b[2] + t * (c[2] - b[2])], region: 5 }
  }
  const den = 1 / (va + vb + vc)
  const v = vb * den
  const w = vc * den
  return { q: [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w], region: 0 }
}

// Welded triangle soup of the body with a uniform grid and pseudo-normals for the sign.
export function buildBody(pieces) {
  const weld = new Map()
  const verts = []
  const tris = []
  for (const piece of pieces) {
    const map = new Map()
    const id = (i) => {
      if (map.has(i)) return map.get(i)
      const p = [piece.positions[i * 3], piece.positions[i * 3 + 1], piece.positions[i * 3 + 2]]
      const key = p.map((v) => Math.round(v * WELD)).join(',')
      if (!weld.has(key)) { weld.set(key, verts.length); verts.push(p) }
      map.set(i, weld.get(key))
      return weld.get(key)
    }
    for (let t = 0; t < piece.indices.length; t += 3) {
      const tri = [id(piece.indices[t]), id(piece.indices[t + 1]), id(piece.indices[t + 2])]
      if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) tris.push(tri)
    }
  }
  if (!tris.length) throw new Error('the body has no triangles (check --body)')
  const faceN = tris.map(([a, b, c]) => norm(cross(sub(verts[b], verts[a]), sub(verts[c], verts[a]))))
  const vertN = verts.map(() => [0, 0, 0])
  const edgeN = new Map()
  tris.forEach((tri, f) => {
    for (let k = 0; k < 3; k++) {
      const i = tri[k]
      const e1 = norm(sub(verts[tri[(k + 1) % 3]], verts[i]))
      const e2 = norm(sub(verts[tri[(k + 2) % 3]], verts[i]))
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(e1, e2))))
      for (let j = 0; j < 3; j++) vertN[i][j] += faceN[f][j] * ang
      const [u, v] = [i, tri[(k + 1) % 3]].sort((x, y) => x - y)
      const en = edgeN.get(`${u}-${v}`) ?? [0, 0, 0]
      edgeN.set(`${u}-${v}`, [en[0] + faceN[f][0], en[1] + faceN[f][1], en[2] + faceN[f][2]])
    }
  })
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const v of verts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]) }
  const extent = [0, 1, 2].map((k) => hi[k] - lo[k])
  const longest = Math.max(...extent)
  const flat = extent.map((e) => Math.max(e, longest * 0.01)) // a flat body must not shrink the cells
  const cell = Math.max(Math.cbrt((flat[0] * flat[1] * flat[2]) / tris.length) * 2, longest / 256, 1e-4)
  const dim = lo.map((l, k) => Math.max(1, Math.ceil((hi[k] - l) / cell)))
  const cells = new Map()
  const ci = (v, k) => Math.max(0, Math.min(dim[k] - 1, Math.floor((v - lo[k]) / cell)))
  tris.forEach((tri, f) => {
    const pts = tri.map((i) => verts[i])
    const a = [0, 1, 2].map((k) => ci(Math.min(...pts.map((p) => p[k])), k))
    const b = [0, 1, 2].map((k) => ci(Math.max(...pts.map((p) => p[k])), k))
    for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) {
      const key = (x * dim[1] + y) * dim[2] + z
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key).push(f)
    }
  })
  return { verts, tris, faceN, vertN, edgeN, lo, cell, dim, cells, ci }
}

// Signed distance (m) from p to the body: positive outside, negative inside the closed surface.
export function signedDistance(body, p) {
  const { verts, tris, faceN, vertN, edgeN, cell, dim, cells, ci } = body
  const c0 = [0, 1, 2].map((k) => ci(p[k], k))
  let best = Infinity
  let hit = null
  const seen = new Set()
  const maxR = Math.max(...[0, 1, 2].map((k) => Math.max(c0[k], dim[k] - 1 - c0[k])))
  const clip = (k, r) => [Math.max(0, c0[k] - r), Math.min(dim[k] - 1, c0[k] + r)]
  for (let r = 0; r <= maxR && !(best <= r * cell); r++) {
    const [x0, x1] = clip(0, r)
    const [y0, y1] = clip(1, r)
    const [z0, z1] = clip(2, r)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      if (Math.max(Math.abs(x - c0[0]), Math.abs(y - c0[1]), Math.abs(z - c0[2])) !== r) continue
      for (const f of cells.get((x * dim[1] + y) * dim[2] + z) ?? []) {
        if (seen.has(f)) continue
        seen.add(f)
        const [ia, ib, ic] = tris[f]
        const { q, region } = closestOnTriangle(p, verts[ia], verts[ib], verts[ic])
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
        if (d < best) { best = d; hit = { f, q, region } }
      }
    }
  }
  if (!hit || best === 0) return best === Infinity ? Infinity : 0
  const tri = tris[hit.f]
  const edge = (a, b) => edgeN.get(`${Math.min(a, b)}-${Math.max(a, b)}`)
  const n = [faceN[hit.f], vertN[tri[0]], vertN[tri[1]], vertN[tri[2]], edge(tri[0], tri[1]), edge(tri[1], tri[2]), edge(tri[2], tri[0])][hit.region]
  return dot(sub(p, hit.q), n) < 0 ? -best : best
}

export function measure(bodyPieces, partPieces, { label = 'rest', limitMm = 0 } = {}) {
  const body = buildBody(bodyPieces)
  const parts = partPieces.map((piece) => {
    // a vertex the body itself uses would measure 0 against itself
    const shared = new Set(bodyPieces.filter((b) => b.positions === piece.positions).flatMap((b) => [...b.indices]))
    const used = [...new Set(piece.indices)].filter((i) => !shared.has(i))
    let min = Infinity
    let worst = -1
    let inside = 0
    for (const i of used) {
      const d = signedDistance(body, [piece.positions[i * 3], piece.positions[i * 3 + 1], piece.positions[i * 3 + 2]])
      if (d < min) { min = d; worst = i }
      if (d < -EPS_M) inside++
    }
    if (!used.length || !Number.isFinite(min)) throw new Error(`${piece.name}: no measurable vertices (all shared with the body, or no body surface near)`)
    const minMm = Math.round(min * 1e5) / 100
    const insidePct = Math.round((inside / used.length) * 1e4) / 100
    return {
      name: piece.name, vertices: used.length, minMm, insidePct, insideVertices: inside,
      worstVertex: worst, worstPositionM: worst < 0 ? null : [0, 1, 2].map((k) => piece.positions[worst * 3 + k]),
      pass: min * 1000 >= limitMm - EPS_M * 1000 && inside === 0,
    }
  })
  return { label, limit: { minMm: limitMm, insidePct: 0 }, bodyTriangles: body.tris.length, parts, pass: parts.length > 0 && parts.every((p) => p.pass) }
}

// One line in the shape of the done report: label, per piece "min mm / % inside", verdict.
export function summaryLine(result) {
  const rows = result.parts.map((p) => `${p.name} ${p.minMm} mm / ${p.insidePct} %`)
  return `${result.label}: ${rows.join(' | ') || 'no parts'} | limit min >= ${result.limit.minMm} mm, 0 % inside | ${result.pass ? 'PASS' : 'FAIL'}`
}

export function select(pieces, regex) {
  const re = new RegExp(regex, 'i')
  return pieces.filter((p) => re.test(p.name))
}

export function parseArgs(argv) {
  const opt = { body: 'SKIN', parts: 'CLOTH', label: 'rest' }
  const files = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())
      if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`)
      opt[key] = argv[++i]
    } else files.push(argv[i])
  }
  opt.file = files[0]
  if (opt.limitMm !== undefined && !Number.isFinite(Number(opt.limitMm))) throw new Error(`--limit-mm needs a number, got "${opt.limitMm}"`)
  return opt
}

export function run(argv) {
  const opt = parseArgs(argv)
  if (!opt.file && !(opt.bodyFile && opt.partsFile)) throw new Error('usage: clipping.mjs <file.vrm|glb> [--body SKIN] [--parts CLOTH] [--body-file f] [--parts-file f] [--limit-mm 0] [--label rest] [--out result.json]')
  const load = (f) => loadPieces(readFileSync(f))
  const bodyPieces = select(load(opt.bodyFile ?? opt.file), opt.body)
  const partPieces = select(load(opt.partsFile ?? opt.file), opt.parts).filter((p) => !bodyPieces.some((b) => b.positions === p.positions && b.primitive === p.primitive && b.name === p.name))
  const count = new Map()
  for (const p of partPieces) count.set(p.name, (count.get(p.name) ?? 0) + 1)
  for (const p of partPieces) if (count.get(p.name) > 1) p.name += `#${p.primitive}`
  if (!partPieces.length) throw new Error(`no parts match --parts ${opt.parts}`)
  const result = { file: opt.partsFile ?? opt.file, ...measure(bodyPieces, partPieces, { label: opt.label, limitMm: Number(opt.limitMm ?? 0) }) }
  if (opt.out) writeFileSync(opt.out, `${JSON.stringify(result, null, 2)}\n`)
  return result
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = run(process.argv.slice(2))
    console.log(summaryLine(result))
    process.exit(result.pass ? 0 : 1)
  } catch (e) {
    console.error(`clipping: ${e.message}`)
    process.exit(2)
  }
}
