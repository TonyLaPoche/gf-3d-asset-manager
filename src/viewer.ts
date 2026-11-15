import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { ModelStats } from './types'

interface GltfPayload {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
  parser: { json?: { asset?: { generator?: string } } }
}

export class Viewer {
  private readonly canvas: HTMLCanvasElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly loader: GLTFLoader
  private readonly clock = new THREE.Clock()
  private readonly gizmoScene = new THREE.Scene()
  private readonly gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10)
  private readonly envMap: THREE.Texture

  private pivot: THREE.Group | null = null
  private assetRoot: THREE.Object3D | null = null
  private grid: THREE.GridHelper | null = null
  private shadow: THREE.Mesh | null = null
  private mixer: THREE.AnimationMixer | null = null
  private playing = true
  private wireframe = false
  private gridVisible = true
  private token = 0
  private dirty = true
  private width = 1
  private height = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.setClearColor(0x2c2c2c, 1)

    this.scene.background = new THREE.Color(0x2c2c2c)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.envMap = pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.envMap
    pmrem.dispose()
    this.disposeHierarchy(room)

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 0.28))
    const sun = new THREE.DirectionalLight(0xffffff, 0.55)
    sun.position.set(4, 8, 6)
    this.scene.add(sun)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
    this.camera.position.set(2.2, 1.2, 2.2)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = false
    this.controls.zoomToCursor = true
    this.controls.screenSpacePanning = true
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    }
    this.controls.addEventListener('change', () => this.invalidate())

    const draco = new DRACOLoader()
    draco.setDecoderPath(new URL('draco/gltf/', window.location.href).toString())
    this.loader = new GLTFLoader()
    this.loader.setDRACOLoader(draco)
    this.loader.setMeshoptDecoder(MeshoptDecoder)

    this.buildGizmo()
    const parent = canvas.parentElement
    if (parent) new ResizeObserver(() => this.resize()).observe(parent)
    this.resize()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  invalidate() {
    this.dirty = true
  }

  resetCamera() {
    if (this.assetRoot) this.frameObject(this.assetRoot)
    this.invalidate()
  }

  setGridVisible(visible: boolean) {
    this.gridVisible = visible
    if (this.grid) this.grid.visible = visible
    if (this.shadow) this.shadow.visible = visible
    this.invalidate()
  }

  setWireframe(enabled: boolean) {
    this.wireframe = enabled
    this.applyWireframe()
    this.invalidate()
  }

  togglePlayback() {
    if (!this.mixer) return null
    this.playing = !this.playing
    this.invalidate()
    return this.playing
  }

  clear() {
    this.token += 1
    this.clearModel()
    this.invalidate()
  }

  async load(url: string, onProgress: (ratio: number | null) => void): Promise<ModelStats | null> {
    const token = ++this.token
    this.clearModel()
    this.invalidate()
    onProgress(null)

    const gltf = await new Promise<GltfPayload>((resolve, reject) => {
      this.loader.load(
        url,
        (result) => resolve(result as unknown as GltfPayload),
        (event) => {
          if (token !== this.token) return
          if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
          else onProgress(null)
        },
        (error) => reject(error),
      )
    })

    if (token !== this.token) {
      this.disposeHierarchy(gltf.scene)
      return null
    }

    return this.attach(gltf)
  }

  private attach(gltf: GltfPayload): ModelStats {
    const root = gltf.scene
    const stats = this.inspect(root, gltf)
    this.assetRoot = root
    this.applyWireframe()

    const framed = this.frameObject(root)
    const pivot = new THREE.Group()
    pivot.add(root)

    const footprint = Math.max(framed.size.x, framed.size.z, framed.radius * 0.5, 0.2)
    const gridSize = Math.max(framed.radius * 6, footprint * 2, 2)
    const grid = new THREE.GridHelper(gridSize, 20, 0x6e6e6e, 0x3d3d3d)
    grid.position.set(framed.center.x, framed.box.min.y, framed.center.z)
    grid.visible = this.gridVisible
    pivot.add(grid)

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMaterial())
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(framed.center.x, framed.box.min.y + framed.radius * 0.001, framed.center.z)
    shadow.scale.set(Math.max(framed.size.x, framed.radius) * 1.35, Math.max(framed.size.z, framed.radius) * 1.35, 1)
    shadow.visible = this.gridVisible
    pivot.add(shadow)

    this.grid = grid
    this.shadow = shadow
    this.pivot = pivot
    this.scene.add(pivot)

    if (gltf.animations.length) {
      this.mixer = new THREE.AnimationMixer(root)
      gltf.animations.forEach((clip) => this.mixer?.clipAction(clip).play())
      this.playing = true
    }

    this.invalidate()
    return stats
  }

  private inspect(root: THREE.Object3D, gltf: GltfPayload): ModelStats {
    let triangles = 0
    let vertices = 0
    let meshes = 0
    const materials = new Set<THREE.Material>()
    root.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      meshes += 1
      const geometry = mesh.geometry
      const position = geometry.getAttribute('position')
      if (position) vertices += position.count
      if (geometry.index) triangles += geometry.index.count / 3
      else if (position) triangles += position.count / 3
      const material = mesh.material
      const list = Array.isArray(material) ? material : [material]
      list.forEach((item) => {
        if (item) materials.add(item)
      })
    })

    const box = new THREE.Box3().setFromObject(root)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const radius = sphere?.radius ?? 0
    const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3())
    const warnings: string[] = []
    if (meshes === 0) warnings.push('Aucun maillage')
    if (meshes > 0 && triangles === 0) warnings.push('Aucun triangle')
    if (radius > 10_000) warnings.push('Échelle très grande')
    if (radius > 0 && radius < 0.001) warnings.push('Échelle très petite')

    return {
      triangles: Math.round(triangles),
      vertices,
      meshes,
      materials: materials.size,
      animations: gltf.animations.length,
      generator: gltf.parser.json?.asset?.generator?.trim() || '',
      dimensions: box.isEmpty() ? '—' : `${this.fmt(size.x)} × ${this.fmt(size.y)} × ${this.fmt(size.z)} m`,
      warnings,
    }
  }

  private frameObject(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object)
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
    const sphere = box.isEmpty() ? null : box.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere?.radius ?? 1, 1e-4)
    const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3())
    const fov = (this.camera.fov * Math.PI) / 180
    const distance = (radius / Math.sin(fov / 2)) * 1.28
    const direction = new THREE.Vector3(1, 0.42, 1).normalize()
    this.camera.near = Math.max(radius / 250, 1e-4)
    this.camera.far = distance + radius * 40
    this.camera.position.copy(center).addScaledVector(direction, distance)
    this.camera.updateProjectionMatrix()
    this.controls.target.copy(center)
    this.controls.update()
    if (box.isEmpty()) box.setFromCenterAndSize(center, new THREE.Vector3(1, 1, 1))
    return { box, center, radius, size }
  }

  private applyWireframe() {
    this.assetRoot?.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      list.forEach((material) => {
        if (material && 'wireframe' in material) {
          ;(material as THREE.MeshStandardMaterial).wireframe = this.wireframe
        }
      })
    })
  }

  private clearModel() {
    this.mixer?.stopAllAction()
    this.mixer = null
    this.assetRoot = null
    this.grid = null
    this.shadow = null
    if (!this.pivot) return
    this.scene.remove(this.pivot)
    this.disposeHierarchy(this.pivot)
    this.pivot = null
  }

  private disposeHierarchy(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    root.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry) geometries.add(mesh.geometry)
      const material = mesh.material
      if (!material) return
      const list = Array.isArray(material) ? material : [material]
      list.forEach((item) => materials.add(item))
    })
    materials.forEach((material) => {
      Object.values(material).forEach((value: unknown) => {
        if (value instanceof THREE.Texture && value !== this.envMap) value.dispose()
      })
      material.dispose()
    })
    geometries.forEach((geometry) => geometry.dispose())
  }

  private shadowMaterial() {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64)
      gradient.addColorStop(0, 'rgba(0,0,0,0.38)')
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, 128, 128)
    }
    const texture = new THREE.CanvasTexture(canvas)
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  }

  private buildGizmo() {
    const backdrop = document.createElement('canvas')
    backdrop.width = 128
    backdrop.height = 128
    const context = backdrop.getContext('2d')
    if (context) {
      context.fillStyle = 'rgba(16,16,16,0.62)'
      context.beginPath()
      context.arc(64, 64, 58, 0, Math.PI * 2)
      context.fill()
    }
    const disc = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(backdrop), depthTest: false, transparent: true }),
    )
    disc.scale.set(2.5, 2.5, 1)
    this.gizmoScene.add(disc)
    const axes = new THREE.AxesHelper(0.85)
    axes.renderOrder = 2
    this.gizmoScene.add(axes)
    this.gizmoScene.add(this.axisLabel('X', '#e25b4a', new THREE.Vector3(1.15, 0, 0)))
    this.gizmoScene.add(this.axisLabel('Y', '#67b85a', new THREE.Vector3(0, 1.15, 0)))
    this.gizmoScene.add(this.axisLabel('Z', '#4c8fe0', new THREE.Vector3(0, 0, 1.15)))
  }

  private axisLabel(text: string, color: string, position: THREE.Vector3) {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = color
      context.font = 'bold 42px sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(text, 32, 34)
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }),
    )
    sprite.position.copy(position)
    sprite.scale.set(0.42, 0.42, 1)
    sprite.renderOrder = 3
    return sprite
  }

  resize() {
    const parent = this.canvas.parentElement
    if (!parent) return
    const width = Math.max(1, parent.clientWidth)
    const height = Math.max(1, parent.clientHeight)
    this.width = width
    this.height = height
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.setSize(width, height, false)
    this.invalidate()
  }

  private frame() {
    const delta = this.clock.getDelta()
    if (this.playing && this.mixer) {
      this.mixer.update(delta)
      this.dirty = true
    }
    if (!this.dirty) return
    this.dirty = false
    this.controls.update()
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, this.width, this.height)
    this.renderer.autoClear = true
    this.renderer.render(this.scene, this.camera)
    this.renderGizmo()
  }

  private renderGizmo() {
    const size = 112
    if (this.width < 240 || this.height < 240) return
    const direction = new THREE.Vector3()
    this.camera.getWorldDirection(direction)
    this.gizmoCamera.position.copy(direction).multiplyScalar(-2.5)
    this.gizmoCamera.up.copy(this.camera.up)
    this.gizmoCamera.lookAt(0, 0, 0)
    this.renderer.autoClear = false
    this.renderer.clearDepth()
    this.renderer.setScissorTest(true)
    this.renderer.setViewport(16, 16, size, size)
    this.renderer.setScissor(16, 16, size, size)
    this.renderer.render(this.gizmoScene, this.gizmoCamera)
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, this.width, this.height)
  }

  private fmt(value: number) {
    if (!Number.isFinite(value)) return '—'
    if (Math.abs(value) >= 100) return value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
    if (Math.abs(value) >= 10) return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
    return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
  }
}
