const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const ExcelJS = require('exceljs')
const { isInside, scanFolder, persistReview, readSession } = require('../electron/library.cjs')

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'revue3d-'))
  const nested = path.join(root, 'meubles')
  fs.mkdirSync(nested, { recursive: true })
  const kept = path.join(nested, 'chaise.glb')
  const study = path.join(root, 'lampe.gltf')
  const removed = path.join(root, 'casse.glb')
  fs.writeFileSync(kept, 'glb')
  fs.writeFileSync(study, 'gltf')
  fs.writeFileSync(removed, 'bad')
  fs.mkdirSync(path.join(root, '.gf-revue'), { recursive: true })
  fs.writeFileSync(path.join(root, '.gf-revue', 'ignore.glb'), 'hidden')

  const sibling = path.join(path.dirname(root), `${path.basename(root)}-evil`)
  assert.equal(isInside(root, kept), true)
  assert.equal(isInside(root, sibling), false)

  const scanned = await scanFolder(root)
  assert.deepEqual(
    scanned.assets.map((asset) => asset.rel),
    ['casse.glb', 'lampe.gltf', 'meubles/chaise.glb'],
  )
  assert.equal(scanned.assets.some((asset) => asset.rel.includes('\\')), false)

  const votes = {
    'meubles/chaise.glb': { status: 'garder', at: '2026-04-01T10:00:00.000Z' },
    'lampe.gltf': { status: 'etudier', at: '2026-04-01T10:01:00.000Z' },
    'casse.glb': { status: 'supprimer', at: '2026-04-01T10:02:00.000Z' },
    'parti/ailleurs.glb': { status: 'garder', at: '2026-04-01T10:03:00.000Z' },
  }
  const saved = await persistReview(root, scanned.assets, votes)
  assert.equal(fs.existsSync(kept), true)
  assert.equal(fs.existsSync(removed), true)

  const session = await readSession(root)
  assert.equal(session.votes['casse.glb'].status, 'supprimer')
  assert.equal(Object.keys(session.votes).length, 4)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(saved.xlsxPath)
  const summary = workbook.getWorksheet('Résumé')
  assert.equal(summary.getCell('B7').value, 1)
  assert.equal(summary.getCell('B8').value, 1)
  assert.equal(summary.getCell('B9').value, 1)
  assert.equal(summary.getCell('B10').value, 0)
  assert.equal(workbook.getWorksheet('On garde').getCell('A2').value, 'On garde')
  assert.equal(workbook.getWorksheet('On garde').getCell('C2').value, 'meubles/chaise.glb')
  assert.equal(workbook.getWorksheet('On étudie').getCell('A2').value, 'On étudie')
  assert.equal(workbook.getWorksheet('On supprime').getCell('B2').value, 'casse.glb')
  assert.equal(workbook.getWorksheet('Tout').rowCount, 4)
  assert.equal(workbook.getWorksheet('Introuvables').getCell('A2').value, 'parti/ailleurs.glb')
  assert.equal(workbook.getWorksheet('On garde').rowCount, 2)

  fs.rmSync(root, { recursive: true, force: true })
  console.log('Contrôles OK.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
