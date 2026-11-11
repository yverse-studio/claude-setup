// MPFB2 figures -> KTX2 (colour ETC1S, normal UASTC) + meshopt GLB. node optimize-figures.mjs <in.glb> <out.glb> <colorPx> <normalPx|0>
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRTextureBasisu, KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, prune } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import { encodeToKTX2 } from 'ktx2-encoder'
import sharp from 'sharp'
import { statSync } from 'node:fs'
const [, , inp, outp, cpx, npx] = process.argv
await MeshoptEncoder.ready
const imageDecoder = async (b) => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height } }
async function ktx(buf, px, normal) {
  const png = await sharp(buf).resize(px, px, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  return encodeToKTX2(new Uint8Array(png), { imageDecoder, isUASTC: normal, generateMipmap: true, isNormalMap: normal, isSetKTX2SRGB: !normal, enableRDO: !normal, qualityLevel: 160 })
}
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRTextureBasisu, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(inp)
await doc.transform(dedup(), prune())
const root = doc.getRoot()
const normals = new Set(root.listMaterials().map((m) => m.getNormalTexture()).filter(Boolean))
for (const m of root.listMaterials()) { m.setAlphaMode('MASK').setAlphaCutoff(0.5); m.setMetallicFactor(0); m.setRoughnessFactor(0.75)
  if (+npx === 0 && m.getNormalTexture()) m.setNormalTexture(null) }
await doc.transform(prune())
for (const t of root.listTextures()) {
  const isN = normals.has(t) && +npx > 0
  t.setImage(await ktx(Buffer.from(t.getImage()), isN ? +npx : +cpx, isN)).setMimeType('image/ktx2')
}
doc.createExtension(KHRTextureBasisu).setRequired(true)
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
await io.write(outp, doc)
console.log(outp, (statSync(inp).size / 1e6).toFixed(2), 'MB ->', (statSync(outp).size / 1e6).toFixed(2), 'MB')
