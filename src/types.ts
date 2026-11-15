export type VoteStatus = 'garder' | 'etudier' | 'supprimer'
export type FilterMode = 'pending' | VoteStatus | 'all'

export interface Asset {
  name: string
  rel: string
  abs: string
  size: number
}

export interface VoteRecord {
  status: VoteStatus
  at: string
}

export interface ModelStats {
  triangles: number
  vertices: number
  meshes: number
  materials: number
  animations: number
  generator: string
  dimensions: string
  warnings: string[]
}

export interface ExcelStatus {
  ok?: boolean
  jsonPath?: string
  xlsxPath?: string
  mainXlsxPath?: string
  warning?: string | null
  createdAt?: string
}

export interface ScanResult {
  assets: Asset[]
  warnings: string[]
}

export interface SessionFile {
  version: number
  votes: Record<string, VoteRecord>
  createdAt: string | null
  warning?: string
}

export interface RevueApi {
  bootstrap: () => Promise<{ lastFolder: string | null; argFolder: string | null }>
  pickFolder: () => Promise<string | null>
  inspectPath: (filePath: string) => Promise<{ isDir: boolean; parent: string; base: string }>
  scan: (folder: string) => Promise<ScanResult>
  onScanProgress: (callback: (count: number) => void) => () => void
  loadSession: (folder: string) => Promise<SessionFile>
  saveSession: (folder: string, votes: Record<string, VoteRecord>) => Promise<{ accepted: boolean }>
  onExcelStatus: (callback: (status: ExcelStatus) => void) => () => void
  openPath: (filePath: string) => Promise<string | null>
  showInFolder: (filePath: string) => Promise<void>
  setTitle: (title: string) => Promise<void>
  assetUrl: (absPath: string) => string
  pathForFile: (file: File) => string
}

declare global {
  interface Window {
    revue?: RevueApi
  }
}
