import './types'
import { configureTour, isTourOpen, maybeStartTour, startTour } from './tour'
import { Viewer } from './viewer'
import type { Asset, ExcelStatus, FilterMode, ModelStats, VoteRecord, VoteStatus } from './types'

const LABELS: Record<VoteStatus, string> = {
  garder: 'On garde',
  etudier: 'On étudie',
  supprimer: 'On supprime',
}
const ROW_H = 34

const viewer = new Viewer(document.querySelector<HTMLCanvasElement>('#c')!)

const app = must<HTMLDivElement>('app')
const welcome = must<HTMLElement>('welcome')
const workspace = must<HTMLDivElement>('workspace')
const folderLabel = must<HTMLDivElement>('folderLabel')
const searchInput = must<HTMLInputElement>('search')
const listEl = must<HTMLDivElement>('list')
const listSpacer = must<HTMLDivElement>('listSpacer')
const listRows = must<HTMLDivElement>('listRows')
const fileName = must<HTMLHeadingElement>('fileName')
const filePath = must<HTMLParagraphElement>('filePath')
const pill = must<HTMLSpanElement>('pill')
const meta = must<HTMLParagraphElement>('meta')
const warnings = must<HTMLParagraphElement>('warnings')
const loadbar = must<HTMLDivElement>('loadbar')
const loadbarFill = must<HTMLDivElement>('loadbarFill')
const errorBox = must<HTMLDivElement>('errorBox')
const emptyView = must<HTMLDivElement>('emptyView')
const emptyTitle = must<HTMLHeadingElement>('emptyTitle')
const emptyText = must<HTMLParagraphElement>('emptyText')
const flash = must<HTMLDivElement>('flash')
const countsEl = must<HTMLDivElement>('counts')
const barFill = must<HTMLDivElement>('barFill')
const posEl = must<HTMLSpanElement>('pos')
const statusline = must<HTMLSpanElement>('statusline')
const busy = must<HTMLDivElement>('busy')
const busyText = must<HTMLParagraphElement>('busyText')
const help = must<HTMLDivElement>('help')
const toastEl = must<HTMLDivElement>('toast')

const buttons = {
  garder: must<HTMLButtonElement>('garder'),
  etudier: must<HTMLButtonElement>('etudier'),
  supprimer: must<HTMLButtonElement>('supprimer'),
  prev: must<HTMLButtonElement>('prev'),
  next: must<HTMLButtonElement>('next'),
  refresh: must<HTMLButtonElement>('refresh'),
  openExcel: must<HTMLButtonElement>('openExcel'),
  showFile: must<HTMLButtonElement>('showFile'),
  grid: must<HTMLButtonElement>('gridBtn'),
  wire: must<HTMLButtonElement>('wireBtn'),
}

let folder: string | null = null
let assets: Asset[] = []
let filtered: Asset[] = []
let votes = new Map<string, VoteRecord>()
let selectedRel: string | null = null
let filterMode: FilterMode = 'pending'
let search = ''
let currentStats: ModelStats | null = null
let excelPath: string | null = null
let voteLock = false
let helpOpen = false
let gridOn = true
let wireOn = false
let toastTimer = 0
let paintQueued = false
let lastExcelMessage = ''
const undoStack: { rel: string; previous: VoteRecord | null }[] = []

function must<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Élément manquant : ${id}`)
  return element as T
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString('fr-FR')} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`
  return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

function joinPath(base: string, ...parts: string[]) {
  const sep = base.includes('\\') ? '\\' : '/'
  return [base, ...parts].join(sep)
}

function toast(message: string) {
  toastEl.textContent = message
  toastEl.classList.add('on')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), 3400)
}

function setBusy(text: string | null) {
  if (!text) {
    busy.classList.remove('on')
    return
  }
  busyText.textContent = text
  busy.classList.add('on')
}

function counts() {
  let garder = 0
  let etudier = 0
  let supprimer = 0
  for (const asset of assets) {
    const vote = votes.get(asset.rel)
    if (vote?.status === 'garder') garder += 1
    else if (vote?.status === 'etudier') etudier += 1
    else if (vote?.status === 'supprimer') supprimer += 1
  }
  const pending = assets.length - garder - etudier - supprimer
  return { garder, etudier, supprimer, pending, total: assets.length }
}

