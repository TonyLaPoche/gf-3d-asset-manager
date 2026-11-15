const fs = require('fs/promises')
const path = require('path')
const ExcelJS = require('exceljs')

const EXTENSIONS = new Set(['.glb', '.gltf'])
const LABELS = {
  garder: 'On garde',
  etudier: 'On étudie',
  supprimer: 'On supprime',
}
const REVIEW_DIR = '.gf-revue'

function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function reviewDir(root) {
  return path.join(root, REVIEW_DIR)
}

async function scanFolder(root, onProgress) {
  const stat = await fs.stat(root).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error('Ce dossier est introuvable.')
  }

  const assets = []
  const warnings = []
  const seen = new Set()
  const queue = [root]
  let unreadable = 0

  while (queue.length) {
    const dir = queue.pop()
    let real
    try {
      real = await fs.realpath(dir)
    } catch {
      unreadable += 1
      continue
    }
    if (seen.has(real)) continue
    seen.add(real)

    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      unreadable += 1
      continue
    }

    for (const entry of entries) {
      if (entry.name === REVIEW_DIR || entry.name === '$RECYCLE.BIN' || entry.name === 'System Volume Information') {
        continue
      }
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        queue.push(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
      try {
        const fileStat = await fs.stat(full)
        assets.push({
          name: entry.name,
          rel: path.relative(root, full).split(path.sep).join('/'),
          abs: full,
          size: fileStat.size,
        })
      } catch {
        unreadable += 1
      }
      if (onProgress && assets.length % 200 === 0) onProgress(assets.length)
    }
  }

  assets.sort((a, b) => a.rel.localeCompare(b.rel, 'fr', { numeric: true, sensitivity: 'base' }))
  if (onProgress) onProgress(assets.length)
  if (unreadable > 0) {
    warnings.push(
      unreadable === 1
        ? '1 élément n’a pas pu être lu (accès refusé ou lien cassé).'
        : `${unreadable} éléments n’ont pas pu être lus (accès refusé ou lien cassé).`,
    )
  }
  return { assets, warnings }
}

async function readSession(root) {
  const file = path.join(reviewDir(root), 'session.json')
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, votes: {}, createdAt: null }
    throw new Error('Impossible de lire la session de revue.')
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    const parked = `${file}.corrompu-${Date.now()}`
    await fs.rename(file, parked).catch(() => {})
    return {
      version: 1,
      votes: {},
      createdAt: null,
      warning: 'La session était illisible. Elle a été mise de côté, aucun vote n’a été repris.',
    }
  }

  if (!data || typeof data !== 'object' || data.version !== 1 || typeof data.votes !== 'object' || data.votes === null) {
    throw new Error('Cette session a été créée par une autre version de l’application. Le fichier n’a pas été modifié.')
  }

  const votes = {}
  for (const [rel, vote] of Object.entries(data.votes)) {
    if (!vote || (vote.status !== 'garder' && vote.status !== 'etudier' && vote.status !== 'supprimer')) continue
    votes[rel] = {
      status: vote.status,
      at: typeof vote.at === 'string' ? vote.at : new Date().toISOString(),
    }
  }
  return { version: 1, votes, createdAt: data.createdAt || null }
}

async function atomicReplace(tmp, dest) {
  const backup = `${dest}.bak`
  let hadOriginal = true
  try {
    await fs.rename(dest, backup)
  } catch (error) {
    if (error.code === 'ENOENT') hadOriginal = false
    else {
      const alt = dest.replace(/\.xlsx$/i, '.autosave.xlsx')
      await fs.rm(alt, { force: true }).catch(() => {})
      try {
        await fs.rename(tmp, alt)
      } catch {
        await fs.copyFile(tmp, alt)
        await fs.rm(tmp, { force: true })
      }
      const locked = new Error(`Le classeur est ouvert ailleurs. Une copie a été écrite : ${path.basename(alt)}`)
      locked.altPath = alt
      throw locked
    }
  }

  try {
    await fs.rename(tmp, dest)
  } catch (error) {
    if (hadOriginal) await fs.rename(backup, dest).catch(() => {})
    throw error
  }
  if (hadOriginal) await fs.rm(backup, { force: true }).catch(() => {})
}

function decisionLabel(status) {
  return status ? LABELS[status] : 'Pas encore voté'
}

function toRow(asset, vote) {
  return {
    decision: decisionLabel(vote?.status),
    status: vote?.status || null,
    name: asset.name,
    rel: asset.rel,
    sizeMo: Number((asset.size / (1024 * 1024)).toFixed(3)),
    at: vote?.at ? new Date(vote.at) : null,
    abs: asset.abs,
  }
}

