const STORAGE_KEY = 'revue3d-onboarding'

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center'

interface TourStep {
  title: string
  body: string
  target?: string
  fallback?: string
  placement: Placement
  revealWorkspace?: boolean
  expandSidebar?: boolean
}

const STEPS: TourStep[] = [
  {
    title: 'Bienvenue dans Revue 3D',
    body: 'Vous allez regarder chaque fichier 3D, puis décider à la main. Ce guide montre chaque commande, une par une. Rien de ce que vous ferez ici n’efface un modèle.',
    placement: 'center',
  },
  {
    title: 'Choisir le dossier',
    body: 'Ce bouton ouvre le dossier de vos assets. Les sous-dossiers sont inclus. Seuls les fichiers .glb et .gltf entrent dans la revue.',
    target: '#pick',
    placement: 'bottom',
  },
  {
    title: 'Ou déposer le dossier',
    body: 'Vous pouvez aussi glisser un dossier, ou un fichier GLB, directement dans la fenêtre. S’il s’agit d’un fichier, son dossier s’ouvre et ce fichier est affiché.',
    target: '#pickWelcome',
    fallback: '#folderLabel',
    placement: 'top',
  },
  {
    title: 'La vue 3D',
    body: 'Le modèle occupe le centre, comme dans F3D. Clic gauche : tourner. Clic droit ou molette appuyée : déplacer. Molette : zoomer. Double-clic : recadrer.',
    target: '#viewport',
    placement: 'left',
    revealWorkspace: true,
  },
  {
    title: 'Le fichier en cours',
    body: 'Le nom, le chemin, le poids, le nombre de triangles, les dimensions et l’outil qui a créé le fichier s’affichent ici. Un bandeau coloré apparaît si une décision existe déjà.',
    target: '#fileName',
    placement: 'bottom',
    revealWorkspace: true,
  },
  {
    title: 'Retrouver le fichier',
    body: '« Voir dans le dossier » ouvre l’emplacement réel du GLB dans l’explorateur. Pratique quand un asset doit être comparé à ses voisins.',
    target: '#showFile',
    placement: 'bottom',
    revealWorkspace: true,
  },
  {
    title: 'Recadrer, grille, fil de fer',
    body: 'Recadrer replace la caméra. Grille montre le sol de référence. Fil de fer enlève les surfaces pour juger la forme. Les raccourcis sont R, L et W.',
    target: '.viewtools',
    placement: 'bottom',
    revealWorkspace: true,
  },
  {
    title: 'La liste',
    body: 'Tous les fichiers du dossier sont ici, sans charger les modèles. Le point de couleur rappelle la décision. Cliquez un nom pour l’afficher. Le bouton Liste masque ce panneau.',
    target: '#sidebar',
    placement: 'right',
    revealWorkspace: true,
    expandSidebar: true,
  },
  {
    title: 'Filtrer par nom',
    body: 'La recherche porte sur le nom et sur le chemin. Elle ne change aucun vote : elle réduit seulement ce que vous voyez.',
    target: '#search',
    placement: 'bottom',
    revealWorkspace: true,
    expandSidebar: true,
  },
  {
    title: 'Les cinq filtres',
    body: 'À voter cache ce qui a déjà une décision : c’est la file de travail. Les trois filtres suivants ne montrent qu’une décision. Tous affiche l’inventaire complet.',
    target: '#filters',
    placement: 'bottom',
    revealWorkspace: true,
    expandSidebar: true,
  },
  {
    title: 'On garde',
    body: 'L’asset reste dans la bibliothèque. Le vote est enregistré, puis le fichier suivant s’affiche. Touche G, ou 1 sur le pavé numérique.',
    target: '#garder',
    placement: 'top',
    revealWorkspace: true,
  },
  {
    title: 'On étudie',
    body: 'Vous n’êtes pas encore sûr. Le fichier part dans la feuille « On étudie » pour une seconde lecture. Touche E, ou 2 sur le pavé numérique.',
    target: '#etudier',
    placement: 'top',
    revealWorkspace: true,
  },
  {
    title: 'On supprime',
    body: 'C’est une marque, pas une suppression. Le GLB reste sur le disque. La feuille Excel « On supprime » servira plus tard à faire le tri. Touche S, Suppr, ou 3 sur le pavé numérique.',
    target: '#supprimer',
    placement: 'top',
    revealWorkspace: true,
  },
  {
    title: 'Avancer sans voter',
    body: 'Précédent et Suivant, ou les flèches du clavier, changent de fichier sans écrire de décision. Ctrl+Z annule le dernier vote et revient dessus.',
    target: '#prev',
    placement: 'top',
    revealWorkspace: true,
  },
  {
    title: 'Où vous en êtes',
    body: 'Le compteur et la barre indiquent combien de fichiers restent à voter, combien sont gardés, à étudier ou marqués pour suppression.',
    target: '#progress',
    placement: 'top',
    revealWorkspace: true,
  },
  {
    title: 'Le classeur Excel',
    body: 'Chaque vote réécrit revue-assets.xlsx dans le dossier caché .gf-revue. Les feuilles séparent On garde, On étudie, On supprime, plus un résumé et la liste complète.',
    target: '#openExcel',
    placement: 'bottom',
  },
  {
    title: 'Actualiser',
    body: 'Si vous ajoutez ou retirez des fichiers pendant la revue, Actualiser relit le dossier. Les votes déjà donnés sont conservés grâce à leur chemin.',
    target: '#refresh',
    placement: 'bottom',
  },
  {
    title: 'Reprendre plus tard',
    body: 'La session est sauvée au fur et à mesure. En rouvrant le même dossier, le filtre « À voter » reprend au premier fichier sans décision. Cette phrase rappelle que les modèles ne sont pas touchés.',
    target: '#safetyNote',
    placement: 'top',
    revealWorkspace: true,
  },
  {
    title: 'L’aide',
    body: 'Aide rappelle les raccourcis. Vous pouvez relancer ce tutoriel depuis cette fenêtre, avec le bouton « Revoir le tutoriel ».',
    target: '#helpBtn',
    placement: 'bottom',
  },
  {
    title: 'La revue peut commencer',
    body: 'Choisissez le dossier, regardez le modèle, puis votez. Le suivant arrive tout de suite. Bonne revue.',
    placement: 'center',
  },
]