function current() {
  return filtered.find((asset) => asset.rel === selectedRel) ?? null
}

function refreshFilter() {
  const query = search.trim().toLowerCase()
  filtered = assets.filter((asset) => {
    const vote = votes.get(asset.rel)
    if (filterMode === 'pending' && vote) return false
    if (filterMode === 'garder' && vote?.status !== 'garder') return false
    if (filterMode === 'etudier' && vote?.status !== 'etudier') return false
    if (filterMode === 'supprimer' && vote?.status !== 'supprimer') return false
    if (!query) return true
    return asset.name.toLowerCase().includes(query) || asset.rel.toLowerCase().includes(query)
  })
  paintList()
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function paintList() {
  const total = filtered.length * ROW_H
  listSpacer.style.height = `${total}px`
  const start = Math.max(0, Math.floor(listEl.scrollTop / ROW_H) - 8)
  const end = Math.min(filtered.length, Math.ceil((listEl.scrollTop + listEl.clientHeight) / ROW_H) + 8)
  listRows.style.transform = `translateY(${start * ROW_H}px)`
  listRows.innerHTML = filtered.slice(start, end).map((asset, offset) => {
    const index = start + offset
    const vote = votes.get(asset.rel)
    const slash = asset.rel.lastIndexOf('/')
    const dir = slash >= 0 ? asset.rel.slice(0, slash) : ''
    const selected = asset.rel === selectedRel ? ' selected' : ''
    return `<button type="button" class="row${selected}" data-index="${index}" style="height:${ROW_H}px">
      <i class="dot ${vote?.status ?? 'pending'}"></i>
      <span><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(dir)}</small></span>
    </button>`
  }).join('')
}

function schedulePaint() {
  if (paintQueued) return
  paintQueued = true
  requestAnimationFrame(() => {
    paintQueued = false
    paintList()
  })
}

function scrollSelectedIntoView() {
  const index = filtered.findIndex((asset) => asset.rel === selectedRel)
  if (index < 0) return
  const top = index * ROW_H
  if (top < listEl.scrollTop) listEl.scrollTop = top
  else if (top + ROW_H > listEl.scrollTop + listEl.clientHeight) {
    listEl.scrollTop = top - listEl.clientHeight + ROW_H
  }
}

function renderOverlay(asset: Asset | null, stats: ModelStats | null) {
  if (!asset) {
    fileName.textContent = ''
    filePath.textContent = ''
    pill.hidden = true
    meta.textContent = ''
    warnings.textContent = ''
    buttons.showFile.disabled = true
    return
  }
  fileName.textContent = asset.name
  filePath.textContent = asset.rel
  filePath.title = asset.abs
  buttons.showFile.disabled = false
  const vote = votes.get(asset.rel)
  if (vote) {
    pill.hidden = false
    pill.className = `pill ${vote.status}`
    pill.textContent = LABELS[vote.status]
  } else pill.hidden = true

  const parts = [formatSize(asset.size)]
  if (stats) {
    parts.push(`${stats.triangles.toLocaleString('fr-FR')} triangles`)
    parts.push(`${stats.meshes.toLocaleString('fr-FR')} maillage${stats.meshes > 1 ? 's' : ''}`)
    parts.push(`${stats.materials.toLocaleString('fr-FR')} matériau${stats.materials > 1 ? 'x' : ''}`)
    if (stats.animations) parts.push(`${stats.animations} animation${stats.animations > 1 ? 's' : ''}`)
    parts.push(stats.dimensions)
    if (stats.generator) parts.push(stats.generator)
  }
  meta.textContent = parts.join(' · ')
  warnings.textContent = stats?.warnings.join(' · ') ?? ''
}

function updateChrome() {
  const tally = counts()
  const done = tally.total - tally.pending
  const title = tally.total
    ? `Revue 3D — ${done.toLocaleString('fr-FR')} / ${tally.total.toLocaleString('fr-FR')}`
    : 'Revue 3D'
  document.title = title
  void window.revue?.setTitle(title)
  folderLabel.textContent = folder ?? 'Aucun dossier'
  folderLabel.title = folder ?? ''

  const labels: Record<FilterMode, string> = {
    pending: `À voter ${tally.pending.toLocaleString('fr-FR')}`,
    garder: `On garde ${tally.garder.toLocaleString('fr-FR')}`,
    etudier: `On étudie ${tally.etudier.toLocaleString('fr-FR')}`,
    supprimer: `On supprime ${tally.supprimer.toLocaleString('fr-FR')}`,
    all: `Tous ${tally.total.toLocaleString('fr-FR')}`,
  }
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    const mode = button.dataset.filter as FilterMode
    button.textContent = labels[mode]
    button.classList.toggle('active', mode === filterMode)
  })

  const kept = tally.garder === 1 ? '1 gardé' : `${tally.garder.toLocaleString('fr-FR')} gardés`
  countsEl.textContent = tally.total
    ? `${tally.pending.toLocaleString('fr-FR')} à voter · ${kept} · ${tally.etudier.toLocaleString('fr-FR')} à étudier · ${tally.supprimer.toLocaleString('fr-FR')} à supprimer`
    : 'Aucun fichier GLB'
  barFill.style.width = tally.total ? `${(done / tally.total) * 100}%` : '0%'

  const asset = current()
  const index = filtered.findIndex((item) => item.rel === selectedRel)
  posEl.textContent = filtered.length && index >= 0
    ? `${(index + 1).toLocaleString('fr-FR')} / ${filtered.length.toLocaleString('fr-FR')}`
    : '—'
  const canMove = Boolean(asset)
  buttons.prev.disabled = !canMove
  buttons.next.disabled = !canMove
  buttons.garder.disabled = !canMove
  buttons.etudier.disabled = !canMove
  buttons.supprimer.disabled = !canMove
  buttons.refresh.disabled = !folder
  buttons.openExcel.disabled = !folder
  renderOverlay(asset, currentStats)

  const showEmpty = !asset
  emptyView.classList.toggle('on', showEmpty)
  if (showEmpty) {
    if (!tally.total) {
      emptyTitle.textContent = 'Aucun GLB dans ce dossier'
      emptyText.textContent = 'Les fichiers .glb et .gltf, y compris dans les sous-dossiers, apparaissent ici.'
    } else if (filterMode === 'pending') {
      emptyTitle.textContent = 'Revue terminée'
      emptyText.textContent = 'Chaque fichier a une décision. Le classeur Excel rassemble On garde, On étudie et On supprime.'
    } else if (search.trim()) {
      emptyTitle.textContent = 'Aucun résultat'
      emptyText.textContent = 'Essayez un autre nom, ou changez de filtre.'
    } else {
      emptyTitle.textContent = 'Rien dans ce filtre'
      emptyText.textContent = 'Les fichiers votés autrement sont dans les autres listes.'
    }
  }
}

