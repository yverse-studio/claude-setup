// Clipping numbers: a built-in sphere body with a shell 3 mm outside, one 5 mm inside, and a real VRM
// whose cloth is pushed into the body on purpose (skipped without CLIPPING_VRM).
// Run: node --test scripts/clipping.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPieces, measure, summaryLine, parseArgs } from './clipping.mjs'

const script = fileURLToPath(new URL('./clipping.mjs', import.meta.url))

function sphere(radius, steps = 24) {
  const pos = []
  const idx = []
  for (let i = 0; i <= steps; i++) {
    const th = (Math.PI * i) / steps
    for (let j = 0; j <= steps; j++) {
      const ph = (2 * Math.PI * j) / steps
      pos.push(radius * Math.sin(th) * Math.cos(ph), radius * Math.cos(th), radius * Math.sin(th) * Math.sin(ph))
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
    const a = i * (steps + 1) + j
    const b = a + steps + 1
    idx.push(a, a + 1, b, a + 1, b + 1, b)
  }
  return { pos, idx }
}

// One GLB, one node + mesh per sphere ({name, radius}); material name carries SKIN or CLOTH.
function glb(spheres) {
  const bins = []
  const views = []
  const accessors = []
  const add = (arr, Cls, type, target) => {
    const data = Buffer.from(new Cls(arr).buffer)
    const offset = bins.reduce((n, b) => n + b.length, 0)
    bins.push(data, Buffer.alloc((4 - (data.length % 4)) % 4))
    views.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target })
    accessors.push({ bufferView: views.length - 1, componentType: Cls === Float32Array ? 5126 : 5125, count: arr.length / (type === 'VEC3' ? 3 : 1), type })
    return accessors.length - 1
  }
  const meshes = []
  const materials = []
  const nodes = spheres.map(({ name, radius, scale, badIndex, nan }, i) => {
    const s = sphere(radius)
    if (badIndex) s.idx[3] = 99999
    if (nan) s.pos[3] = NaN
    materials.push({ name })
    meshes.push({ primitives: [{ attributes: { POSITION: add(s.pos, Float32Array, 'VEC3', 34962) }, indices: add(s.idx, Uint32Array, 'SCALAR', 34963), material: i }] })
    return { name: `n${i}`, mesh: i, ...(scale && { scale }) }
  })
  const bin = Buffer.concat(bins)
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }] }))
  const jsonPad = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])
  const head = Buffer.alloc(12)
  head.writeUInt32LE(0x46546c67, 0)
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(12 + 8 + jsonPad.length + 8 + bin.length, 8)
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]) }
  return Buffer.concat([head, chunk(0x4e4f534a, jsonPad), chunk(0x004e4942, bin)])
}

const split = (pieces) => [pieces.filter((p) => /SKIN/.test(p.name)), pieces.filter((p) => /CLOTH/.test(p.name))]

test('a shell 3 mm outside passes, one 5 mm inside fails', () => {
  const [body, parts] = split(loadPieces(glb([{ name: 'SKIN', radius: 1 }, { name: 'CLOTH_ok', radius: 1.003 }, { name: 'CLOTH_clip', radius: 0.995 }])))
  const r = measure(body, parts)
  const [ok, clip] = r.parts
  assert.ok(ok.minMm > 2.5 && ok.minMm < 3.1, `ok ${ok.minMm}`)
  assert.equal(ok.insidePct, 0)
  assert.ok(clip.minMm < -4.5 && clip.minMm > -5.1, `clip ${clip.minMm}`)
  assert.equal(clip.insidePct, 100)
  assert.equal(r.pass, false)
  assert.match(summaryLine(r), /^rest: .*CLOTH_ok [\d.]+ mm \/ 0 % .*CLOTH_clip -[\d.]+ mm \/ 100 % .*FAIL$/)
})

test('only the good shell passes the limit', () => {
  const [body, parts] = split(loadPieces(glb([{ name: 'SKIN', radius: 1 }, { name: 'CLOTH_ok', radius: 1.003 }])))
  assert.equal(measure(body, parts).pass, true)
})