let open = false
let index = 0
let onLayout: () => void = () => {}
let sidebarWasCollapsed = false

const tour = () => document.getElementById('tour') as HTMLDivElement
const hole = () => document.getElementById('tourHole') as HTMLDivElement
const card = () => document.getElementById('tourCard') as HTMLDivElement

export function isTourOpen() {
  return open
}

export function configureTour(options: { onLayout: () => void }) {
  onLayout = options.onLayout
}

export function maybeStartTour() {
  if (localStorage.getItem(STORAGE_KEY) === 'done') return
  startTour()
}

export function startTour() {
  const app = document.getElementById('app')
  sidebarWasCollapsed = Boolean(app?.classList.contains('sidebar-collapsed'))
  index = 0
  open = true
  tour().hidden = false
  render()
}

function finish(markDone: boolean) {
  open = false
  tour().hidden = true
  const app = document.getElementById('app')
  app?.classList.remove('tour-force-workspace')
  if (sidebarWasCollapsed) app?.classList.add('sidebar-collapsed')
  if (markDone) localStorage.setItem(STORAGE_KEY, 'done')
  onLayout()
}

function visibleTarget(selector: string | undefined) {
  if (!selector) return null
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null
  return element
}

function render() {
  const step = STEPS[index]
  const app = document.getElementById('app')
  if (step.expandSidebar) app?.classList.remove('sidebar-collapsed')
  app?.classList.toggle('tour-force-workspace', Boolean(step.revealWorkspace))
  onLayout()

  const kicker = document.getElementById('tourKicker')
  const title = document.getElementById('tourTitle')
  const body = document.getElementById('tourBody')
  const next = document.getElementById('tourNext')
  const back = document.getElementById('tourBack') as HTMLButtonElement
  if (kicker) kicker.textContent = `Étape ${index + 1} sur ${STEPS.length}`
  if (title) title.textContent = step.title
  if (body) body.textContent = step.body
  if (next) next.textContent = index === STEPS.length - 1 ? 'Commencer' : 'Suivant'
  if (back) back.disabled = index === 0

  requestAnimationFrame(() => {
    onLayout()
    place(step)
  })
}

function place(step: TourStep) {
  const target = visibleTarget(step.target) ?? visibleTarget(step.fallback)
  const panel = card()
  if (!target || step.placement === 'center') {
    hole().classList.add('is-hidden')
    panel.style.left = '50%'
    panel.style.top = '50%'
    panel.style.transform = 'translate(-50%, -50%)'
    return
  }

  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  const rect = target.getBoundingClientRect()
  const pad = 8
  const spot = hole()
  spot.classList.remove('is-hidden')
  spot.style.left = `${Math.max(4, rect.left - pad)}px`
  spot.style.top = `${Math.max(4, rect.top - pad)}px`
  spot.style.width = `${rect.width + pad * 2}px`
  spot.style.height = `${rect.height + pad * 2}px`

  panel.style.transform = 'none'
  const width = panel.offsetWidth
  const height = panel.offsetHeight
  const gap = 16
  let left = rect.left
  let top = rect.bottom + gap
  if (step.placement === 'top') top = rect.top - height - gap
  if (step.placement === 'left') {
    left = rect.left - width - gap
    top = rect.top
  }
  if (step.placement === 'right') {
    left = rect.right + gap
    top = rect.top
  }
  if (step.placement === 'bottom' && top + height > window.innerHeight - 12) top = rect.top - height - gap
  if (step.placement === 'top' && top < 12) top = rect.bottom + gap
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12))
  top = Math.max(12, Math.min(top, window.innerHeight - height - 12))
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
}

function move(delta: number) {
  index = Math.min(STEPS.length - 1, Math.max(0, index + delta))
  render()
}

window.addEventListener('keydown', (event) => {
  if (!open || event.repeat) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (index === STEPS.length - 1) finish(true)
    else move(1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    move(-1)
  }
})

document.getElementById('tourNext')?.addEventListener('click', () => {
  if (index === STEPS.length - 1) finish(true)
  else move(1)
})
document.getElementById('tourBack')?.addEventListener('click', () => move(-1))
document.getElementById('tourSkip')?.addEventListener('click', () => finish(true))
window.addEventListener('resize', () => {
  if (open) place(STEPS[index])
})