function setLoading(active: boolean) {
  loadbar.classList.toggle('on', active)
  if (!active) {
    loadbar.classList.remove('unknown')
    loadbarFill.style.width = '0%'
  }
}

function readableError(error: unknown) {
  const raw = error instanceof Error ? error.message : 'Impossible d’afficher ce fichier.'
  if (/JSON|parse|invalid|unexpected|typed array|unsupported|extension/i.test(raw)) {
    return 'Ce fichier GLB est illisible.'
  }
  return 'Impossible d’afficher ce fichier.'
}

function showError(message: string) {
  errorBox.textContent = `${message} Vous pouvez quand même voter.`
  errorBox.classList.add('on')
}

function hideError() {
  errorBox.classList.remove('on')
  errorBox.textContent = ''
}

async function loadSelected() {
  const asset = current()
  currentStats = null
  hideError()
  if (!asset || !window.revue) {
    viewer.clear()
    setLoading(false)
    updateChrome()
    return
  }
  const rel = asset.rel
  setLoading(true)
  loadbar.classList.add('unknown')
  updateChrome()
  try {
    const stats = await viewer.load(window.revue.assetUrl(asset.abs), (ratio) => {
      if (current()?.rel !== rel) return
      if (ratio === null) {
        loadbar.classList.add('unknown')
        return
      }
      loadbar.classList.remove('unknown')
      loadbarFill.style.width = `${Math.round(ratio * 100)}%`
    })
    if (current()?.rel !== rel) return
    currentStats = stats
    setLoading(false)
    updateChrome()
  } catch (error) {
    if (current()?.rel !== rel) return
    viewer.clear()
    setLoading(false)
    showError(readableError(error))
    updateChrome()
  }
}

