import * as THREE from 'three'

export type BlockId = 'air' | 'grass' | 'dirt' | 'stone' | 'alloy' | 'crystal'

const BLOCK_COLORS: Record<Exclude<BlockId, 'air'>, number> = {
  grass: 0x3d8b5a,
  dirt: 0x6b4f2a,
  stone: 0x6a7278,
  alloy: 0x3dd6c6,
  crystal: 0x7ee787,
}

export class VoxelWorld {
  readonly size: number
  readonly height: number
  private blocks: Uint8Array
  private idMap: BlockId[] = ['air', 'grass', 'dirt', 'stone', 'alloy', 'crystal']

  constructor(size = 32, height = 24) {
    this.size = size
    this.height = height
    this.blocks = new Uint8Array(size * height * size)
    this.generateTerrain()
  }

  private index(x: number, y: number, z: number) {
    return y * this.size * this.size + z * this.size + x
  }

  inBounds(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.size && y < this.height && z < this.size
  }

  get(x: number, y: number, z: number): BlockId {
    if (!this.inBounds(x, y, z)) return 'air'
    return this.idMap[this.blocks[this.index(x, y, z)]] || 'air'
  }

  set(x: number, y: number, z: number, id: BlockId) {
    if (!this.inBounds(x, y, z)) return
    const idx = this.idMap.indexOf(id)
    if (idx < 0) return
    this.blocks[this.index(x, y, z)] = idx
  }