async function writeWorkbook(root, assets, votes, createdAt, xlsxPath) {
  const counts = { garder: 0, etudier: 0, supprimer: 0, pending: 0 }
  const grouped = { garder: [], etudier: [], supprimer: [] }
  const all = []
  const known = new Set(assets.map((asset) => asset.rel))

  for (const asset of assets) {
    const vote = votes[asset.rel]
    const row = toRow(asset, vote)
    all.push(row)
    if (!vote) counts.pending += 1
    else {
      counts[vote.status] += 1
      grouped[vote.status].push(row)
    }
  }

  const orphans = []
  for (const [rel, vote] of Object.entries(votes)) {
    if (known.has(rel)) continue
    orphans.push({
      rel,
      decision: decisionLabel(vote.status),
      at: vote.at ? new Date(vote.at) : null,
    })
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Revue 3D'
  workbook.created = new Date()
  workbook.subject = 'Décisions de revue des assets GLB'

  const summary = workbook.addWorksheet('Résumé')
  summary.columns = [
    { width: 34 },
    { width: 88 },
  ]
  const summaryRows = [
    ['Revue d’assets 3D', ''],
    ['Dossier', root],
    ['Revue commencée le', createdAt ? new Date(createdAt) : ''],
    ['Classeur mis à jour le', new Date()],
    [],
    ['Total d’assets', assets.length],
    ['On garde', counts.garder],
    ['On étudie', counts.etudier],
    ['On supprime', counts.supprimer],
    ['Pas encore votés', counts.pending],
    ['Votes sans fichier (orphelins)', orphans.length],
    [],
    ['Note', 'Aucun fichier 3D n’a été supprimé ni modifié. Ce classeur est la liste des décisions.'],
  ]
  summaryRows.forEach((row) => summary.addRow(row))
  summary.getCell('A1').font = { bold: true, size: 16 }
  summary.getCell('B3').numFmt = 'dd/mm/yyyy hh:mm'
  summary.getCell('B4').numFmt = 'dd/mm/yyyy hh:mm'
  ;['A6', 'A7', 'A8', 'A9', 'A10', 'A11'].forEach((address) => {
    summary.getCell(address).font = { bold: true }
  })

  const columns = [
    { header: 'Décision', key: 'decision', width: 20 },
    { header: 'Nom', key: 'name', width: 42 },
    { header: 'Chemin relatif', key: 'rel', width: 72 },
    { header: 'Taille (Mo)', key: 'sizeMo', width: 14 },
    { header: 'Voté le', key: 'at', width: 20 },
    { header: 'Chemin complet', key: 'abs', width: 88 },
  ]

  function addDecisionSheet(name, rows, tabColor) {
    const sheet = workbook.addWorksheet(name)
    sheet.columns = columns
    styleHeader(sheet)
    sheet.properties.tabColor = { argb: tabColor }
    rows.forEach((row) => {
      const added = sheet.addRow(row)
      added.getCell('sizeMo').numFmt = '0.000'
      if (row.at) added.getCell('at').numFmt = 'dd/mm/yyyy hh:mm'
      tint(added, row.status)
    })
    sheet.autoFilter = { from: 'A1', to: 'F1' }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    return sheet
  }

  addDecisionSheet('On garde', grouped.garder, 'FF1F8F4E')
  addDecisionSheet('On étudie', grouped.etudier, 'FFC49214')
  addDecisionSheet('On supprime', grouped.supprimer, 'FFC24138')
  addDecisionSheet('Tout', all, 'FF607080')

  if (orphans.length) {
    const sheet = workbook.addWorksheet('Introuvables')
    sheet.columns = [
      { header: 'Chemin relatif', key: 'rel', width: 72 },
      { header: 'Décision', key: 'decision', width: 20 },
      { header: 'Voté le', key: 'at', width: 20 },
    ]
    styleHeader(sheet)
    sheet.properties.tabColor = { argb: 'FF8A8F98' }
    orphans.forEach((row) => {
      const added = sheet.addRow(row)
      if (row.at) added.getCell('at').numFmt = 'dd/mm/yyyy hh:mm'
    })
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  await fs.mkdir(path.dirname(xlsxPath), { recursive: true })
  const tmp = `${xlsxPath}.tmp.xlsx`
  await workbook.xlsx.writeFile(tmp)
  try {
    await atomicReplace(tmp, xlsxPath)
    return { path: xlsxPath, warning: null }
  } catch (error) {
    if (error.altPath) return { path: error.altPath, warning: error.message }
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

function styleHeader(sheet) {
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2933' } }
  header.alignment = { vertical: 'middle' }
  header.height = 22
}

function tint(row, status) {
  const colors = {
    garder: 'FFE5F6EC',
    etudier: 'FFFFF4D8',
    supprimer: 'FFFDE4E2',
  }
  const color = colors[status]
  if (!color) return
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
  })
}

async function persistReview(root, assets, votes) {
  const dir = reviewDir(root)
  await fs.mkdir(dir, { recursive: true })
  const jsonPath = path.join(dir, 'session.json')

  let createdAt = new Date().toISOString()
  try {
    const previous = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
    if (previous && previous.version !== 1) {
      throw new Error('Cette session a été créée par une autre version de l’application. Le fichier n’a pas été modifié.')
    }
    if (previous?.createdAt) createdAt = previous.createdAt
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }

  const cleanVotes = {}
  for (const [rel, vote] of Object.entries(votes || {})) {
    if (!vote || (vote.status !== 'garder' && vote.status !== 'etudier' && vote.status !== 'supprimer')) continue
    cleanVotes[rel] = {
      status: vote.status,
      at: typeof vote.at === 'string' ? vote.at : new Date().toISOString(),
    }
  }

  const payload = {
    version: 1,
    createdAt,
    updatedAt: new Date().toISOString(),
    votes: cleanVotes,
  }

  try {
    await fs.copyFile(jsonPath, `${jsonPath}.bak`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const tmpJson = `${jsonPath}.tmp`
  await fs.writeFile(tmpJson, JSON.stringify(payload))
  await fs.rm(jsonPath, { force: true }).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
  await fs.rename(tmpJson, jsonPath)

  const xlsxPath = path.join(dir, 'revue-assets.xlsx')
  const excel = await writeWorkbook(root, assets, cleanVotes, createdAt, xlsxPath)
  return {
    jsonPath,
    xlsxPath: excel.path,
    mainXlsxPath: xlsxPath,
    warning: excel.warning,
    createdAt,
  }
}

module.exports = {
  EXTENSIONS,
  LABELS,
  REVIEW_DIR,
  isInside,
  scanFolder,
  readSession,
  persistReview,
}