function select(rel: string | null) {
  const changed = rel !== selectedRel
  selectedRel = rel
  if (changed) currentStats = null
  paintList()
  scrollSelectedIntoView()
  updateChrome()
  if (changed) void loadSelected()
}

function setFilter(mode: FilterMode) {
  filterMode = mode
  refreshFilter()
  if (!filtered.some((asset) => asset.rel === selectedRel)) select(filtered[0]?.rel ?? null)
  else updateChrome()
}

function flashVote(status: VoteStatus) {
  flash.className = ''
  void flash.offsetWidth
  flash.className = status
}

function vote(status: VoteStatus) {
  const asset = current()
  if (!asset || voteLock) return
  voteLock = true
  window.setTimeout(() => {
    voteLock = false
  }, 260)
  const previous = votes.get(asset.rel) ?? null
  undoStack.push({ rel: asset.rel, previous: previous ? { ...previous } : null })
  if (undoStack.length > 100) undoStack.shift()
  votes.set(asset.rel, { status, at: new Date().toISOString() })
  const oldIndex = filtered.findIndex((item) => item.rel === asset.rel)
  refreshFilter()
  const stillThere = filtered.some((item) => item.rel === asset.rel)
  let nextRel: string | null = null
  if (filtered.length === 0) nextRel = null
  else if (stillThere) nextRel = filtered[Math.min(oldIndex + 1, filtered.length - 1)]?.rel ?? null
  else nextRel = filtered[Math.min(oldIndex, filtered.length - 1)]?.rel ?? null
  flashVote(status)
  select(nextRel)
  void persist()
}

function undo() {
  const last = undoStack.pop()
  if (!last) {
    toast('Aucun vote à annuler')
    return
  }
  if (last.previous) votes.set(last.rel, last.previous)
  else votes.delete(last.rel)
  refreshFilter()
  if (!filtered.some((asset) => asset.rel === last.rel)) {
    const voteRecord = votes.get(last.rel)
    filterMode = voteRecord ? voteRecord.status : 'pending'
    refreshFilter()
  }
  select(last.rel)
  toast('Dernier vote annulé')
  void persist()
}

async function persist() {
  if (!folder || !window.revue) return
  try {
    await window.revue.saveSession(folder, Object.fromEntries(votes))
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Enregistrement impossible')
  }
}

function move(delta: number) {
  if (!filtered.length) return
  const index = Math.max(0, filtered.findIndex((asset) => asset.rel === selectedRel))
  const next = filtered[Math.min(filtered.length - 1, Math.max(0, index + delta))]
  if (next) select(next.rel)
}

function showWorkspace(on: boolean) {
  welcome.classList.toggle('off', on)
  workspace.classList.toggle('on', on)
  if (on) viewer.resize()
}

