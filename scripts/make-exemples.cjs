const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'exemples')

function pad4(buffer, fill) {
  const extra = (4 - (buffer.length % 4)) % 4
  if (!extra) return buffer
  return Buffer.concat([buffer, Buffer.alloc(extra, fill)])
}

function writeGlb(filePath, color) {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0.5, 0, 1,
    0.5, 0.9, 0.4,
  ])
  const indices = new Uint16Array([
    0, 1, 3,
    1, 2, 3,
    2, 0, 3,
    0, 2, 1,
  ])
  const bin = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(indices.buffer),
  ])

  const json = {
    asset: { version: '2.0', generator: 'Revue 3D — exemple' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: path.basename(filePath, '.glb') }],
    materials: [
      {
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [...color, 1],
          metallicFactor: 0.05,
          roughnessFactor: 0.55,
        },
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 0.9, 1],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48, target: 34962 },
      { buffer: 0, byteOffset: 48, byteLength: indices.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  }

  let jsonBuf = pad4(Buffer.from(JSON.stringify(json)), 0x20)
  const binBuf = pad4(bin, 0x00)
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length
  const out = Buffer.alloc(total)
  out.writeUInt32LE(0x46546c67, 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(total, 8)
  let offset = 12
  out.writeUInt32LE(jsonBuf.length, offset)
  out.writeUInt32LE(0x4e4f534a, offset + 4)
  jsonBuf.copy(out, offset + 8)
  offset += 8 + jsonBuf.length
  out.writeUInt32LE(binBuf.length, offset)
  out.writeUInt32LE(0x004e4942, offset + 4)
  binBuf.copy(out, offset + 8)

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, out)
}

fs.mkdirSync(root, { recursive: true })
writeGlb(path.join(root, 'chaise-orange.glb'), [0.86, 0.42, 0.16])
writeGlb(path.join(root, 'accessoires', 'lampe-bleue.glb'), [0.22, 0.45, 0.82])
fs.writeFileSync(
  path.join(root, 'fichier-illisible.glb'),
  'ceci nest pas un glb',
  'utf8',
)
console.log('Exemples GLB écrits.')