test('CLI: exit 0 on pass, 1 on a clip, 2 without parts; writes the JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-'))
  const good = join(dir, 'good.glb')
  const bad = join(dir, 'bad.glb')
  writeFileSync(good, glb([{ name: 'SKIN', radius: 1 }, { name: 'CLOTH', radius: 1.003 }]))
  writeFileSync(bad, glb([{ name: 'SKIN', radius: 1 }, { name: 'CLOTH', radius: 0.99 }]))
  const out = join(dir, 'r.json')
  const g = spawnSync('node', [script, good, '--out', out], { encoding: 'utf8' })
  assert.equal(g.status, 0, g.stderr)
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).parts[0].insidePct, 0)
  assert.equal(spawnSync('node', [script, bad], { encoding: 'utf8' }).status, 1)
  assert.equal(spawnSync('node', [script, good, '--parts', 'NOPE'], { encoding: 'utf8' }).status, 2)
})

const status = (spheres, extra = []) => {
  const f = join(mkdtempSync(join(tmpdir(), 'clip-')), 'm.glb')
  writeFileSync(f, glb(spheres))
  return spawnSync('node', [script, f, ...extra], { encoding: 'utf8' })
}

test('broken input exits 2 instead of a false PASS', () => {
  assert.equal(status([{ name: 'SKIN', radius: 1 }, { name: 'CLOTH', radius: 1.003, badIndex: true }]).status, 2)
  assert.equal(status([{ name: 'SKIN', radius: 1 }, { name: 'CLOTH', radius: 1.003, nan: true }]).status, 2)
})

test('a piece with no measurable vertices fails loudly', () => {
  const pieces = loadPieces(glb([{ name: 'SKIN', radius: 1 }]))
  assert.throws(() => measure(pieces, pieces), /no measurable vertices/)
})

test('a mirrored body node (scale -1) still tells inside from outside', () => {
  const run = (cloth) => status([{ name: 'SKIN', radius: 1, scale: [-1, 1, 1] }, { name: 'CLOTH', radius: cloth, scale: [-1, 1, 1] }])
  assert.equal(run(1.003).status, 0)
  assert.equal(run(0.9).status, 1)
})

test('a flat body does not blow up the grid; --limit-mm must be a number', () => {
  const flat = [{ name: 'SKIN', radius: 1, scale: [1, 0.001, 1] }, { name: 'CLOTH', radius: 1.003, scale: [1, 0.001, 1] }]
  assert.ok([0, 1].includes(status(flat).status))
  assert.equal(status([{ name: 'SKIN', radius: 1 }, { name: 'CLOTH', radius: 1.003 }], ['--limit-mm', 'abc']).status, 2)
  assert.equal(status([{ name: 'SKIN', radius: 1 }, { name: 'CLOTH', radius: 1.003 }], ['--limit-mm', '5']).status, 1)
})

test('parses flags', () => {
  const o = parseArgs(['a.vrm', '--parts', 'SHIRT', '--label', 'pose'])
  assert.deepEqual([o.file, o.body, o.parts, o.label], ['a.vrm', 'SKIN', 'SHIRT', 'pose'])
})

test('real VRM: baseline passes, cloth pushed 5 mm into the body fails', { skip: !process.env.CLIPPING_VRM || !existsSync(process.env.CLIPPING_VRM) }, () => {
  const pieces = loadPieces(readFileSync(process.env.CLIPPING_VRM))
  const [body, parts] = split(pieces)
  const base = measure(body, parts)
  assert.equal(base.pass, true, summaryLine(base))
  // move every cloth vertex 5 mm towards the body's centre line (x = 0, z = 0)
  const pushed = parts.map((p) => {
    const positions = Float64Array.from(p.positions)
    for (const i of new Set(p.indices)) {
      const [x, , z] = [positions[i * 3], 0, positions[i * 3 + 2]]
      const l = Math.hypot(x, z) || 1
      positions[i * 3] -= (x / l) * 0.005
      positions[i * 3 + 2] -= (z / l) * 0.005
    }
    return { ...p, positions }
  })
  const clipped = measure(body, pushed)
  assert.equal(clipped.pass, false)
  assert.ok(clipped.parts.some((p) => p.minMm < -2 && p.insidePct > 0), summaryLine(clipped))
})