async function openFolder(nextFolder: string, focusName?: string) {
  if (!window.revue) return
  folder = nextFolder
  excelPath = joinPath(nextFolder, '.gf-revue', 'revue-assets.xlsx')
  showWorkspace(true)
  setBusy('Lecture du dossier…')
  statusline.textContent = 'Lecture du dossier…'
  const stop = window.revue.onScanProgress((count) => {
    busyText.textContent = `${count.toLocaleString('fr-FR')} fichiers GLB trouvés…`
  })
  try {
    const [scan, session] = await Promise.all([
      window.revue.scan(nextFolder),
      window.revue.loadSession(nextFolder),
    ])
    assets = scan.assets
    votes = new Map(
      Object.entries(session.votes).map(([rel, vote]) => [rel, vote]),
    )
    undoStack.length = 0
    search = ''
    searchInput.value = ''
    filterMode = 'pending'
    if (session.warning) toast(session.warning)
    scan.warnings.forEach((warning) => toast(warning))
    refreshFilter()
    let focus = filtered[0]?.rel ?? null
    if (focusName) {
      const match = assets.find((asset) => asset.rel === focusName || asset.name === focusName)
      if (match) {
        if (!filtered.some((asset) => asset.rel === match.rel)) {
          filterMode = votes.get(match.rel)?.status ?? 'all'
          refreshFilter()
        }
        focus = match.rel
      }
    }
    selectedRel = null
    select(focus)
    statusline.textContent = `Session prête · ${excelPath}`
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Impossible d’ouvrir ce dossier')
    folder = null
    assets = []
    filtered = []
    votes.clear()
    showWorkspace(false)
  } finally {
    stop()
    setBusy(null)
    updateChrome()
  }
}

async function chooseFolder() {
  if (!window.revue) return
  const picked = await window.revue.pickFolder()
  if (picked) await openFolder(picked)
}

function typingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
}

function setHelp(open: boolean) {
  helpOpen = open
  help.hidden = !open
}

function onExcel(status: ExcelStatus) {
  if (status.ok === false || status.warning) {
    const message = status.warning || 'Le classeur n’a pas pu être mis à jour.'
    statusline.textContent = message
    if (status.xlsxPath) excelPath = status.xlsxPath
    if (message !== lastExcelMessage) {
      lastExcelMessage = message
      toast(message)
    }
    return
  }
  lastExcelMessage = ''
  if (status.xlsxPath) excelPath = status.xlsxPath
  statusline.textContent = excelPath ? `Classeur à jour · ${excelPath}` : 'Classeur à jour'
}

async function dropped(file: File) {
  if (!window.revue) return
  let filePath = ''
  try {
    filePath = window.revue.pathForFile(file)
  } catch {
    toast('Impossible de lire ce dépôt.')
    return
  }
  try {
    const info = await window.revue.inspectPath(filePath)
    if (info.isDir) await openFolder(filePath)
    else await openFolder(info.parent, info.base)
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Dépôt impossible')
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => setFilter(button.dataset.filter as FilterMode))
})

listEl.addEventListener('scroll', schedulePaint)
listRows.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-index]')
  if (!row) return
  const asset = filtered[Number(row.dataset.index)]
  if (asset) select(asset.rel)
})

searchInput.addEventListener('input', () => {
  search = searchInput.value
  refreshFilter()
  if (!filtered.some((asset) => asset.rel === selectedRel)) select(filtered[0]?.rel ?? null)
  else updateChrome()
})

must<HTMLButtonElement>('pick').addEventListener('click', () => void chooseFolder())
must<HTMLButtonElement>('pickWelcome').addEventListener('click', () => void chooseFolder())
buttons.refresh.addEventListener('click', () => {
  if (folder) void openFolder(folder, selectedRel ?? undefined)
})
buttons.openExcel.addEventListener('click', async () => {
  if (!excelPath || !window.revue) return
  const error = await window.revue.openPath(excelPath)
  if (error) toast('Le classeur n’existe pas encore. Il est créé au premier vote.')
})
buttons.showFile.addEventListener('click', () => {
  const asset = current()
  if (asset) void window.revue?.showInFolder(asset.abs)
})
buttons.prev.addEventListener('click', () => move(-1))
buttons.next.addEventListener('click', () => move(1))
buttons.garder.addEventListener('click', () => vote('garder'))
buttons.etudier.addEventListener('click', () => vote('etudier'))
buttons.supprimer.addEventListener('click', () => vote('supprimer'))
must<HTMLButtonElement>('frameBtn').addEventListener('click', () => viewer.resetCamera())
buttons.grid.addEventListener('click', () => {
  gridOn = !gridOn
  buttons.grid.setAttribute('aria-pressed', String(gridOn))
  viewer.setGridVisible(gridOn)
})
buttons.wire.addEventListener('click', () => {
  wireOn = !wireOn
  buttons.wire.setAttribute('aria-pressed', String(wireOn))
  viewer.setWireframe(wireOn)
})
must<HTMLButtonElement>('toggleList').addEventListener('click', () => {
  app.classList.toggle('sidebar-collapsed')
  localStorage.setItem('revue3d-sidebar', app.classList.contains('sidebar-collapsed') ? '0' : '1')
  viewer.resize()
})
must<HTMLButtonElement>('helpBtn').addEventListener('click', () => setHelp(true))
must<HTMLButtonElement>('tourReplay').addEventListener('click', () => {
  setHelp(false)
  startTour()
})
must<HTMLButtonElement>('helpClose').addEventListener('click', () => setHelp(false))
help.addEventListener('click', (event) => {
  if (event.target === help) setHelp(false)
})
must<HTMLDivElement>('viewport').addEventListener('dblclick', (event) => {
  if ((event.target as HTMLElement).closest('button')) return
  viewer.resetCamera()
})