  private noise2(x: number, z: number, seed: number) {
    const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.001) * 43758.5453
    return n - Math.floor(n)
  }

  generateTerrain(seed = 42) {
    this.blocks.fill(0)
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const h =
          4 +
          Math.floor(this.noise2(x, z, seed) * 6) +
          Math.floor(this.noise2(x * 0.3, z * 0.3, seed + 9) * 4)
        for (let y = 0; y <= h && y < this.height; y++) {
          if (y === h) this.set(x, y, z, 'grass')
          else if (y > h - 3) this.set(x, y, z, 'dirt')
          else this.set(x, y, z, 'stone')
        }
        if (this.noise2(x + 2, z + 5, seed) > 0.92 && h + 1 < this.height) {
          this.set(x, h + 1, z, 'crystal')
        }
      }
    }
  }

  buildMesh(): THREE.Mesh {
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const faces = [
      { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
      { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
      { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
      { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
      { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    ]

    let vertex = 0
    for (let y = 0; y < this.height; y++) {
      for (let z = 0; z < this.size; z++) {
        for (let x = 0; x < this.size; x++) {
          const id = this.get(x, y, z)
          if (id === 'air') continue
          const color = new THREE.Color(BLOCK_COLORS[id])
          for (const face of faces) {
            const [dx, dy, dz] = face.dir
            const neighbor = this.get(x + dx, y + dy, z + dz)
            if (neighbor !== 'air') continue
            for (const c of face.corners) {
              positions.push(x + c[0], y + c[1], z + c[2])
              normals.push(dx, dy, dz)
              colors.push(color.r, color.g, color.b)
            }
            indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
            vertex += 4
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeBoundingSphere()

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = false
    mesh.receiveShadow = true
    return mesh
  }
}

export class GameEngine {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly world: VoxelWorld
  private worldMesh: THREE.Mesh | null = null
  private keys = new Set<string>()
  private yaw = 0
  private pitch = -0.25
  private velocityY = 0
  private onGround = false
  private pointerLocked = false
  private raf = 0
  private last = 0
  private container: HTMLElement
  private syncTimer = 0
  onPosition?: (pos: { x: number; y: number; z: number; yaw: number; pitch: number }) => void

  constructor(container: HTMLElement, seed = 42) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0a1a22)
    this.scene.fog = new THREE.Fog(0x0a1a22, 28, 70)

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200)
    this.camera.position.set(16, 18, 28)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    const hemi = new THREE.HemisphereLight(0xb8fff4, 0x1a2a30, 0.85)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff2d1, 0.9)
    sun.position.set(40, 60, 20)
    this.scene.add(sun)

    const grid = new THREE.GridHelper(64, 64, 0x1e4a52, 0x123038)
    grid.position.set(16, 0.01, 16)
    this.scene.add(grid)

    this.world = new VoxelWorld(32, 24)
    this.world.generateTerrain(seed)
    this.rebuildWorld()

    this.bindEvents()
    this.resize()
  }

  rebuildWorld() {
    if (this.worldMesh) {
      this.scene.remove(this.worldMesh)
      this.worldMesh.geometry.dispose()
      ;(this.worldMesh.material as THREE.Material).dispose()
    }
    this.worldMesh = this.world.buildMesh()
    this.scene.add(this.worldMesh)
  }

  private bindEvents() {
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.renderer.domElement.addEventListener('click', this.requestLock)
    document.addEventListener('pointerlockchange', this.onLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
  }

  private requestLock = () => {
    this.renderer.domElement.requestPointerLock()
  }

  private onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return
    this.yaw -= e.movementX * 0.0022
    this.pitch -= e.movementY * 0.0022
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch))
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code)
    if (e.code === 'KeyE') {
      this.tryPlace('alloy')
    }
    if (e.code === 'KeyQ') {
      this.tryBreak()
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private lookDir() {
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    )
    return dir.normalize()
  }

  private raycastBlock(maxDist = 6) {
    const origin = this.camera.position.clone()
    const dir = this.lookDir()
    let lastAir: { x: number; y: number; z: number } | null = null
    for (let t = 0; t <= maxDist; t += 0.1) {
      const p = origin.clone().addScaledVector(dir, t)
      const x = Math.floor(p.x)
      const y = Math.floor(p.y)
      const z = Math.floor(p.z)
      if (!this.world.inBounds(x, y, z)) continue
      if (this.world.get(x, y, z) === 'air') {
        lastAir = { x, y, z }
      } else {
        return { hit: { x, y, z }, place: lastAir }
      }
    }
    return null
  }

  private tryBreak() {
    const hit = this.raycastBlock()
    if (!hit) return
    this.world.set(hit.hit.x, hit.hit.y, hit.hit.z, 'air')
    this.rebuildWorld()
  }

  private tryPlace(id: BlockId) {
    const hit = this.raycastBlock()
    if (!hit?.place) return
    const { x, y, z } = hit.place
    if (this.world.get(x, y, z) !== 'air') return
    this.world.set(x, y, z, id)
    this.rebuildWorld()
  }

  private solidAt(x: number, y: number, z: number) {
    return this.world.get(Math.floor(x), Math.floor(y), Math.floor(z)) !== 'air'
  }

  private update(dt: number) {
    const speed = this.keys.has('ShiftLeft') ? 10 : 5
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const move = new THREE.Vector3()
    if (this.keys.has('KeyW')) move.add(forward)
    if (this.keys.has('KeyS')) move.sub(forward)
    if (this.keys.has('KeyD')) move.add(right)
    if (this.keys.has('KeyA')) move.sub(right)
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt)
      const next = this.camera.position.clone().add(move)
      if (!this.solidAt(next.x, this.camera.position.y - 1.4, this.camera.position.z)) {
        this.camera.position.x = next.x
      }
      if (!this.solidAt(this.camera.position.x, this.camera.position.y - 1.4, next.z)) {
        this.camera.position.z = next.z
      }
    }

    if (this.keys.has('Space') && this.onGround) {
      this.velocityY = 7.5
      this.onGround = false
    }

    this.velocityY -= 18 * dt
    const nextY = this.camera.position.y + this.velocityY * dt
    const feetY = nextY - 1.6
    if (this.solidAt(this.camera.position.x, feetY, this.camera.position.z) && this.velocityY <= 0) {
      this.camera.position.y = Math.floor(feetY) + 1 + 1.6
      this.velocityY = 0
      this.onGround = true
    } else {
      this.camera.position.y = nextY
      this.onGround = false
    }

    const look = this.lookDir()
    this.camera.lookAt(this.camera.position.clone().add(look))

    this.syncTimer += dt
    if (this.syncTimer > 2 && this.onPosition) {
      this.syncTimer = 0
      this.onPosition({
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
        yaw: this.yaw,
        pitch: this.pitch,
      })
    }
  }

  setSpawn(x: number, y: number, z: number, yaw = 0, pitch = -0.2) {
    this.camera.position.set(x, y, z)
    this.yaw = yaw
    this.pitch = pitch
  }

  start() {
    this.last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.update(dt)
      this.renderer.render(this.scene, this.camera)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  resize = () => {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
    }
  }
}