window.addEventListener('keydown', (event) => {
  if (isTourOpen()) return
  if (event.key === 'Escape' && helpOpen) {
    setHelp(false)
    return
  }
  if (helpOpen || typingTarget(event.target)) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undo()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return

  if (event.code === 'ArrowLeft') {
    event.preventDefault()
    move(-1)
  } else if (event.code === 'ArrowRight') {
    event.preventDefault()
    move(1)
  } else if (event.code === 'Home') select(filtered[0]?.rel ?? null)
  else if (event.code === 'End') select(filtered[filtered.length - 1]?.rel ?? null)
  else if (event.code === 'PageUp') move(-10)
  else if (event.code === 'PageDown') move(10)
  else if (event.code === 'KeyG' || event.code === 'Numpad1') vote('garder')
  else if (event.code === 'KeyE' || event.code === 'Numpad2') vote('etudier')
  else if (event.code === 'KeyS' || event.code === 'Numpad3' || event.code === 'Delete') vote('supprimer')
  else if (event.code === 'KeyR') viewer.resetCamera()
  else if (event.code === 'KeyW') {
    wireOn = !wireOn
    buttons.wire.setAttribute('aria-pressed', String(wireOn))
    viewer.setWireframe(wireOn)
  } else if (event.code === 'KeyL') {
    gridOn = !gridOn
    buttons.grid.setAttribute('aria-pressed', String(gridOn))
    viewer.setGridVisible(gridOn)
  } else if (event.code === 'KeyH') setHelp(true)
  else if (event.code === 'Space') {
    event.preventDefault()
    const playing = viewer.togglePlayback()
    if (playing === null) toast('Pas d’animation dans ce fichier')
  }
})

let dragDepth = 0
document.addEventListener('dragenter', (event) => {
  event.preventDefault()
  dragDepth += 1
  document.body.classList.add('drag')
})
document.addEventListener('dragleave', (event) => {
  event.preventDefault()
  dragDepth -= 1
  if (dragDepth <= 0) {
    dragDepth = 0
    document.body.classList.remove('drag')
  }
})
document.addEventListener('dragover', (event) => event.preventDefault())
document.addEventListener('drop', (event) => {
  event.preventDefault()
  dragDepth = 0
  document.body.classList.remove('drag')
  const file = event.dataTransfer?.files?.[0]
  if (file) void dropped(file)
})

if (localStorage.getItem('revue3d-sidebar') === '0') app.classList.add('sidebar-collapsed')

configureTour({ onLayout: () => viewer.resize() })

async function boot() {
  if (!window.revue) {
    emptyTitle.textContent = 'Lancez l’application avec npm start'
    welcome.querySelector('.lead')!.textContent = 'Cette fenêtre doit s’ouvrir via Electron, pas comme une page web isolée.'
    return
  }
  window.revue.onExcelStatus(onExcel)
  updateChrome()
  const bootstrap = await window.revue.bootstrap()
  const initial = bootstrap.argFolder || bootstrap.lastFolder
  if (initial) await openFolder(initial)
  maybeStartTour()
}

void boot()
