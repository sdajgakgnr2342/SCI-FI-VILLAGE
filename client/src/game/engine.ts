import * as THREE from 'three'
import { FirstPersonBody } from './playerBody'
import {
  addMaterial,
  trySpend,
  SHAPE_COST,
  MATERIAL_LABEL,
  type BuildShape,
  type InventoryCounts,
  type MaterialId,
  type ToolId,
} from './inventory'
import {
  ACTION_DURATION,
  actionLabel,
  mineDurationForSize,
  CrackOverlay,
  DebrisParticles,
  NotchOverlay,
  type HarvestKind,
} from './harvestFx'
import type { GameAudio } from './gameAudio'
import {
  pixelRatioForQuality,
  type PlaySettings,
  type QualityPreset,
} from './playSettings'
import { SquadMarkVisuals, type SquadMark } from './squadMark'
import { sampleDayNight } from './dayNight'
import { buildDeployWarmTasks, type DeployWarmTask } from './deployPreload'
import {
  type BlockId,
  type ChunkLod,
  type ChunkMeshes,
  type MinimapKind,
  BLOCK_HARVEST,
  BLOCK_LABEL,
  BLOCK_FACES,
  CHUNK_SIZE,
  CROUCH_EYE_LERP,
  DEPLOY_DURATION_SEC,
  DEPLOY_PAD_HALF,
  DEPLOY_PAD_HEIGHT,
  DEPLOY_STREAM_RADIUS,
  DEPLOY_WALL_H,
  FEATURE_HEADROOM,
  InfiniteTerrain,
  LOAD_RADIUS,
  MATERIAL_BLOCK,
  PLAYER_EYE,
  PLAYER_EYE_CROUCH,
  PLAYER_HALF_W,
  PLAYER_HEIGHT,
  PLAYER_HEIGHT_CROUCH,
  PRELOAD_RADIUS,
  REACH_DISTANCE,
  SURFACE_Y,
  UNLOAD_RADIUS,
  WOOD_TRUNK_R,
  buildChunkGroundProxy,
  buildChunkMeshes,
  chunkKey,
  chunkLodFromDist,
  disposeChunkMeshes,
  meshesFromChunkBuffers,
  pushLeafCluster,
  pushStylizedRock,
  pushStylizedShrub,
  pushWoodCylinder,
} from './chunkMeshApi'

export type { BlockId, MinimapKind } from './chunkMeshApi'
export {
  BLOCK_DISPLAY_LABEL,
  InfiniteTerrain,
  MATERIAL_BLOCK,
  PREVIEW_BLOCK_IDS,
  SURFACE_Y,
  buildChunkMeshes,
} from './chunkMeshApi'

class CreekFlowParticles {
  readonly points: THREE.Points
  private readonly data: { x: number; offset: number; speed: number; phase: number }[] = []
  private readonly positions: Float32Array
  private readonly count: number
  private time = 0

  constructor(world: InfiniteTerrain, count = 72) {
    this.count = count
    this.positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      this.data.push({
        x: (i / count) * 40 - 20,
        offset: (Math.random() - 0.5) * 2.4,
        speed: 0.55 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
      })
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0x88ccff,
      size: 0.045,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
    // 初始沿小溪铺开
    const span = 28
    const px = 0
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i]
      d.x = px - span * 0.5 + (i / this.count) * span + (Math.random() - 0.5) * 0.8
      const cz = world.creekCenterZ(d.x)
      const tangZ = world.creekCenterZ(d.x + 0.35) - cz
      const len = Math.hypot(0.35, tangZ) || 1
      const rx = -tangZ / len
      const rz = 0.35 / len
      this.positions[i * 3] = d.x + rx * d.offset
      this.positions[i * 3 + 1] = world.surfaceHeight(d.x, cz + rz * d.offset) + 0.05
      this.positions[i * 3 + 2] = cz + rz * d.offset
    }
  }

  update(dt: number, world: InfiniteTerrain, px: number, pz: number) {
    const dist = Math.abs(pz - world.creekCenterZ(px))
    if (dist > 22) {
      this.points.visible = false
      return
    }
    this.time += dt
    const span = 28
    const half = span * 0.5
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i]
      d.x += dt * d.speed * 0.85
      if (d.x > px + half) d.x -= span
      if (d.x < px - half) d.x += span
      const cz = world.creekCenterZ(d.x)
      const tangZ = world.creekCenterZ(d.x + 0.4) - cz
      const len = Math.hypot(0.4, tangZ) || 1
      // 水平右法线（相对流向 +X 切线）
      const rx = -tangZ / len
      const rz = 0.4 / len
      const wobble = Math.sin(this.time * 1.6 + d.phase) * 0.04
      const off = d.offset + wobble
      this.positions[i * 3] = d.x + rx * off
      this.positions[i * 3 + 1] =
        world.surfaceHeight(d.x, cz + rz * off) + 0.048 + Math.sin(this.time * 2.2 + d.phase) * 0.01
      this.positions[i * 3 + 2] = cz + rz * off
    }
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    // 远离小溪时略隐藏
    const mat = this.points.material as THREE.PointsMaterial
    mat.opacity = dist > 18 ? 0 : 0.45 * Math.max(0, 1 - dist / 18)
    this.points.visible = dist < 22
  }

  dispose() {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
  }
}

/** 太阳 + 白云（建模预览可单独取） */
export function createSkyCloud() {
  const g = new THREE.Group()
  // Basic：不吃光照，从下看也不发灰；略透，像天光里的白云
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf4f8ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: true,
  })
  const parts = [
    [0, 0, 0, 3.2],
    [2.2, 0.2, 0.4, 2.4],
    [-2.4, 0.1, -0.3, 2.6],
    [0.6, 0.8, -0.2, 2.1],
    [-0.8, 0.6, 0.5, 1.8],
  ] as const
  for (const [x, y, z, r] of parts) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat)
    m.position.set(x, y, z)
    m.scale.set(1.4, 0.55, 1)
    m.renderOrder = -1
    g.add(m)
  }
  return g
}

export function createSkySun() {
  const g = new THREE.Group()
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff1a8 })
  )
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(7, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.25 })
  )
  g.add(sun, glow)
  return g
}

/** 太阳 + 白云 */
class SkyDecor {
  readonly group = new THREE.Group()
  private clouds: THREE.Group[] = []
  private sunMesh: THREE.Mesh
  private sunGlow: THREE.Mesh
  private t = 0
  private readonly daySun = new THREE.Color(0xfff1a8)
  private readonly nightSun = new THREE.Color(0xc8d4ee)
  private readonly dayGlow = new THREE.Color(0xffe08a)
  private readonly nightGlow = new THREE.Color(0x9eb0d0)
  private readonly dayCloud = new THREE.Color(0xf4f8ff)
  private readonly nightCloud = new THREE.Color(0x8a9bb8)
  private readonly tmp = new THREE.Color()

  constructor() {
    // 太阳圆盘
    const sunGeo = new THREE.SphereGeometry(4.5, 16, 16)
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff1a8,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      fog: false,
    })
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat)
    this.sunMesh.position.set(40, 55, -30)
    this.group.add(this.sunMesh)

    this.sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(7, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        fog: false,
      })
    )
    this.sunGlow.position.copy(this.sunMesh.position)
    this.group.add(this.sunGlow)

    // 几朵白云（扁椭圆组合）
    for (let i = 0; i < 8; i++) {
      const cloud = this.makeCloud()
      cloud.position.set(
        (i - 4) * 22 + (i % 2) * 6,
        28 + (i % 3) * 4,
        -20 + (i % 4) * 14
      )
      cloud.userData.speed = 0.8 + (i % 3) * 0.35
      cloud.userData.baseX = cloud.position.x
      this.clouds.push(cloud)
      this.group.add(cloud)
    }
  }

  private makeCloud() {
    return createSkyCloud()
  }

  /** dayness: 0 夜 → 1 昼；只调可见外观，不加月亮/星星 */
  setDayness(dayness: number) {
    const d = Math.max(0, Math.min(1, dayness))
    const sunMat = this.sunMesh.material as THREE.MeshBasicMaterial
    sunMat.color.copy(this.nightSun).lerp(this.daySun, d)
    sunMat.opacity = 0.22 + 0.78 * d
    const glowMat = this.sunGlow.material as THREE.MeshBasicMaterial
    glowMat.color.copy(this.nightGlow).lerp(this.dayGlow, d)
    glowMat.opacity = 0.06 + 0.19 * d

    const cloudOpacity = 0.28 + 0.62 * d
    this.tmp.copy(this.nightCloud).lerp(this.dayCloud, d)
    for (const cloud of this.clouds) {
      cloud.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return
        const mat = obj.material as THREE.MeshBasicMaterial
        mat.color.copy(this.tmp)
        mat.opacity = cloudOpacity
      })
    }
  }

  update(dt: number, cam: THREE.Vector3) {
    this.t += dt
    // 太阳相对相机保持远距方位，形成「天空中的太阳」
    this.sunMesh.position.set(cam.x + 55, cam.y + 48, cam.z - 35)
    this.sunGlow.position.copy(this.sunMesh.position)

    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt
      // 绕玩家附近循环
      if (c.position.x > cam.x + 70) c.position.x = cam.x - 70
      c.position.z += Math.sin(this.t * 0.15 + c.position.x * 0.01) * 0.15 * dt
      // 高度跟玩家，避免走出雾外感觉丢失
      if (Math.abs(c.position.z - cam.z) > 80) {
        c.position.z = cam.z + (Math.random() - 0.5) * 50
      }
    }
  }

  getSunPosition() {
    return this.sunMesh.position
  }
}

export class GameEngine {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  readonly world: InfiniteTerrain
  private chunkGroup = new THREE.Group()
  private chunks = new Map<string, ChunkMeshes>()
  private rebuildQueue = new Set<string>()
  /** 待挂载新区块（分帧，避免走路换块一帧建完一圈） */
  private mountQueue: { cx: number; cz: number; lod: ChunkLod }[] = []
  private mountQueued = new Set<string>()
  private idleMountRic = 0
  private idleMountTo = 0
  private mountSortDirty = true
  /** Worker 建网格：主线程只挂结果 */
  private meshWorker: Worker | null = null
  private meshWorkerFailed = false
  private meshJobSeq = 0
  private inflightMesh = 0
  private pendingMeshJobs = new Map<
    number,
    { key: string; cx: number; cz: number; lod: ChunkLod; gen: number }
  >()
  /** chunk 代数：卸载/重建时递增，丢弃过期 Worker 结果 */
  private chunkGen = new Map<string, number>()
  private static readonly MAX_INFLIGHT_MESH = 4
  /** 本帧是否在明显移动（推迟 LOD 重建） */
  private movingThisFrame = false
  private selectFrame = 0
  /** 上次用于挂载排序的视线，转视角时重排队列 */
  private lookHintX = 0
  private lookHintZ = 1
  /** 流式加载锚点（准备舱期间对着落点刷图，不跟相机） */
  private streamFocusX = Number.NaN
  private streamFocusZ = Number.NaN
  /** 进服准备舱 */
  private deploy: {
    active: boolean
    group: THREE.Group
    padY: number
    cx: number
    cz: number
    dest: { x: number; y: number; z: number; yaw: number; pitch: number }
    remain: number
    duration: number
    /** 墙上时钟结束时刻（ms），读秒不跟帧卡顿/铺图进度挂钩 */
    endsAt: number
    /** 上次推 UI 的时刻，节流 onProgress */
    lastUiAt: number
    /** 上次强制复扫地图 */
    lastStreamAt: number
    /** 倒计时叮声：已播过的整秒 ceil(remain) */
    lastTickSec: number
    /** 投送后资源预热队列 */
    warmTasks: DeployWarmTask[]
    warmDone: number
    warmLabel: string
    onProgress?: (remain: number, timeProgress: number) => void
    onComplete?: () => void
  } | null = null
  private static readonly REBUILD_PER_FRAME = 1
  private static readonly MOUNT_PER_FRAME = 2
  private static readonly IDLE_MOUNT_MAX = 3
  /** 单帧建网格时间预算（ms），超出则本帧不再挂/重建 */
  private static readonly MESH_BUDGET_MS = 4
  /** 准备舱：每帧少挂、严控预算，优先保证读秒流畅 */
  private static readonly DEPLOY_MOUNT_PER_FRAME = 2
  private static readonly DEPLOY_MESH_BUDGET_MS = 5
  private static readonly DEPLOY_FORCE_MOUNT = 3
  /** 准备舱每帧最多跑几个预热任务 */
  private static readonly DEPLOY_WARM_PER_TICK = 1
  private keys = new Set<string>()
  private yaw = 0
  private pitch = -0.28
  /** 枪械开火后坐（叠加到 pitch/yaw，快速衰减） */
  private recoilPitch = 0
  private recoilYaw = 0
  private velocityY = 0
  private onGround = false
  private pointerLocked = false
  private raf = 0
  private last = 0
  private container: HTMLElement
  private syncTimer = 0
  private streamTimer = 0
  private moveForward = 0
  private moveStrafe = 0
  private jumpQueued = false
  /** 战斗：重伤禁跑 / 死亡锁输入 */
  combatSlow = false
  combatLocked = false
  onHarvestLoot: ((source: 'chop' | 'mine' | 'dig' | 'clear') => void) | null = null
  private sky: SkyDecor
  private sunLight: THREE.DirectionalLight
  private hemiLight: THREE.HemisphereLight
  private ambientLight: THREE.AmbientLight
  private readonly dayBg = new THREE.Color(0x87ceeb)
  private readonly nightBg = new THREE.Color(0x1c2a3d)
  private readonly dayFog = new THREE.Color(0xc5e3f5)
  private readonly nightFog = new THREE.Color(0x2a3a52)
  private readonly dayHemiSky = new THREE.Color(0xdff2ff)
  private readonly nightHemiSky = new THREE.Color(0x6a7fa0)
  private readonly dayHemiGround = new THREE.Color(0x8fbf6a)
  private readonly nightHemiGround = new THREE.Color(0x3a4a38)
  private readonly daySunColor = new THREE.Color(0xfff4e0)
  private readonly nightSunColor = new THREE.Color(0xa8b8d8)
  private readonly dayAmbient = new THREE.Color(0xffffff)
  private readonly nightAmbient = new THREE.Color(0xb8c8e0)
  private readonly bgColor = new THREE.Color()
  private lastChunkCX = Number.NaN
  private lastChunkCZ = Number.NaN
  /** 水平移动方向提示（预取挂载：前方优先） */
  private moveHintX = 0
  private moveHintZ = 1
  /** 高亮短时未命中计数（防微抖闪烁） */
  private selectionMissFrames = 0
  /** 切换目标需连续确认的帧数 */
  private pendingSelectKey = ''
  private pendingSelectFrames = 0
  private body: FirstPersonBody
  /** 触控视角平滑缓冲 */
  private lookBufX = 0
  private lookBufY = 0
  /** 准星对准的方块（有高亮才可挖/放） */
  private selected: {
    hit: { x: number; y: number; z: number }
    place: { x: number; y: number; z: number } | null
    face: { x: number; y: number; z: number }
  } | null = null
  /** 整块/整树颜色高亮（非描边框） */
  private selectionTint: THREE.Group
  private selectionTintMat: THREE.MeshBasicMaterial
  private selectionTintGeo: THREE.BoxGeometry
  private selectionTintMeshes: THREE.Mesh[] = []
  /** 非方块造型高亮（石/灌木/树等） */
  private selectionShapeMesh: THREE.Mesh | null = null
  private selectionKey = ''
  private ghostPreview: THREE.Group
  private ghostGeo: THREE.BoxGeometry
  private ghostMatOk: THREE.MeshBasicMaterial
  private ghostMatBad: THREE.MeshBasicMaterial
  private ghostMeshes: THREE.Mesh[] = []
  private readonly lookDirTmp = new THREE.Vector3()
  /** 仓库与建造状态（由 UI 注入） */
  inventory: InventoryCounts | null = null
  tool: ToolId = 'hand'
  buildMaterial: MaterialId = 'turf'
  buildShape: BuildShape = 'single'
  lastActionHint = ''
  /** UI：操作进度 0..1，剩余秒，按钮文案 */
  actionProgress = 0
  actionRemainSec = 0
  actionKind: HarvestKind | null = null
  targetActionLabel = '挖'
  /** 准星目标显示名（树木/石头/草地…） */
  targetName = ''
  crouching = false
  onInventoryChange?: () => void
  onActionUi?: () => void
  onPosition?: (pos: { x: number; y: number; z: number; yaw: number; pitch: number }) => void
  onFrame?: (dt: number) => void
  /** 本地地形改动：写入同服共享库 + 实时广播 */
  onBlocksChange?: (
    blocks: { x: number; y: number; z: number; blockId: BlockId }[]
  ) => void
  audio: GameAudio | null = null

  private eyeHeightTarget = PLAYER_EYE
  private bodyHeightTarget = PLAYER_HEIGHT
  private suppressingBlockNotify = false
  private antialiasEnabled = false
  private quality: QualityPreset = 'standard'
  private wasOnGround = true
  private airTime = 0
  private jumpStartY = 0
  private fallPeakSpeed = 0
  private actionSfxAcc = 0
  private activeAction: {
    kind: HarvestKind
    duration: number
    elapsed: number
    hits: number
    nextHitAt: number
    x: number
    y: number
    z: number
    face: { x: number; y: number; z: number }
    blockId: BlockId
  } | null = null
  private debris!: DebrisParticles
  private notch!: NotchOverlay
  private crack!: CrackOverlay
  private creekFlow!: CreekFlowParticles
  private eyeHeight = PLAYER_EYE
  private bodyHeight = PLAYER_HEIGHT
  private squadMarks = new SquadMarkVisuals()

  constructor(container: HTMLElement, seed = 42, graphics?: Partial<PlaySettings>) {
    this.container = container
    this.antialiasEnabled = Boolean(graphics?.antialias)
    this.quality = graphics?.quality || 'standard'

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog = new THREE.Fog(0xc5e3f5, 38, CHUNK_SIZE * LOAD_RADIUS + 8)

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.08, CHUNK_SIZE * LOAD_RADIUS + 24)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.set(0, SURFACE_Y + 1.7, 8)

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.antialiasEnabled,
      powerPreference: 'high-performance',
      alpha: false,
    })
    this.renderer.setClearColor(0x87ceeb, 1)
    this.renderer.setPixelRatio(pixelRatioForQuality(this.quality))
    this.renderer.domElement.style.touchAction = 'none'
    container.appendChild(this.renderer.domElement)

    this.hemiLight = new THREE.HemisphereLight(0xdff2ff, 0x8fbf6a, 0.9)
    this.scene.add(this.hemiLight)
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.2)
    this.sunLight.position.set(40, 60, -20)
    this.scene.add(this.sunLight)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.32)
    this.scene.add(this.ambientLight)

    this.sky = new SkyDecor()
    this.scene.add(this.sky.group)
    this.applyDayNight()

    this.world = new InfiniteTerrain(seed)
    this.scene.add(this.chunkGroup)
    this.scene.add(this.squadMarks.group)
    this.creekFlow = new CreekFlowParticles(this.world)
    this.scene.add(this.creekFlow.points)
    this.streamChunks(true)

    this.body = new FirstPersonBody()
    this.body.attach(this.camera)
    this.scene.add(this.camera)

    // 选中：半透明色块覆盖整格/整树（不做黑色描边框）
    this.selectionTintGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02)
    this.selectionTintMat = new THREE.MeshBasicMaterial({
      color: 0xfff0a8,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    this.selectionTint = new THREE.Group()
    this.selectionTint.visible = false
    this.selectionTint.renderOrder = 10
    this.scene.add(this.selectionTint)

    // 建造幽灵预览（空位半透明方块）
    this.ghostGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98)
    this.ghostMatOk = new THREE.MeshBasicMaterial({
      color: 0x7ee7a0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    })
    this.ghostMatBad = new THREE.MeshBasicMaterial({
      color: 0xff6b6b,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    })
    this.ghostPreview = new THREE.Group()
    this.ghostPreview.visible = false
    this.ghostPreview.renderOrder = 11
    this.scene.add(this.ghostPreview)

    this.debris = new DebrisParticles(this.scene)
    this.notch = new NotchOverlay(this.scene)
    this.crack = new CrackOverlay(this.scene)

    this.bindEvents()
    this.resize()
    this.applyCameraRotation()
  }

  private streamChunks(force = false) {
    const deploying = Boolean(this.deploy?.active)
    const foci: { x: number; z: number }[] = []
    const fx = Number.isFinite(this.streamFocusX) ? this.streamFocusX : this.camera.position.x
    const fz = Number.isFinite(this.streamFocusZ) ? this.streamFocusZ : this.camera.position.z
    foci.push({ x: fx, z: fz })
    // 舱心与落点不同时，两边都铺图（投送后脚下有地形）
    if (deploying && this.deploy) {
      const dx = this.deploy.dest.x
      const dz = this.deploy.dest.z
      if (Math.hypot(dx - fx, dz - fz) > CHUNK_SIZE * 0.5) {
        foci.push({ x: dx, z: dz })
      }
    }

    const primaryCx = Math.floor(fx / CHUNK_SIZE)
    const primaryCz = Math.floor(fz / CHUNK_SIZE)
    if (!force && primaryCx === this.lastChunkCX && primaryCz === this.lastChunkCZ) {
      // 准备舱 LOD 升级靠 tickDeploy 里的强制复扫
      return
    }
    this.lastChunkCX = primaryCx
    this.lastChunkCZ = primaryCz

    const streamR = deploying ? DEPLOY_STREAM_RADIUS : PRELOAD_RADIUS
    const unloadR = deploying ? Math.max(DEPLOY_STREAM_RADIUS + 2, PRELOAD_RADIUS) : UNLOAD_RADIUS
    const loadR2 = LOAD_RADIUS * LOAD_RADIUS + 1
    const streamR2 = streamR * streamR + 1
    const needed = new Set<string>()
    const pending: { cx: number; cz: number; lod: ChunkLod; dist: number; ahead: number }[] = []

    for (const focus of foci) {
      const cx = Math.floor(focus.x / CHUNK_SIZE)
      const cz = Math.floor(focus.z / CHUNK_SIZE)
      for (let dz = -streamR; dz <= streamR; dz++) {
        for (let dx = -streamR; dx <= streamR; dx++) {
          const r2 = dx * dx + dz * dz
          if (r2 > streamR2) continue
          const key = chunkKey(cx + dx, cz + dz)
          needed.add(key)
          const dist = Math.max(Math.abs(dx), Math.abs(dz))
          const visible = r2 <= loadR2
          let wantLod: ChunkLod = visible ? chunkLodFromDist(dist) : 2
          if (deploying) {
            // 前半粗 LOD 保流畅，后半逐步升到可玩密度
            const progress =
              this.deploy && this.deploy.duration > 0
                ? 1 - this.deploy.remain / this.deploy.duration
                : 0
            if (progress < 0.45) {
              wantLod = (dist <= 2 ? 1 : 2) as ChunkLod
            } else if (progress < 0.75) {
              wantLod = (dist <= 1 ? 0 : dist <= 3 ? 1 : 2) as ChunkLod
            } else {
              wantLod = visible ? chunkLodFromDist(dist) : 2
            }
          }
          const existing = this.chunks.get(key)
          if (!existing) {
            const ahead = dx * this.moveHintX + dz * this.moveHintZ
            pending.push({ cx: cx + dx, cz: cz + dz, lod: wantLod, dist, ahead })
          } else if (wantLod < existing.lod) {
            this.rebuildQueue.add(key)
          }
        }
      }
    }

    pending.sort(
      (a, b) =>
        a.dist - b.dist - (a.ahead - b.ahead) * 2.2 || a.cx - b.cx || a.cz - b.cz
    )
    for (const p of pending) {
      this.enqueueMount(p.cx, p.cz, p.lod)
    }
    if (force) {
      this.flushMountQueue(deploying ? GameEngine.DEPLOY_FORCE_MOUNT : 8)
    }

    for (const [key, meshes] of this.chunks) {
      const [sx, sz] = key.split(',').map(Number)
      let minDist = Infinity
      for (const focus of foci) {
        const cx = Math.floor(focus.x / CHUNK_SIZE)
        const cz = Math.floor(focus.z / CHUNK_SIZE)
        minDist = Math.min(minDist, Math.max(Math.abs(sx - cx), Math.abs(sz - cz)))
      }
      if (!needed.has(key) && minDist > unloadR) {
        this.unmountChunk(key, meshes)
        this.rebuildQueue.delete(key)
        this.mountQueued.delete(key)
      }
    }
    this.mountQueue = this.mountQueue.filter((m) => {
      const key = chunkKey(m.cx, m.cz)
      if (needed.has(key)) return true
      this.mountQueued.delete(key)
      return false
    })
    this.world.pruneVoxelCache(primaryCx, primaryCz, unloadR + 2)
  }

  private enqueueMount(cx: number, cz: number, lod: ChunkLod) {
    const key = chunkKey(cx, cz)
    if (this.chunks.has(key) || this.mountQueued.has(key)) return
    this.mountQueued.add(key)
    this.mountQueue.push({ cx, cz, lod })
    this.mountSortDirty = true
  }

  private mountSortScore(cx: number, cz: number, pcx: number, pcz: number) {
    const dx = cx - pcx
    const dz = cz - pcz
    const dist = Math.max(Math.abs(dx), Math.abs(dz))
    const ahead = dx * this.moveHintX + dz * this.moveHintZ
    // 前方更优先，走路时异步预加载朝向那边
    return dist - ahead * 3.6
  }

  private flushMountQueue(limit = GameEngine.MOUNT_PER_FRAME, fromIdle = false) {
    if (!this.mountQueue.length) return
    const pcx = this.lastChunkCX
    const pcz = this.lastChunkCZ
    if (this.mountSortDirty && Number.isFinite(pcx)) {
      this.mountQueue.sort(
        (a, b) =>
          this.mountSortScore(a.cx, a.cz, pcx, pcz) -
            this.mountSortScore(b.cx, b.cz, pcx, pcz) ||
          a.cx - b.cx ||
          a.cz - b.cz
      )
      this.mountSortDirty = false
    }
    const loadR2 = LOAD_RADIUS * LOAD_RADIUS + 1
    const t0 = performance.now()
    const deploying = Boolean(this.deploy?.active)
    const budget = deploying ? GameEngine.DEPLOY_MESH_BUDGET_MS : GameEngine.MESH_BUDGET_MS
    let n = 0
    while (this.mountQueue.length && n < limit) {
      if (this.inflightMesh >= GameEngine.MAX_INFLIGHT_MESH) break
      // Worker 路径几乎不占预算；同步回退仍限时
      if (n > 0 && this.meshWorkerFailed && performance.now() - t0 > budget) break
      const job = this.mountQueue.shift()!
      const key = chunkKey(job.cx, job.cz)
      this.mountQueued.delete(key)
      if (this.chunks.has(key)) continue
      const dx = Number.isFinite(pcx) ? job.cx - pcx : 0
      const dz = Number.isFinite(pcz) ? job.cz - pcz : 0
      const dist = Math.max(Math.abs(dx), Math.abs(dz))
      const visible = dx * dx + dz * dz <= loadR2
      let lod: ChunkLod = visible ? chunkLodFromDist(dist) : 2
      // 走路时新块不要上全密度，等停稳再升级
      if (this.movingThisFrame && !deploying && lod === 0 && dist > 0) lod = 1
      this.mountChunk(job.cx, job.cz, lod)
      n++
    }
    if (!fromIdle && this.mountQueue.length) this.scheduleIdleMount()
  }

  /** 空闲帧再挂区块，减轻走路主线程卡顿 */
  private scheduleIdleMount() {
    if (this.idleMountRic || this.idleMountTo || !this.mountQueue.length) return
    if (typeof requestIdleCallback === 'function') {
      this.idleMountRic = requestIdleCallback(
        (deadline) => {
          this.idleMountRic = 0
          let n = 0
          while (
            this.mountQueue.length &&
            n < GameEngine.IDLE_MOUNT_MAX &&
            (deadline.timeRemaining() > 2 || (deadline.didTimeout && n < 1))
          ) {
            this.flushMountQueue(1, true)
            n++
            if (!deadline.didTimeout && deadline.timeRemaining() <= 2) break
          }
          if (this.mountQueue.length) this.scheduleIdleMount()
        },
        { timeout: 140 }
      )
      return
    }
    this.idleMountTo = window.setTimeout(() => {
      this.idleMountTo = 0
      this.flushMountQueue(1, true)
      if (this.mountQueue.length) this.scheduleIdleMount()
    }, 16)
  }

  private cancelIdleMount() {
    if (this.idleMountRic) {
      cancelIdleCallback(this.idleMountRic)
      this.idleMountRic = 0
    }
    if (this.idleMountTo) {
      window.clearTimeout(this.idleMountTo)
      this.idleMountTo = 0
    }
  }

  private ensureMeshWorker() {
    if (this.meshWorker || this.meshWorkerFailed) return
    try {
      this.meshWorker = new Worker(new URL('./chunkMesh.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.meshWorker.onmessage = (ev: MessageEvent) => {
        this.onMeshWorkerResult(ev.data)
      }
      this.meshWorker.onerror = () => {
        this.meshWorkerFailed = true
        this.meshWorker?.terminate()
        this.meshWorker = null
        // 积压任务改走主线程
        for (const [jobId, job] of this.pendingMeshJobs) {
          this.pendingMeshJobs.delete(jobId)
          this.inflightMesh = Math.max(0, this.inflightMesh - 1)
          this.mountChunkSync(job.cx, job.cz, job.lod, job.gen)
        }
      }
    } catch {
      this.meshWorkerFailed = true
      this.meshWorker = null
    }
  }

  private bumpChunkGen(key: string) {
    const g = (this.chunkGen.get(key) || 0) + 1
    this.chunkGen.set(key, g)
    return g
  }

  private mountChunk(cx: number, cz: number, lod: ChunkLod) {
    const key = chunkKey(cx, cz)
    const gen = this.bumpChunkGen(key)
    // 主线程先烘焙体素（碰撞/交互）；几何放到 Worker
    this.world.warmChunkVoxelsForMesh(cx, cz)
    // 立刻铺地表代理，避免转视角时整块镂空
    const proxy = buildChunkGroundProxy(this.world, cx, cz)
    this.applyMountedMeshes(key, proxy, gen)

    this.ensureMeshWorker()
    if (!this.meshWorker) {
      this.mountChunkSync(cx, cz, lod, gen)
      return
    }
    const jobId = ++this.meshJobSeq
    this.pendingMeshJobs.set(jobId, { key, cx, cz, lod, gen })
    this.inflightMesh++
    this.meshWorker.postMessage({
      jobId,
      seed: this.world.seed,
      cx,
      cz,
      lod,
      overrides: this.world.collectOverridesAround(cx, cz, 1),
    })
  }

  private mountChunkSync(cx: number, cz: number, lod: ChunkLod, gen: number) {
    const key = chunkKey(cx, cz)
    if (this.chunkGen.get(key) !== gen) return
    const meshes = buildChunkMeshes(this.world, cx, cz, lod)
    this.applyMountedMeshes(key, meshes, gen)
  }

  private onMeshWorkerResult(data: {
    jobId: number
    cx: number
    cz: number
    lod: ChunkLod
    buffers: Parameters<typeof meshesFromChunkBuffers>[0]
  }) {
    this.inflightMesh = Math.max(0, this.inflightMesh - 1)
    const pending = this.pendingMeshJobs.get(data.jobId)
    this.pendingMeshJobs.delete(data.jobId)
    if (!pending) return
    if (this.chunkGen.get(pending.key) !== pending.gen) return
    const meshes = meshesFromChunkBuffers(data.buffers)
    // 用完整网格替换地表代理
    this.applyMountedMeshes(pending.key, meshes, pending.gen)
    if (this.mountQueue.length) this.scheduleIdleMount()
  }

  private applyMountedMeshes(key: string, meshes: ChunkMeshes, gen: number) {
    if (this.chunkGen.get(key) !== gen) {
      disposeChunkMeshes(meshes)
      return
    }
    const old = this.chunks.get(key)
    if (old) {
      if (old.solid) this.chunkGroup.remove(old.solid)
      if (old.water) this.chunkGroup.remove(old.water)
      if (old.grass) this.chunkGroup.remove(old.grass)
      disposeChunkMeshes(old)
    }
    if (meshes.solid) this.chunkGroup.add(meshes.solid)
    if (meshes.water) this.chunkGroup.add(meshes.water)
    if (meshes.grass) this.chunkGroup.add(meshes.grass)
    this.chunks.set(key, meshes)
  }

  private unmountChunk(key: string, meshes: ChunkMeshes) {
    this.bumpChunkGen(key)
    if (meshes.solid) this.chunkGroup.remove(meshes.solid)
    if (meshes.water) this.chunkGroup.remove(meshes.water)
    if (meshes.grass) this.chunkGroup.remove(meshes.grass)
    disposeChunkMeshes(meshes)
    this.chunks.delete(key)
  }

  private focusChunkLod(cx: number, cz: number): ChunkLod {
    if (!Number.isFinite(this.lastChunkCX)) return 0
    return chunkLodFromDist(
      Math.max(Math.abs(cx - this.lastChunkCX), Math.abs(cz - this.lastChunkCZ))
    )
  }

  /** 重建单个已加载区块网格 */
  private rebuildOneChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz)
    const lod = this.focusChunkLod(cx, cz)
    const old = this.chunks.get(key)
    if (old) {
      if (old.solid) this.chunkGroup.remove(old.solid)
      if (old.water) this.chunkGroup.remove(old.water)
      if (old.grass) this.chunkGroup.remove(old.grass)
      disposeChunkMeshes(old)
      this.chunks.delete(key)
    }
    this.mountChunk(cx, cz, lod)
  }

  private enqueueRebuild(cx: number, cz: number) {
    const key = chunkKey(cx, cz)
    if (this.chunks.has(key)) this.rebuildQueue.add(key)
  }

  private flushRebuildQueue() {
    if (!this.rebuildQueue.size) return
    let n = 0
    const keys = [...this.rebuildQueue]
    const pcx = this.lastChunkCX
    const pcz = this.lastChunkCZ
    if (Number.isFinite(pcx)) {
      keys.sort((ka, kb) => {
        const [ax, az] = ka.split(',').map(Number)
        const [bx, bz] = kb.split(',').map(Number)
        return (
          this.mountSortScore(ax, az, pcx, pcz) - this.mountSortScore(bx, bz, pcx, pcz)
        )
      })
    }
    const t0 = performance.now()
    for (const key of keys) {
      if (n >= GameEngine.REBUILD_PER_FRAME) break
      if (performance.now() - t0 > GameEngine.MESH_BUDGET_MS) break
      if (!this.rebuildQueue.has(key)) continue
      const [cx, cz] = key.split(',').map(Number)
      const dist = Number.isFinite(pcx)
        ? Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz))
        : 0
      // 走路时只刷脚下近块（挖掘反馈）；远处 LOD 升级等停稳再做
      // 准备舱期间全力刷落点，不推迟
      if (this.movingThisFrame && !this.deploy?.active && dist > 1) continue
      this.rebuildQueue.delete(key)
      if (!this.chunks.has(key)) continue
      this.rebuildOneChunk(cx, cz)
      n++
    }
  }

  /**
   * 按改动格重建：只刷所在块，边界格才刷邻块；入队限流，避免同帧卡顿
   */
  private rebuildChunksForBlocks(blocks: { x: number; z: number }[]) {
    for (const b of blocks) {
      const x = Math.floor(b.x)
      const z = Math.floor(b.z)
      const cx = Math.floor(x / CHUNK_SIZE)
      const cz = Math.floor(z / CHUNK_SIZE)
      this.enqueueRebuild(cx, cz)
      const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      if (lx <= 0) this.enqueueRebuild(cx - 1, cz)
      if (lx >= CHUNK_SIZE - 1) this.enqueueRebuild(cx + 1, cz)
      if (lz <= 0) this.enqueueRebuild(cx, cz - 1)
      if (lz >= CHUNK_SIZE - 1) this.enqueueRebuild(cx, cz + 1)
    }
  }

  private rebuildChunkAt(x: number, z: number) {
    this.rebuildChunksForBlocks([{ x, z }])
  }

  setMoveInput(forward: number, strafe: number) {
    if (this.combatLocked) {
      this.moveForward = 0
      this.moveStrafe = 0
      return
    }
    this.moveForward = Math.max(-1, Math.min(1, forward))
    this.moveStrafe = Math.max(-1, Math.min(1, strafe))
  }

  queueJump() {
    if (this.combatLocked) return
    this.jumpQueued = true
  }

  applyLook(deltaX: number, deltaY: number, sensitivity = 0.0055) {
    if (this.combatLocked) return
    // 往哪滑就往哪看：水平跟手；垂直取反（上滑抬头、下滑低头）
    const dx = Math.max(-64, Math.min(64, deltaX))
    const dy = Math.max(-64, Math.min(64, deltaY))
    this.lookBufX += dx * sensitivity
    this.lookBufY -= dy * sensitivity
  }

  /** 用欧拉角直接转镜头，比 lookAt 更稳 */
  private applyCameraRotation() {
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = -this.pitch
    this.camera.rotation.z = 0
  }

  private consumeLookBuffer(dt: number) {
    const hasLook = this.lookBufX !== 0 || this.lookBufY !== 0
    const hasRecoil = Math.abs(this.recoilPitch) > 1e-5 || Math.abs(this.recoilYaw) > 1e-5
    if (!hasLook && !hasRecoil) return

    if (hasLook) {
      const k = 1 - Math.exp(-36 * dt)
      const useX = this.lookBufX * k
      const useY = this.lookBufY * k
      this.lookBufX -= useX
      this.lookBufY -= useY
      if (Math.abs(this.lookBufX) < 1e-5) this.lookBufX = 0
      if (Math.abs(this.lookBufY) < 1e-5) this.lookBufY = 0
      this.yaw -= useX
      this.pitch -= useY
    }

    if (hasRecoil) {
      // 后坐瞬时抬枪，再快速回落
      const kick = 1 - Math.exp(-18 * dt)
      this.pitch += this.recoilPitch * kick
      this.yaw += this.recoilYaw * kick
      this.recoilPitch *= Math.exp(-10 * dt)
      this.recoilYaw *= Math.exp(-10 * dt)
      if (Math.abs(this.recoilPitch) < 1e-5) this.recoilPitch = 0
      if (Math.abs(this.recoilYaw) < 1e-5) this.recoilYaw = 0
    }

    this.pitch = Math.max(-1.05, Math.min(0.95, this.pitch))
    this.applyCameraRotation()
  }

  private kindForBlock(id: BlockId): HarvestKind | null {
    if (id === 'air' || id === 'water') return null
    if (id === 'wood' || id === 'plank') return 'chop'
    if (id === 'stone') return 'mine'
    if (id === 'leaves') return 'chop' // 对准树叶也视为砍树
    if (id === 'stump' || id === 'rubble') return 'clear'
    return 'dig'
  }

  /** 砍树时：准星打到树叶则改打附近树干 */
  private resolveChopTarget(
    x: number,
    y: number,
    z: number,
    id: BlockId
  ): { x: number; y: number; z: number; id: BlockId } | null {
    if (id === 'wood' || id === 'plank') return { x, y, z, id }
    if (id !== 'leaves') return null
    // 在邻域找树干（树干加长后扩大搜索）
    for (let dy = -10; dy <= 1; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const wx = x + dx
          const wy = y + dy
          const wz = z + dz
          if (this.world.get(wx, wy, wz) === 'wood') {
            return { x: wx, y: wy, z: wz, id: 'wood' }
          }
        }
      }
    }
    return null
  }

  queueCrouch(on?: boolean) {
    const next = on === undefined ? !this.crouching : on
    if (next === this.crouching) return
    this.crouching = next
    // 只改目标值，由 update 里平滑插值眼高（避免瞬蹲/瞬起）
    this.eyeHeightTarget = next ? PLAYER_EYE_CROUCH : PLAYER_EYE
    this.bodyHeightTarget = next ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT
  }

  /** 蹲/起身：脚底贴地，眼高向目标缓动 */
  private tickCrouch(dt: number) {
    const prevEye = this.eyeHeight
    const k = Math.min(1, dt * CROUCH_EYE_LERP)
    this.eyeHeight += (this.eyeHeightTarget - this.eyeHeight) * k
    this.bodyHeight += (this.bodyHeightTarget - this.bodyHeight) * k
    if (Math.abs(this.eyeHeight - this.eyeHeightTarget) < 0.002) {
      this.eyeHeight = this.eyeHeightTarget
      this.bodyHeight = this.bodyHeightTarget
    }
    const dEye = this.eyeHeight - prevEye
    if (Math.abs(dEye) < 1e-6) return

    const feet = this.camera.position.y - prevEye
    const support = this.supportTopY(this.camera.position.x, feet + 0.08, this.camera.position.z)
    if (support != null && this.onGround) {
      this.camera.position.y = support + 0.02 + this.eyeHeight
      this.velocityY = 0
    } else {
      this.camera.position.y = feet + this.eyeHeight
    }
  }

  getPose() {
    return {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
      crouching: this.crouching,
      action: this.actionKind,
    }
  }

  playCombatSwing(weaponId: string) {
    this.audio?.playWeaponAttack(weaponId)
    const ranged = weaponId === 'pistol' || weaponId === 'rifle' || weaponId === 'sniper'
    if (ranged) {
      this.body.playSwing('dig')
      // 轻微后坐：狙击更明显，步枪短促，手枪最轻
      const kick =
        weaponId === 'sniper' ? 0.055 : weaponId === 'rifle' ? 0.028 : 0.018
      this.recoilPitch += kick * (0.85 + Math.random() * 0.3)
      this.recoilYaw += (Math.random() - 0.5) * kick * 0.55
    } else {
      this.body.playSwing('axe')
    }
  }

  /** 枪械开火时的轻微方向散布（弧度） */
  combatAimJitter(weaponId: string): { jx: number; jz: number } {
    if (weaponId !== 'pistol' && weaponId !== 'rifle' && weaponId !== 'sniper') {
      return { jx: 0, jz: 0 }
    }
    const spread =
      weaponId === 'sniper' ? 0.008 : weaponId === 'rifle' ? 0.022 : 0.028
    const a = (Math.random() - 0.5) * spread
    const b = (Math.random() - 0.5) * spread
    return { jx: a, jz: b }
  }

  refreshTargetLabel() {
    if (this.buildMode) {
      if (!this.matArmed) {
        this.targetName = '建造 · 先选材料'
        this.targetActionLabel = '建造'
        return
      }
      if (!this.selected?.place) {
        this.targetName = '建造 · 对准表面'
        this.targetActionLabel = '建造'
        return
      }
      this.targetName = `建造 · ${MATERIAL_LABEL[this.buildMaterial] || '材料'}`
      this.targetActionLabel = '建造'
      return
    }

    let k: HarvestKind | null = this.activeAction?.kind ?? null
    if (!k && this.selected) {
      const id = this.world.get(this.selected.hit.x, this.selected.hit.y, this.selected.hit.z)
      k = this.kindForBlock(id)
    }
    this.targetActionLabel = actionLabel(k)

    if (this.selected) {
      const id = this.world.get(this.selected.hit.x, this.selected.hit.y, this.selected.hit.z)
      if (id === 'wood' || id === 'leaves') this.targetName = '树木'
      else if (id === 'stone') this.targetName = '石头'
      else if (id === 'water') this.targetName = '小溪'
      else this.targetName = BLOCK_LABEL[id] || ''
    } else {
      this.targetName = ''
    }
  }

  /** 开始挖掘/砍/开采（砍树/采石会自动切到斧头） */
  beginHarvest() {
    if (this.deploy?.active) {
      this.lastActionHint = '准备舱中暂不可挖砍'
      this.onActionUi?.()
      return
    }
    if (this.activeAction) return
    if (this.buildMode) {
      this.lastActionHint = '建造模式中，请先退出再挖砍'
      this.onActionUi?.()
      return
    }
    this.updateBlockSelection()
    if (!this.selected) {
      this.lastActionHint = '请对准可操作的方块'
      this.onActionUi?.()
      return
    }
    let { x, y, z } = this.selected.hit
    let id = this.world.get(x, y, z)
    let kind = this.kindForBlock(id)
    if (!kind) {
      this.lastActionHint = id === 'water' ? '小溪无法挖掘' : '无法操作此方块'
      this.onActionUi?.()
      return
    }

    if (kind === 'chop') {
      const resolved = this.resolveChopTarget(x, y, z, id)
      if (!resolved) {
        this.lastActionHint = '附近没有可砍的树干'
        this.onActionUi?.()
        return
      }
      x = resolved.x
      y = resolved.y
      z = resolved.z
      id = resolved.id
    }

    // 砍/开采：自动装备斧头（不必先手动切换）
    if (kind === 'chop' || kind === 'mine') {
      this.tool = 'axe'
      this.body.setHoldingAxe(true)
      this.onInventoryChange?.()
    }

    let duration = ACTION_DURATION[kind]
    if (kind === 'mine') {
      const rock = this.world.rockDrawInfo(x, y, z)
      duration = mineDurationForSize(rock?.size ?? 1)
    }
    this.activeAction = {
      kind,
      duration,
      elapsed: 0,
      hits: 0,
      nextHitAt: duration,
      x,
      y,
      z,
      face: { ...this.selected.face },
      blockId: id,
    }
    this.actionKind = kind
    this.actionProgress = 0
    this.actionRemainSec = duration
    this.actionSfxAcc = 0.2
    this.targetActionLabel = actionLabel(kind)
    this.onActionUi?.()

    // 砍/采：音效与挥砍由 tickAction 按节奏触发，最后一下对齐倒计时结束
    if (kind !== 'chop' && kind !== 'mine') {
      this.body.playSwing('dig')
      this.audio?.play('dig')
    }
  }

  cancelAction() {
    if (!this.activeAction) return
    this.activeAction = null
    this.actionProgress = 0
    this.actionRemainSec = 0
    this.actionKind = null
    this.notch.hide()
    this.crack.hide()
    this.onActionUi?.()
  }

  /** 热键栏是否已选中材料；未选中时禁止建造 */
  matArmed = false
  /** 建造模式：开=幽灵预览+建造；关=挖/砍/采 */
  buildMode = false

  setBuildMode(on: boolean) {
    this.buildMode = on
    if (on && this.activeAction && this.activeAction.kind !== 'build') {
      this.cancelAction()
    }
    if (!on && this.activeAction?.kind === 'build') {
      this.cancelAction()
    }
    this.updateBlockSelection()
    this.onActionUi?.()
  }

  beginBuild() {
    if (this.deploy?.active) {
      this.lastActionHint = '准备舱中暂不可建造'
      this.onActionUi?.()
      return
    }
    if (this.activeAction) return
    if (!this.buildMode) {
      this.lastActionHint = '请先进入建造模式'
      this.onActionUi?.()
      return
    }
    if (!this.matArmed) {
      this.lastActionHint = '未选择材料'
      this.onActionUi?.()
      return
    }
    this.updateBlockSelection()
    if (!this.selected?.place) {
      this.lastActionHint = '请对准可贴放的表面'
      this.onActionUi?.()
      return
    }
    if (!this.inventory) return
    const cost = SHAPE_COST[this.buildShape]
    if ((this.inventory[this.buildMaterial] || 0) < cost) {
      this.lastActionHint = `材料不足（需要 ${cost}）`
      this.onActionUi?.()
      return
    }
    const cells = this.buildCells(
      {
        x: this.selected.place.x,
        y: this.selected.place.y,
        z: this.selected.place.z,
      },
      this.selected.face,
      this.buildShape
    )
    const placeable = cells.some(
      (c) => this.world.get(c.x, c.y, c.z) === 'air' && !this.overlapsPlayer(c.x, c.y, c.z)
    )
    if (!placeable) {
      this.lastActionHint = '此处无法建造'
      this.onActionUi?.()
      return
    }
    const duration = ACTION_DURATION.build
    this.activeAction = {
      kind: 'build',
      duration,
      elapsed: 0,
      hits: 0,
      nextHitAt: duration,
      x: this.selected.place.x,
      y: this.selected.place.y,
      z: this.selected.place.z,
      face: { ...this.selected.face },
      blockId: 'air',
    }
    this.actionKind = 'build'
    this.actionProgress = 0
    this.actionRemainSec = duration
    this.actionSfxAcc = 0.15
    this.body.playSwing('place')
    this.audio?.play('build')
    this.onActionUi?.()
  }

  private performHit() {
    if (!this.activeAction) return
    const a = this.activeAction
    a.hits += 1
    if (a.kind === 'chop') {
      this.body.playSwing('axe')
      this.body.setHoldingAxe(true)
      this.notch.showAt(a.x, a.y, a.z, a.face, a.hits, WOOD_TRUNK_R)
      // 木屑从树干表面飞出，不要在玩家脚边
      let nx = a.face.x
      let nz = a.face.z
      if (Math.abs(nx) + Math.abs(nz) < 0.01) {
        nx = 0
        nz = 1
      }
      const nlen = Math.hypot(nx, nz) || 1
      nx /= nlen
      nz /= nlen
      const sx = a.x + 0.5 - nx * WOOD_TRUNK_R * 0.95
      const sy = a.y + 0.38
      const sz = a.z + 0.5 - nz * WOOD_TRUNK_R * 0.95
      this.debris.burst(sx, sy, sz, 0x8b5a2b, 10, new THREE.Vector3(-nx, 0.35, -nz))
      this.audio?.play('chop')
    } else if (a.kind === 'mine') {
      this.body.playSwing('axe')
      this.body.setHoldingAxe(true)
      const info = this.world.rockDrawInfo(a.x, a.y, a.z)
      const size = info?.size ?? 1
      const base = size === 1 ? 0.42 : size === 2 ? 0.72 : 1.05
      const rockH = base * 0.62
      const pivot = {
        x: (info?.x ?? a.x) + 0.5,
        y: (info?.y ?? a.y) + rockH * 0.55,
        z: (info?.z ?? a.z) + 0.5,
      }
      const surfaceR = base * 0.72
      this.crack.showAt(a.x, a.y, a.z, a.face, a.hits, pivot, surfaceR)

      let nx = a.face.x
      let ny = a.face.y
      let nz = a.face.z
      if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) < 0.01) {
        nx = 0
        ny = 0.4
        nz = 1
      }
      if (Math.abs(ny) > 0.85) {
        nx = 0
        ny = 0.4
        nz = 1
      }
      const nlen = Math.hypot(nx, ny, nz) || 1
      nx /= nlen
      ny /= nlen
      nz /= nlen
      const lift = surfaceR * 0.9
      this.debris.burst(
        pivot.x + nx * lift,
        pivot.y + ny * lift,
        pivot.z + nz * lift,
        0x8a8e94,
        12,
        new THREE.Vector3(nx, Math.max(0.2, ny), nz)
      )
      this.audio?.play('mine')
    } else {
      this.body.playSwing('dig')
      this.debris.burst(a.x + 0.5, a.y + 0.5, a.z + 0.5, 0x6db33f, 6)
      this.audio?.play('dig')
    }
  }

  private isActionTargetStillValid(a: {
    kind: HarvestKind
    x: number
    y: number
    z: number
    blockId: BlockId
  }) {
    if (!this.selected) return false
    const hx = this.selected.hit.x
    const hy = this.selected.hit.y
    const hz = this.selected.hit.z
    if (hx === a.x && hy === a.y && hz === a.z) return true

    if (a.kind === 'chop') {
      const id = this.world.get(hx, hy, hz)
      if (id === 'wood' || id === 'leaves') {
        // 同一棵树：同一柱或邻格树干/叶
        if (hx === a.x && hz === a.z) return true
        if (Math.abs(hx - a.x) <= 2 && Math.abs(hz - a.z) <= 2 && Math.abs(hy - a.y) <= 4) {
          return true
        }
      }
      // 目标树干还在即可（准星略偏）
      const stillWood = this.world.get(a.x, a.y, a.z) === 'wood'
      return stillWood && Math.abs(hx - a.x) + Math.abs(hz - a.z) <= 3
    }

    if (a.kind === 'mine') {
      // 同一石堆：准星可在邻格微抖，不因 follower 格切换取消
      if (this.world.get(a.x, a.y, a.z) !== 'stone') return false
      if (hx === a.x && hy === a.y && hz === a.z) return true
      const aInfo = this.world.rockDrawInfo(a.x, a.y, a.z)
      const hInfo = this.world.rockDrawInfo(hx, hy, hz)
      return !!(
        aInfo &&
        hInfo &&
        Math.abs(aInfo.x - hInfo.x) < 0.01 &&
        Math.abs(aInfo.y - hInfo.y) < 0.01 &&
        Math.abs(aInfo.z - hInfo.z) < 0.01
      )
    }

    return false
  }

  private tickAction(dt: number) {
    const a = this.activeAction
    if (!a) return

    // 准星离开目标则取消（砍树允许仍对准同株树叶/树干）
    this.updateBlockSelection()
    if (a.kind !== 'build') {
      const stillOk = this.isActionTargetStillValid(a)
      if (!stillOk) {
        this.cancelAction()
        return
      }
    }

    a.elapsed += dt
    this.actionProgress = Math.min(1, a.elapsed / a.duration)
    this.actionRemainSec = Math.max(0, a.duration - a.elapsed)
    this.onActionUi?.()

    if (a.kind === 'dig' || a.kind === 'clear' || a.kind === 'build') {
      this.actionSfxAcc += dt
      if (this.actionSfxAcc >= 0.28) {
        this.actionSfxAcc = 0
        this.audio?.play(a.kind === 'build' ? 'build' : 'dig')
        this.body.playSwing(a.kind === 'build' ? 'place' : 'dig')
      }
    }

    if (a.kind === 'chop' || a.kind === 'mine') {
      // 砍树 3 刀 / 采石 2 刀：均匀落在时长内，最后一刀 = 倒计时结束
      const totalHits = a.kind === 'chop' ? 3 : 2
      while (a.hits < totalHits) {
        const nextAt = (a.duration * (a.hits + 1)) / totalHits
        if (a.elapsed + 1e-4 < nextAt) break
        this.performHit()
      }
    }

    if (a.elapsed >= a.duration) {
      this.finishAction()
    }
  }

  private finishAction() {
    const a = this.activeAction
    if (!a) return
    const kind = a.kind
    this.notch.hide()
    this.crack.hide()
    this.activeAction = null
    this.actionProgress = 0
    this.actionRemainSec = 0
    this.actionKind = null
    this.onActionUi?.()

    if (kind === 'build') {
      this.executeBuildAt(a.x, a.y, a.z, a.face)
      return
    }

    if (kind === 'chop') {
      this.finishChopTree(a.x, a.y, a.z)
      return
    }
    if (kind === 'mine') {
      this.finishMineStone(a.x, a.y, a.z)
      return
    }

    // dig / clear
    const id = this.world.get(a.x, a.y, a.z)
    if (id === 'water') {
      this.lastActionHint = '小溪无法挖掘'
      this.onActionUi?.()
      return
    }

    // 河道下方：挖不到空洞，顶多刨一层湿沙（河床仍在）
    const inCreek = this.world.isCreek(a.x, a.z)
    const sy = this.world.surfaceHeight(a.x, a.z)
    if (inCreek && a.y < sy) {
      if (this.inventory) {
        addMaterial(this.inventory, 'sand', 1)
        this.onInventoryChange?.()
        this.onHarvestLoot?.('dig')
        this.lastActionHint = '+1 沙子'
      }
      this.world.set(a.x, a.y, a.z, a.y >= sy - 1 ? 'sand' : 'dirt')
      this.rebuildChunkAt(a.x, a.z)
      this.emitBlocks([
        { x: a.x, y: a.y, z: a.z, blockId: a.y >= sy - 1 ? 'sand' : 'dirt' },
      ])
      this.updateBlockSelection()
      return
    }

    const harvest = BLOCK_HARVEST[id]
    if (harvest?.mat && this.inventory) {
      addMaterial(this.inventory, harvest.mat, 1)
      this.onInventoryChange?.()
      this.onHarvestLoot?.(kind === 'clear' ? 'clear' : 'dig')
      this.lastActionHint = `+1`
    }
    const remain = harvest?.remain ?? 'air'
    this.world.set(a.x, a.y, a.z, remain)
    this.rebuildChunkAt(a.x, a.z)
    this.emitBlocks([{ x: a.x, y: a.y, z: a.z, blockId: remain }])
    this.updateBlockSelection()
  }

  private emitBlocks(
    blocks: { x: number; y: number; z: number; blockId: BlockId }[]
  ) {
    if (this.suppressingBlockNotify || !blocks.length) return
    this.onBlocksChange?.(blocks)
  }

  /** 应用队友/服务端同步的方块（不回写网络） */
  applyRemoteBlocks(
    blocks: { x: number; y: number; z: number; blockId: string }[]
  ) {
    if (!blocks.length) return
    this.suppressingBlockNotify = true
    try {
      const rebuild: { x: number; z: number }[] = []
      for (const b of blocks) {
        this.world.set(b.x, b.y, b.z, b.blockId as BlockId)
        rebuild.push({ x: b.x, z: b.z })
      }
      this.rebuildChunksForBlocks(rebuild)
      this.updateBlockSelection()
    } finally {
      this.suppressingBlockNotify = false
    }
  }

  /** 砍倒：整棵树立刻消失并入库（不留树墩） */
  private finishChopTree(x: number, y: number, z: number) {
    const tree = this.world.treeCellsAt(x, y, z)
    const cells = tree || [{ x, y, z }]

    const woods = cells.filter((c) => {
      const id = this.world.get(c.x, c.y, c.z)
      return id === 'wood' || id === 'plank'
    })
    const woodCount = Math.max(1, woods.length)
    let burstX = x
    let burstY = y
    let burstZ = z
    if (woods.length) {
      const col = woods.filter((c) => c.x === x && c.z === z)
      const use = col.length ? col : woods
      burstX = use[0].x
      burstZ = use[0].z
      burstY = Math.min(...use.map((c) => c.y))
    }

    const rebuildBlocks: { x: number; z: number }[] = []
    const changed: { x: number; y: number; z: number; blockId: BlockId }[] = []
    for (const c of cells) {
      this.world.set(c.x, c.y, c.z, 'air')
      rebuildBlocks.push({ x: c.x, z: c.z })
      changed.push({ x: c.x, y: c.y, z: c.z, blockId: 'air' })
    }
    this.rebuildChunksForBlocks(rebuildBlocks)
    this.emitBlocks(changed)

    if (this.inventory) {
      addMaterial(this.inventory, 'wood', woodCount)
      this.onInventoryChange?.()
    }
    this.onHarvestLoot?.('chop')
    this.debris.burst(burstX + 0.5, burstY + 0.45, burstZ + 0.5, 0x8b5a2b, 14)
    this.hideSelectionTint()
    this.lastActionHint = `+${woodCount} 木材`
    this.updateBlockSelection()
  }

  /** 开采：整块石堆一次清除并入库（不留碎石 / 不留幽灵格） */
  private finishMineStone(x: number, y: number, z: number) {
    if (this.world.get(x, y, z) !== 'stone') return
    const info = this.world.rockDrawInfo(x, y, z)
    const cells = this.world.allRockCellsAt(x, y, z) || [{ x, y, z }]
    const size = info?.size ?? Math.min(3, Math.max(1, cells.length <= 1 ? 1 : cells.length <= 4 ? 2 : 3))
    const gain = size

    const base = size === 1 ? 0.42 : size === 2 ? 0.72 : 1.05
    const burstX = info ? info.x + 0.5 : x + 0.5
    const burstY = info ? info.y + base * 0.35 : y + 0.35
    const burstZ = info ? info.z + 0.5 : z + 0.5
    this.debris.burst(burstX, burstY, burstZ, 0x9a968c, 8 + size * 2)

    const rebuildBlocks: { x: number; z: number }[] = []
    const changed: { x: number; y: number; z: number; blockId: BlockId }[] = []
    for (const c of cells) {
      this.world.set(c.x, c.y, c.z, 'air')
      rebuildBlocks.push({ x: c.x, z: c.z })
      changed.push({ x: c.x, y: c.y, z: c.z, blockId: 'air' })
    }
    this.rebuildChunksForBlocks(rebuildBlocks)
    this.emitBlocks(changed)

    if (this.inventory) {
      addMaterial(this.inventory, 'stone', gain)
      this.onInventoryChange?.()
    }
    this.onHarvestLoot?.('mine')
    this.hideSelectionTint()
    this.lastActionHint = `+${gain} 石材`
    this.updateBlockSelection()
  }

  private executeBuildAt(
    ox: number,
    oy: number,
    oz: number,
    face: { x: number; y: number; z: number }
  ) {
    if (!this.inventory) return
    const mat = this.buildMaterial
    const block = MATERIAL_BLOCK[mat]
    const cells = this.buildCells({ x: ox, y: oy, z: oz }, face, this.buildShape)
    let placed = 0
    const changed: { x: number; y: number; z: number; blockId: BlockId }[] = []
    for (const c of cells) {
      if (this.world.get(c.x, c.y, c.z) !== 'air') continue
      if (this.overlapsPlayer(c.x, c.y, c.z)) continue
      if (!trySpend(this.inventory, mat, 1)) break
      this.world.set(c.x, c.y, c.z, block)
      changed.push({ x: c.x, y: c.y, z: c.z, blockId: block })
      placed++
    }
    if (placed > 0) {
      this.onInventoryChange?.()
      const seen = new Set<string>()
      for (const c of cells) {
        const key = `${Math.floor(c.x / CHUNK_SIZE)},${Math.floor(c.z / CHUNK_SIZE)}`
        if (seen.has(key)) continue
        seen.add(key)
        this.rebuildChunkAt(c.x, c.z)
      }
      this.emitBlocks(changed)
      this.lastActionHint = `建造 ${placed} 格`
      this.audio?.play('build', { volume: 1 })
    }
    this.updateBlockSelection()
  }

  // 旧即时建造入口改为延时
  private overlapsPlayer(x: number, y: number, z: number) {
    const px = this.camera.position.x
    const py = this.camera.position.y
    const pz = this.camera.position.z
    return (
      Math.floor(px) === x &&
      (Math.floor(py - this.eyeHeight) === y || Math.floor(py - 0.2) === y) &&
      Math.floor(pz) === z
    )
  }

  private buildCells(
    origin: { x: number; y: number; z: number },
    face: { x: number; y: number; z: number },
    shape: BuildShape
  ) {
    const cells: { x: number; y: number; z: number }[] = []
    if (shape === 'single') {
      cells.push({ ...origin })
    } else if (shape === 'wall') {
      // 3 宽 × 3 高（房屋/城墙段）
      let ux = 0
      let uz = 0
      if (Math.abs(face.x) > 0) uz = 1
      else if (Math.abs(face.z) > 0) ux = 1
      else ux = 1
      for (let h = 0; h < 3; h++) {
        for (let w = -1; w <= 1; w++) {
          cells.push({
            x: origin.x + ux * w,
            y: origin.y + h,
            z: origin.z + uz * w,
          })
        }
      }
    } else if (shape === 'column') {
      for (let h = 0; h < 3; h++) cells.push({ x: origin.x, y: origin.y + h, z: origin.z })
    } else if (shape === 'floor') {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          cells.push({ x: origin.x + dx, y: origin.y, z: origin.z + dz })
        }
      }
    }
    return cells
  }

  private bindEvents() {
    window.addEventListener('resize', this.resize)
    window.visualViewport?.addEventListener('resize', this.resize)
    window.addEventListener('orientationchange', this.resize)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.renderer.domElement.addEventListener('click', this.requestLock)
    document.addEventListener('pointerlockchange', this.onLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
  }

  private requestLock = () => {
    if (window.matchMedia('(pointer: fine)').matches) {
      this.renderer.domElement.requestPointerLock()
    }
  }

  private onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return
    this.applyLook(e.movementX, e.movementY, 0.0042)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code)
    if (e.code === 'KeyQ') {
      if (this.buildMode) this.beginBuild()
      else this.beginHarvest()
    }
    if (e.code === 'Digit1') this.tool = 'hand'
    if (e.code === 'Digit2') this.tool = 'axe'
    if (e.code === 'KeyC') {
      if (!e.repeat) this.queueCrouch() // C：切换蹲/站
    }
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      if (!e.repeat) this.queueCrouch(true) // Ctrl：按住蹲
    }
    if (e.code === 'Escape') this.cancelAction()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      this.queueCrouch(false)
    }
  }

  /** 与画面中心准星一致：用相机实际朝向 */
  private lookDir() {
    this.camera.getWorldDirection(this.lookDirTmp)
    return this.lookDirTmp
  }

  /**
   * 体素 DDA：命中固体方块与表面法线。
   * 天然石/树干/灌木按可视造型收窄，避免整格提前高亮。
   * 命中面距离 > REACH_DISTANCE 时返回 null（不高亮、不可挖放）。
   */
  private raycastBlock(maxDist = REACH_DISTANCE) {
    this.camera.updateMatrixWorld()
    const o = this.camera.position
    const d = this.lookDir()
    if (d.lengthSq() < 1e-8) return null

    let x = Math.floor(o.x)
    let y = Math.floor(o.y)
    let z = Math.floor(o.z)

    const stepX = d.x > 0 ? 1 : d.x < 0 ? -1 : 0
    const stepY = d.y > 0 ? 1 : d.y < 0 ? -1 : 0
    const stepZ = d.z > 0 ? 1 : d.z < 0 ? -1 : 0

    const tDeltaX = stepX !== 0 ? Math.abs(1 / d.x) : Infinity
    const tDeltaY = stepY !== 0 ? Math.abs(1 / d.y) : Infinity
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / d.z) : Infinity

    let tMaxX =
      stepX !== 0 ? ((stepX > 0 ? x + 1 : x) - o.x) / d.x : Infinity
    let tMaxY =
      stepY !== 0 ? ((stepY > 0 ? y + 1 : y) - o.y) / d.y : Infinity
    let tMaxZ =
      stepZ !== 0 ? ((stepZ > 0 ? z + 1 : z) - o.z) / d.z : Infinity

    // 初始法线：沿射线前进方向的反面（进入第一格时再更新）
    let face = {
      x: stepX !== 0 ? -stepX : 0,
      y: stepY !== 0 ? -stepY : 0,
      z: stepZ !== 0 ? -stepZ : 0,
    }
    let t = 0

    for (let i = 0; i < 96; i++) {
      const id = this.world.get(x, y, z)
      // 河水可瞄准（不可挖），避免射线穿透挖空河床导致镂空
      if (id !== 'air') {
        if (t > maxDist + 1e-4) return null
        // 造型小于体素：射线未打中外形则穿透继续
        if (this.rayHitsBlockShape(o, d, x, y, z, id, maxDist)) {
          const place = { x: x + face.x, y: y + face.y, z: z + face.z }
          const placeId = this.world.get(place.x, place.y, place.z)
          return {
            hit: { x, y, z },
            place: placeId === 'air' || placeId === 'water' ? place : null,
            face: { ...face },
          }
        }
      }

      const nextT = Math.min(tMaxX, tMaxY, tMaxZ)
      if (!Number.isFinite(nextT) || nextT > maxDist + 1e-4) return null

      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        t = tMaxX
        x += stepX
        tMaxX += tDeltaX
        face = { x: -stepX, y: 0, z: 0 }
      } else if (tMaxY <= tMaxZ) {
        t = tMaxY
        y += stepY
        tMaxY += tDeltaY
        face = { x: 0, y: -stepY, z: 0 }
      } else {
        t = tMaxZ
        z += stepZ
        tMaxZ += tDeltaZ
        face = { x: 0, y: 0, z: -stepZ }
      }
    }
    return null
  }

  /**
   * 普通方块：整格命中。
   * 天然石 / 树干 / 灌木：按圆柱外形（接近网格造型）。
   */
  private rayHitsBlockShape(
    o: THREE.Vector3,
    d: THREE.Vector3,
    x: number,
    y: number,
    z: number,
    id: BlockId,
    maxDist: number
  ) {
    if (id === 'stone' && this.world.isNaturalStone(x, y, z)) {
      return this.rayHitsNaturalRock(o, d, x, y, z, maxDist)
    }
    if (id === 'wood') {
      return this.rayHitsWoodTrunk(o, d, x, z, maxDist)
    }
    if (id === 'shrub') {
      const feat = this.world.featureBaseY(x, z)
      return this.rayHitsYCylinder(
        o,
        d,
        x + 0.5,
        z + 0.5,
        feat,
        feat + 1.05,
        0.38,
        maxDist
      )
    }
    return true
  }

  /** 选中用半径：贴合风格化石外形，略放大减少顶部边缘漏检 */
  private naturalRockSelectRadius(size: number) {
    return size === 1 ? 0.5 : size === 2 ? 0.86 : 1.18
  }

  private naturalRockSelectHeight(size: number) {
    // 须盖住造型顶点 + 多格石堆上沿，否则瞄上方会闪
    return size === 1 ? 0.72 : size === 2 ? 1.2 : 1.65
  }

  private rayHitsNaturalRock(
    o: THREE.Vector3,
    d: THREE.Vector3,
    x: number,
    y: number,
    z: number,
    maxDist: number
  ) {
    const info = this.world.rockDrawInfo(x, y, z)
    if (!info) return true
    const sx = Math.floor(info.x)
    const sz = Math.floor(info.z)
    const size = info.size
    const r = this.naturalRockSelectRadius(size)
    const h = this.naturalRockSelectHeight(size)
    const feat = this.world.featureBaseY(sx, sz)
    return this.rayHitsYCylinder(
      o,
      d,
      sx + 0.5,
      sz + 0.5,
      feat,
      feat + h,
      r,
      maxDist
    )
  }

  private rayHitsWoodTrunk(
    o: THREE.Vector3,
    d: THREE.Vector3,
    x: number,
    z: number,
    maxDist: number
  ) {
    let lo = Infinity
    let hi = -Infinity
    const feat = this.world.featureBaseY(x, z)
    for (let yy = feat; yy <= feat + 14; yy++) {
      if (this.world.get(x, yy, z) !== 'wood') continue
      lo = Math.min(lo, yy)
      hi = Math.max(hi, yy + 1)
    }
    if (hi < lo) return false
    return this.rayHitsYCylinder(
      o,
      d,
      x + 0.5,
      z + 0.5,
      lo,
      hi,
      WOOD_TRUNK_R + 0.04,
      maxDist
    )
  }

  /** 竖直圆柱（含顶底圆盘）与射线是否相交 */
  private rayHitsYCylinder(
    o: THREE.Vector3,
    d: THREE.Vector3,
    cx: number,
    cz: number,
    y0: number,
    y1: number,
    radius: number,
    maxT: number
  ) {
    const r2 = radius * radius
    const ox = o.x - cx
    const oz = o.z - cz
    const a = d.x * d.x + d.z * d.z
    const b = 2 * (ox * d.x + oz * d.z)
    const c = ox * ox + oz * oz - r2

    if (a > 1e-12) {
      const disc = b * b - 4 * a * c
      if (disc >= 0) {
        const s = Math.sqrt(disc)
        const inv = 0.5 / a
        for (const t of [(-b - s) * inv, (-b + s) * inv]) {
          if (t < 0 || t > maxT) continue
          const py = o.y + d.y * t
          if (py >= y0 && py <= y1) return true
        }
      }
    } else if (c <= 0) {
      // 水平投影已在圆内：与顶底求交
      if (Math.abs(d.y) > 1e-8) {
        for (const yCap of [y0, y1]) {
          const t = (yCap - o.y) / d.y
          if (t >= 0 && t <= maxT) return true
        }
      } else if (o.y >= y0 && o.y <= y1) {
        return true
      }
    }

    if (Math.abs(d.y) > 1e-8) {
      for (const yCap of [y0, y1]) {
        const t = (yCap - o.y) / d.y
        if (t < 0 || t > maxT) continue
        const px = o.x + d.x * t - cx
        const pz = o.z + d.z * t - cz
        if (px * px + pz * pz <= r2) return true
      }
    }

    // 相机已在柱体内（贴脸）
    if (c <= 0 && o.y >= y0 && o.y <= y1) return true
    return false
  }

  /** 准星对准且 ≤ REACH_DISTANCE 才高亮选中；否则清空 */
  private updateBlockSelection() {
    // 开采/砍伐进行中：高亮锁在操作目标上（防闪），准星仍用真实命中做有效性判断
    if (this.activeAction && this.activeAction.kind !== 'build') {
      const a = this.activeAction
      const hit = this.raycastBlock(REACH_DISTANCE)
      this.selected = hit
      this.selectionMissFrames = 0
      const id = this.world.get(a.x, a.y, a.z)
      if (id === 'air' || id === 'water') {
        this.clearSelection()
        this.targetName = ''
        return
      }
      const key = this.selectionIdentity(id, a.x, a.y, a.z)
      if (key !== this.selectionKey || !this.selectionTint.visible) {
        this.selectionKey = key
        if (id === 'stone') this.showRockSelection(a.x, a.y, a.z)
        else if (id === 'shrub') this.showShrubSelection(a.x, a.y, a.z)
        else if (id === 'wood' || id === 'leaves' || id === 'plank') {
          this.showTreeSelection(a.x, a.y, a.z)
        } else this.showSelectionTint([{ x: a.x, y: a.y, z: a.z }])
      }
      this.refreshTargetLabel()
      return
    }

    const hit = this.raycastBlock(REACH_DISTANCE)

    if (this.buildMode) {
      this.selected = hit
      this.clearSelection()
      this.refreshTargetLabel()
      this.updateGhostPreview(this.selected)
      return
    }

    this.hideGhostPreview()
    if (!hit) {
      this.selectionMissFrames++
      this.pendingSelectKey = ''
      this.pendingSelectFrames = 0
      // 短时未命中不立刻清高亮，避免站石顶/微抖导致闪烁
      if (this.selectionMissFrames > 12) {
        this.clearSelection()
        this.selected = null
        this.targetName = ''
      }
      return
    }

    this.selectionMissFrames = 0
    const { x, y, z } = hit.hit
    const id = this.world.get(x, y, z)
    const key = this.selectionIdentity(id, x, y, z)

    if (key === this.selectionKey && this.selectionTint.visible) {
      this.selected = hit
      this.pendingSelectKey = ''
      this.pendingSelectFrames = 0
      this.refreshTargetLabel()
      return
    }

    // 切换目标需连续确认，避免石/草边缘每帧来回闪
    if (key === this.pendingSelectKey) this.pendingSelectFrames++
    else {
      this.pendingSelectKey = key
      this.pendingSelectFrames = 1
    }
    // 石头切换更稳一点（上方边缘易抖）
    const need = this.selectionKey ? (id === 'stone' || this.selectionKey.startsWith('stone:') ? 4 : 3) : 1
    if (this.pendingSelectFrames < need) return

    this.selected = hit
    this.selectionKey = key
    this.pendingSelectKey = ''
    this.pendingSelectFrames = 0

    // 风格化物体：高亮贴合造型，不用方块套
    if (id === 'stone') {
      this.showRockSelection(x, y, z)
      this.refreshTargetLabel()
      return
    }
    if (id === 'shrub') {
      this.showShrubSelection(x, y, z)
      this.refreshTargetLabel()
      return
    }
    if (id === 'wood' || id === 'leaves' || id === 'plank') {
      this.showTreeSelection(x, y, z)
      this.refreshTargetLabel()
      return
    }

    this.showSelectionTint([{ x, y, z }])
    this.refreshTargetLabel()
  }

  private selectionIdentity(id: BlockId, x: number, y: number, z: number) {
    if (id === 'stone') {
      const info = this.world.rockDrawInfo(x, y, z)
      if (info) return `stone:${info.x},${info.y},${info.z}:${info.size}`
      return `stone:${x},${y},${z}`
    }
    if (id === 'wood' || id === 'leaves' || id === 'plank') {
      const tree = this.world.treeCellsAt(x, y, z)
      if (tree?.length) {
        const t0 = tree[0]
        return `tree:${t0.x},${t0.y},${t0.z}:${tree.length}`
      }
    }
    return `${id}:${x},${y},${z}`
  }

  private hideSelectionTint() {
    this.selectionTint.visible = false
    for (const m of this.selectionTintMeshes) m.visible = false
    if (this.selectionShapeMesh) this.selectionShapeMesh.visible = false
    // 注意：不在此处清空 selectionKey，避免抖动时反复销毁/重建高亮
  }

  private clearSelection() {
    this.hideSelectionTint()
    this.selectionKey = ''
  }

  private hideCubeSelectionMeshes() {
    for (const m of this.selectionTintMeshes) m.visible = false
  }

  private buffersToSelectionGeo(
    pos: number[],
    idx: number[]
  ): THREE.BufferGeometry | null {
    if (!pos.length || !idx.length) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeBoundingBox()
    return geo
  }

  /** 造型高亮：顶点保持世界坐标，避免平移/缩放把位置弄偏 */
  private setSelectionShape(geo: THREE.BufferGeometry) {
    this.hideCubeSelectionMeshes()
    if (!this.selectionShapeMesh) {
      this.selectionShapeMesh = new THREE.Mesh(geo, this.selectionTintMat)
      this.selectionShapeMesh.frustumCulled = false
      this.selectionShapeMesh.renderOrder = 10
      this.selectionTint.add(this.selectionShapeMesh)
    } else {
      this.selectionShapeMesh.geometry.dispose()
      this.selectionShapeMesh.geometry = geo
    }
    this.selectionShapeMesh.position.set(0, 0, 0)
    this.selectionShapeMesh.rotation.set(0, 0, 0)
    this.selectionShapeMesh.scale.set(1, 1, 1)
    this.selectionShapeMesh.visible = true
    this.selectionTint.visible = true
  }

  private showRockSelection(x: number, y: number, z: number) {
    const info = this.world.rockDrawInfo(x, y, z)
    if (!info) {
      this.showSelectionTint([{ x, y, z }])
      return
    }

    const pos: number[] = []
    const nor: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const tmp = new THREE.Color()
    pushStylizedRock(pos, nor, col, idx, 0, info.x, info.y, info.z, info.size, tmp)
    const geo = this.buffersToSelectionGeo(pos, idx)
    if (!geo) {
      this.showSelectionTint([{ x, y, z }])
      return
    }
    this.setSelectionShape(geo)
  }

  private showShrubSelection(x: number, y: number, z: number) {
    const pos: number[] = []
    const nor: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const tmp = new THREE.Color()
    pushStylizedShrub(pos, nor, col, idx, 0, x, y, z, 0, tmp)
    const geo = this.buffersToSelectionGeo(pos, idx)
    if (!geo) {
      this.showSelectionTint([{ x, y, z }])
      return
    }
    this.setSelectionShape(geo)
  }

  private showTreeSelection(x: number, y: number, z: number) {
    const cells = this.world.treeCellsAt(x, y, z)
    if (!cells?.length) {
      this.showSelectionTint([{ x, y, z }])
      return
    }
    const pos: number[] = []
    const nor: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const tmp = new THREE.Color()
    let v = 0
    for (const c of cells) {
      const bid = this.world.get(c.x, c.y, c.z)
      if (bid === 'wood' || bid === 'plank') {
        v = pushWoodCylinder(pos, nor, col, idx, v, c.x, c.y, c.z, this.world, tmp)
      } else if (bid === 'leaves') {
        const exposed =
          this.world.get(c.x + 1, c.y, c.z) === 'air' ||
          this.world.get(c.x - 1, c.y, c.z) === 'air' ||
          this.world.get(c.x, c.y + 1, c.z) === 'air' ||
          this.world.get(c.x, c.y - 1, c.z) === 'air' ||
          this.world.get(c.x, c.y, c.z + 1) === 'air' ||
          this.world.get(c.x, c.y, c.z - 1) === 'air'
        v = pushLeafCluster(pos, nor, col, idx, v, c.x, c.y, c.z, tmp, exposed, 0)
      }
    }
    const geo = this.buffersToSelectionGeo(pos, idx)
    if (!geo) {
      this.showSelectionTint(cells)
      return
    }
    this.setSelectionShape(geo)
  }

  private hideGhostPreview() {
    this.ghostPreview.visible = false
    for (const m of this.ghostMeshes) m.visible = false
  }

  private updateGhostPreview(
    hit: {
      hit: { x: number; y: number; z: number }
      place: { x: number; y: number; z: number } | null
      face: { x: number; y: number; z: number }
    } | null
  ) {
    if (!hit?.place || !this.matArmed) {
      this.hideGhostPreview()
      return
    }
    const cells = this.buildCells(
      { x: hit.place.x, y: hit.place.y, z: hit.place.z },
      hit.face,
      this.buildShape
    )
    if (!cells.length) {
      this.hideGhostPreview()
      return
    }

    const block = MATERIAL_BLOCK[this.buildMaterial]
    const faceColor = BLOCK_FACES[block as Exclude<BlockId, 'air'>]
    if (faceColor) {
      this.ghostMatOk.color.setHex(faceColor.side)
    } else {
      this.ghostMatOk.color.setHex(0x7ee7a0)
    }

    const cost = SHAPE_COST[this.buildShape]
    const have = this.inventory?.[this.buildMaterial] || 0
    const enough = have >= cost

    while (this.ghostMeshes.length < cells.length) {
      const mesh = new THREE.Mesh(this.ghostGeo, this.ghostMatOk)
      mesh.frustumCulled = false
      mesh.renderOrder = 11
      this.ghostPreview.add(mesh)
      this.ghostMeshes.push(mesh)
    }

    let anyOk = false
    for (let i = 0; i < this.ghostMeshes.length; i++) {
      const mesh = this.ghostMeshes[i]
      if (i < cells.length) {
        const c = cells[i]
        const ok =
          enough &&
          this.world.get(c.x, c.y, c.z) === 'air' &&
          !this.overlapsPlayer(c.x, c.y, c.z)
        if (ok) anyOk = true
        mesh.visible = true
        mesh.material = ok ? this.ghostMatOk : this.ghostMatBad
        mesh.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5)
      } else {
        mesh.visible = false
      }
    }
    this.ghostPreview.visible = anyOk || cells.length > 0
  }

  private showSelectionTint(cells: { x: number; y: number; z: number }[]) {
    if (this.selectionShapeMesh) this.selectionShapeMesh.visible = false
    while (this.selectionTintMeshes.length < cells.length) {
      const mesh = new THREE.Mesh(this.selectionTintGeo, this.selectionTintMat)
      mesh.frustumCulled = false
      mesh.renderOrder = 10
      this.selectionTint.add(mesh)
      this.selectionTintMeshes.push(mesh)
    }
    for (let i = 0; i < this.selectionTintMeshes.length; i++) {
      const mesh = this.selectionTintMeshes[i]
      if (i < cells.length) {
        const c = cells[i]
        mesh.visible = true
        mesh.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5)
        mesh.scale.set(1, 1, 1)
      } else {
        mesh.visible = false
      }
    }
    this.selectionTint.visible = true
  }

  /**
   * 玩家 AABB 是否与固体相交。
   * py 为相机/眼睛高度。
   */
  private bodyCollides(px: number, py: number, pz: number) {
    // 脚底略抬，避免贴地整数高度时 floor(y0) 吃进地面方块
    const y0 = py - this.eyeHeight + 0.02
    const y1 = y0 + this.bodyHeight - 1e-4
    const x0 = px - PLAYER_HALF_W
    const x1 = px + PLAYER_HALF_W
    const z0 = pz - PLAYER_HALF_W
    const z1 = pz + PLAYER_HALF_W
    const i0 = Math.floor(x0)
    const i1 = Math.floor(x1 - 1e-6)
    const j0 = Math.floor(y0)
    const j1 = Math.floor(y1 - 1e-6)
    const k0 = Math.floor(z0)
    const k1 = Math.floor(z1 - 1e-6)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (let k = k0; k <= k1; k++) {
          if (this.world.solid(i, j, k)) return true
        }
      }
    }
    // 天然石：按造型圆柱挡路（比整格小，可走近）
    if (this.collidesNaturalRocks(px, y0, y1, pz)) return true
    // 树干：按圆筒半径，避免 1×1 方块提前顶住
    if (this.collidesWoodTrunks(px, y0, y1, pz)) return true
    return false
  }

  /** 与视觉石头大致匹配的水平半径 / 高度 */
  private naturalRockRadius(size: number) {
    // 大石略放大，避免贴着模型穿模
    return size === 1 ? 0.32 : size === 2 ? 0.62 : 0.92
  }

  private naturalRockHeight(size: number) {
    // size1 矮：可走过去；size≥2 约一人高，需跳跃
    return size === 1 ? 0.4 : size === 2 ? 1.28 : 1.58
  }

  private collidesNaturalRocks(px: number, y0: number, y1: number, pz: number) {
    const ix = Math.floor(px)
    const iz = Math.floor(pz)
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const sx = ix + dx
        const sz = iz + dz
        const feat = this.world.featureBaseY(sx, sz)
        const size = this.world.naturalRockAnchorSize(sx, feat, sz)
        if (size == null) continue
        // 小石不挡路，可直接走过去
        if (size <= 1) continue
        const rockBot = feat
        const rockTop = feat + this.naturalRockHeight(size)
        // 已站上石顶：不挡；余量收紧，避免「抬半格就穿石」
        if (y0 >= rockTop - 0.04) continue
        if (y1 <= rockBot + 0.02) continue
        const cx = sx + 0.5
        const cz = sz + 0.5
        const radius = this.naturalRockRadius(size)
        const nx = Math.max(px - PLAYER_HALF_W, Math.min(cx, px + PLAYER_HALF_W))
        const nz = Math.max(pz - PLAYER_HALF_W, Math.min(cz, pz + PLAYER_HALF_W))
        const ddx = nx - cx
        const ddz = nz - cz
        if (ddx * ddx + ddz * ddz < radius * radius) return true
      }
    }
    return false
  }

  private collidesWoodTrunks(px: number, y0: number, y1: number, pz: number) {
    const ix = Math.floor(px)
    const iz = Math.floor(pz)
    const r = WOOD_TRUNK_R + 0.02
    const r2 = r * r
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const sx = ix + dx
        const sz = iz + dz
        let trunkLo = Infinity
        let trunkHi = -Infinity
        const feat = this.world.featureBaseY(sx, sz)
        for (let y = feat; y <= feat + 12; y++) {
          if (this.world.get(sx, y, sz) !== 'wood') continue
          const stacked =
            this.world.get(sx, y + 1, sz) === 'wood' || this.world.get(sx, y - 1, sz) === 'wood'
          if (!stacked && y > feat + 1) continue
          trunkLo = Math.min(trunkLo, y)
          trunkHi = Math.max(trunkHi, y + 1)
        }
        if (trunkHi < trunkLo) continue
        // 脚已在树干顶之上：不挡
        if (y0 >= trunkHi - 0.06) continue
        if (y1 <= trunkLo + 0.02) continue
        if (y1 <= trunkLo || y0 >= trunkHi) continue
        const cx = sx + 0.5
        const cz = sz + 0.5
        const nx = Math.max(px - PLAYER_HALF_W, Math.min(cx, px + PLAYER_HALF_W))
        const nz = Math.max(pz - PLAYER_HALF_W, Math.min(cz, pz + PLAYER_HALF_W))
        const ddx = nx - cx
        const ddz = nz - cz
        if (ddx * ddx + ddz * ddz < r2) return true
      }
    }
    return false
  }

  /** 脚下支撑面高度（固体顶），自脚位向下搜索 */
  private supportTopY(px: number, feetY: number, pz: number) {
    const i0 = Math.floor(px - PLAYER_HALF_W)
    const i1 = Math.floor(px + PLAYER_HALF_W - 1e-6)
    const k0 = Math.floor(pz - PLAYER_HALF_W)
    const k1 = Math.floor(pz + PLAYER_HALF_W - 1e-6)
    const j0 = Math.floor(feetY - 0.001)
    let best: number | null = null
    for (let j = j0; j >= j0 - 3; j--) {
      for (let i = i0; i <= i1; i++) {
        for (let k = k0; k <= k1; k++) {
          if (this.world.solid(i, j, k)) {
            const top = j + 1
            best = best == null ? top : Math.max(best, top)
          }
        }
      }
    }
    const rockTop = this.naturalRockSupportTop(px, feetY, pz)
    if (rockTop != null) best = best == null ? rockTop : Math.max(best, rockTop)
    return best
  }

  /** 脚附近可站立的天然石顶面（跳上大石后可站稳） */
  private naturalRockSupportTop(px: number, feetY: number, pz: number): number | null {
    const ix = Math.floor(px)
    const iz = Math.floor(pz)
    let best: number | null = null
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const sx = ix + dx
        const sz = iz + dz
        const feat = this.world.featureBaseY(sx, sz)
        const size = this.world.naturalRockAnchorSize(sx, feat, sz)
        if (size == null) continue
        const top = feat + this.naturalRockHeight(size)
        if (top > feetY + 0.35 || top < feetY - 1.8) continue
        const cx = sx + 0.5
        const cz = sz + 0.5
        const radius = this.naturalRockRadius(size) * (size <= 1 ? 0.85 : 0.9)
        const nx = Math.max(px - PLAYER_HALF_W, Math.min(cx, px + PLAYER_HALF_W))
        const nz = Math.max(pz - PLAYER_HALF_W, Math.min(cz, pz + PLAYER_HALF_W))
        const ddx = nx - cx
        const ddz = nz - cz
        if (ddx * ddx + ddz * ddz >= radius * radius) continue
        best = best == null ? top : Math.max(best, top)
      }
    }
    return best
  }

  getGroundY(x: number, z: number) {
    const sy = this.world.surfaceHeight(x, z)
    for (let y = sy + FEATURE_HEADROOM + 2; y >= 0; y--) {
      if (this.world.solid(x, y, z)) return y + 1
    }
    const fx = Math.floor(x)
    const fz = Math.floor(z)
    if (this.world.get(fx, sy, fz) === 'water') {
      return sy
    }
    return sy + 1
  }

  /** 人机站立高度：跟随当地地表 */
  getNpcStandY(x?: number, z?: number) {
    const px = x ?? this.camera.position.x
    const pz = z ?? this.camera.position.z
    return this.getGroundY(px, pz)
  }

  /**
   * 人机可行走：平地、无水体；脚/躯干高度无固体（树干、灌木、石、墙）。
   * 用小脚印多点检测，避免贴树干中心格「可行」实际身体卡住。
   */
  isNpcWalkable(x: number, z: number): boolean {
    const pads: [number, number][] = [
      [0, 0],
      [0.32, 0],
      [-0.32, 0],
      [0, 0.32],
      [0, -0.32],
    ]
    for (const [ox, oz] of pads) {
      if (!this.npcCellClear(x + ox, z + oz)) return false
    }
    return true
  }

  private npcCellClear(x: number, z: number): boolean {
    const fx = Math.floor(x)
    const fz = Math.floor(z)
    if (this.world.isCreek(fx, fz)) return false
    const sy = this.world.surfaceHeight(fx, fz)
    const floor = this.world.get(fx, sy, fz)
    if (floor === 'water' || floor === 'air') return false
    for (let y = sy + 1; y <= sy + 2; y++) {
      if (this.world.solid(fx, y, fz)) return false
    }
    // 天然石 / 树干造型碰撞（与玩家一致）
    const y0 = sy + 1
    const y1 = sy + 1.7
    if (this.collidesNaturalRocks(x, y0, y1, z)) return false
    if (this.collidesWoodTrunks(x, y0, y1, z)) return false
    return true
  }

  /** 附近是否有玩家建造的房屋/墙体 */
  isPlayerStructureNear(x: number, z: number, radius = 5): boolean {
    const r = Math.max(1, Math.ceil(radius))
    const cx = Math.floor(x)
    const cz = Math.floor(z)
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (this.world.looksLikePlayerBuild(cx + dx, cz + dz)) return true
      }
    }
    return false
  }

  /**
   * 水平移动（分轴）：体型碰撞防穿墙。
   * 台阶 / 一格高坎不自动上台，需跳跃过去。
   */
  private tryMoveAxis(axis: 'x' | 'z', next: number) {
    const ox = this.camera.position.x
    const oy = this.camera.position.y
    const oz = this.camera.position.z
    const nx = axis === 'x' ? next : ox
    const nz = axis === 'z' ? next : oz

    if (!this.bodyCollides(nx, oy, nz)) {
      if (axis === 'x') this.camera.position.x = next
      else this.camera.position.z = next
    }
  }

  /** 卡进造型/方块时脱出：先抬到石顶，再大步水平挤出 */
  private unstuck() {
    const y = this.camera.position.y
    const baseX = this.camera.position.x
    const baseZ = this.camera.position.z
    const feet = y - this.eyeHeight

    // 1) 卡在石头里：抬到石顶站稳
    const rockTop = this.naturalRockSupportTop(baseX, feet + 0.8, baseZ)
    if (rockTop != null) {
      const ey = rockTop + this.eyeHeight + 0.02
      if (!this.bodyCollides(baseX, ey, baseZ)) {
        this.camera.position.y = ey
        this.velocityY = 0
        this.onGround = true
        return
      }
    }

    // 2) 水平脱出（大石半径较大，步进要够）
    const offsets = [0.08, 0.16, 0.28, 0.45, 0.7, 1.0, 1.35]
    for (const d of offsets) {
      for (const [dx, dz] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d],
        [d, d],
        [d, -d],
        [-d, d],
        [-d, -d],
      ] as const) {
        const nx = baseX + dx
        const nz = baseZ + dz
        if (!this.bodyCollides(nx, y, nz)) {
          this.camera.position.x = nx
          this.camera.position.z = nz
          return
        }
        const sup = this.supportTopY(nx, feet + 0.5, nz)
        if (sup != null) {
          const ey = sup + this.eyeHeight + 0.02
          if (!this.bodyCollides(nx, ey, nz)) {
            this.camera.position.x = nx
            this.camera.position.z = nz
            this.camera.position.y = ey
            this.velocityY = 0
            this.onGround = true
            return
          }
        }
      }
    }

    const support = this.supportTopY(baseX, feet + 1.2, baseZ)
    if (support != null) {
      const ey = support + this.eyeHeight + 0.02
      if (!this.bodyCollides(baseX, ey, baseZ)) {
        this.camera.position.y = ey
        this.velocityY = 0
        this.onGround = true
      }
    }
  }

  /**
   * 昼夜：白天 50 分钟（含黎明/黄昏各 1 分钟）+ 黑夜 10 分钟。
   * 黑夜保留环境光，避免伸手不见五指。
   */
  private applyDayNight() {
    const { dayness } = sampleDayNight()
    const d = dayness

    this.bgColor.copy(this.nightBg).lerp(this.dayBg, d)
    this.scene.background = this.bgColor
    this.renderer.setClearColor(this.bgColor, 1)

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.nightFog).lerp(this.dayFog, d)
    }

    this.hemiLight.color.copy(this.nightHemiSky).lerp(this.dayHemiSky, d)
    this.hemiLight.groundColor.copy(this.nightHemiGround).lerp(this.dayHemiGround, d)
    this.hemiLight.intensity = 0.42 + 0.48 * d

    this.sunLight.color.copy(this.nightSunColor).lerp(this.daySunColor, d)
    this.sunLight.intensity = 0.22 + 0.98 * d

    this.ambientLight.color.copy(this.nightAmbient).lerp(this.dayAmbient, d)
    this.ambientLight.intensity = 0.24 + 0.08 * d

    this.sky.setDayness(d)
  }

  private update(dt: number) {
    this.consumeLookBuffer(dt)
    this.tickCrouch(dt)

    let forwardAmt = this.moveForward
    let strafeAmt = this.moveStrafe
    if (this.keys.has('KeyW')) forwardAmt += 1
    if (this.keys.has('KeyS')) forwardAmt -= 1
    if (this.keys.has('KeyD')) strafeAmt += 1
    if (this.keys.has('KeyA')) strafeAmt -= 1
    forwardAmt = Math.max(-1, Math.min(1, forwardAmt))
    strafeAmt = Math.max(-1, Math.min(1, strafeAmt))

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const move = new THREE.Vector3()
    move.addScaledVector(forward, forwardAmt)
    move.addScaledVector(right, strafeAmt)

    const moveLen = move.length()
    const moveStrength = Math.min(1, moveLen)
    this.movingThisFrame = moveStrength > 0.12 || !this.onGround
    // 走动/跳跃打断挖、砍、开采等进行中的操作
    if (this.activeAction && (moveStrength > 0.12 || this.jumpQueued || this.keys.has('Space'))) {
      this.cancelAction()
    }
    if (moveLen > 1e-4) {
      this.moveHintX = move.x / moveLen
      this.moveHintZ = move.z / moveLen
      if (this.mountQueue.length) this.mountSortDirty = true
      const speedMul = this.combatSlow ? 0.45 : 1
      const speed = (1.4 + moveStrength * 2.6) * speedMul
      move.multiplyScalar((speed * dt) / moveLen)
      this.tryMoveAxis('x', this.camera.position.x + move.x)
      this.tryMoveAxis('z', this.camera.position.z + move.z)
    } else {
      // 站立转视角：按视线预取，快速甩镜头时优先铺朝向那边的地
      this.moveHintX = -Math.sin(this.yaw)
      this.moveHintZ = -Math.cos(this.yaw)
    }

    // 视线转过一定角度：重排挂载队列并多冲一波，减少镂空
    const lookDot = this.moveHintX * this.lookHintX + this.moveHintZ * this.lookHintZ
    if (lookDot < 0.93) {
      this.lookHintX = this.moveHintX
      this.lookHintZ = this.moveHintZ
      this.mountSortDirty = true
      if (!this.deploy?.active && this.mountQueue.length) {
        this.flushMountQueue(2)
      }
    }

    const wantJump = this.jumpQueued || this.keys.has('Space')
    this.jumpQueued = false

    const wasGround = this.wasOnGround
    const px = this.camera.position.x
    const pz = this.camera.position.z

    if (this.deploy?.active) {
      // 准备舱：可跳可蹲，落地回舱面；水平由 tickDeploy 钳制
      const padY = this.deploy.padY
      if (wantJump && this.onGround) {
        this.velocityY = 7.8
        this.onGround = false
        this.jumpStartY = this.camera.position.y - this.eyeHeight
        this.audio?.play('jump')
      }
      if (!this.onGround) {
        this.airTime += dt
        this.fallPeakSpeed = Math.max(this.fallPeakSpeed, -this.velocityY)
      }
      if (this.onGround && this.velocityY <= 0) {
        this.velocityY = 0
        this.camera.position.y = padY + 0.02 + this.eyeHeight
        this.onGround = true
      } else {
        this.velocityY -= 20 * dt
        const nextY = this.camera.position.y + this.velocityY * dt
        const feet = nextY - this.eyeHeight
        if (this.velocityY <= 0 && feet <= padY + 0.02) {
          this.camera.position.y = padY + 0.02 + this.eyeHeight
          this.velocityY = 0
          this.onGround = true
        } else {
          this.camera.position.y = nextY
          this.onGround = false
        }
      }
      if (this.onGround && !wasGround) {
        this.audio?.play(this.audio.landForSurface('stone'), { volume: 0.55 })
        this.airTime = 0
        this.fallPeakSpeed = 0
      }
    } else {
      if (wantJump && this.onGround) {
        this.velocityY = 7.8
        this.onGround = false
        this.jumpStartY = this.camera.position.y - this.eyeHeight
        this.audio?.play('jump')
      }

      if (!this.onGround) {
        this.airTime += dt
        this.fallPeakSpeed = Math.max(this.fallPeakSpeed, -this.velocityY)
      }

      // 贴地时锁在支撑面上，避免每帧重力微陷 → 弹回 → 抖动/高亮闪
      if (this.onGround && this.velocityY <= 0) {
        this.velocityY = 0
        const feet = this.camera.position.y - this.eyeHeight
        const support = this.supportTopY(px, feet + 0.12, pz)
        if (support != null && feet - support < 0.2 && feet - support > -0.15) {
          this.camera.position.y = support + 0.02 + this.eyeHeight
          this.onGround = true
        } else {
          this.onGround = false
        }
      } else {
        this.velocityY -= 20 * dt
        const nextY = this.camera.position.y + this.velocityY * dt

        if (this.velocityY <= 0) {
          if (!this.bodyCollides(px, nextY, pz)) {
            this.camera.position.y = nextY
            const feet = this.camera.position.y - this.eyeHeight
            const support = this.supportTopY(px, feet, pz)
            this.onGround =
              support != null && feet - support < 0.1 && feet - support >= -0.05
            if (this.onGround && support != null) {
              this.camera.position.y = support + 0.02 + this.eyeHeight
              this.velocityY = 0
            }
          } else {
            const feet = nextY - this.eyeHeight
            const support = this.supportTopY(px, feet + 0.5, pz)
            if (support != null) {
              this.camera.position.y = support + 0.02 + this.eyeHeight
              this.velocityY = 0
              this.onGround = true
            } else {
              this.velocityY = 0
              this.onGround = false
            }
          }
        } else {
          if (!this.bodyCollides(px, nextY, pz)) {
            this.camera.position.y = nextY
          } else {
            this.velocityY = 0
          }
          this.onGround = false
        }
      }

      if (this.onGround && !wasGround) {
        this.playLandingSfx(px, pz)
        this.airTime = 0
        this.fallPeakSpeed = 0
      }
    }
    if (this.onGround) {
      this.airTime = 0
      this.fallPeakSpeed = 0
    }
    this.wasOnGround = this.onGround

    // 仅真正卡住时脱出；贴地微重叠只回贴支撑，避免左右甩镜头
    if (
      !this.deploy?.active &&
      this.bodyCollides(this.camera.position.x, this.camera.position.y, this.camera.position.z)
    ) {
      if (this.onGround) {
        const feet = this.camera.position.y - this.eyeHeight
        const support = this.supportTopY(px, feet + 0.2, pz)
        if (support != null) {
          this.camera.position.y = support + 0.02 + this.eyeHeight
        } else {
          this.unstuck()
        }
      } else {
        this.unstuck()
      }
    }

    this.applyCameraRotation()

    this.body.setHoldingAxe(this.tool === 'axe')
    this.body.update(dt, moveStrength, moveStrength > 0.85, this.pitch, this.crouching)
    const surface = this.getSurfaceUnder(this.camera.position.x, this.camera.position.z)
    this.audio?.tickLocalFoot(dt, moveStrength, moveStrength > 0.85, this.onGround, surface)

    this.tickAction(dt)
    this.debris.update(dt)
    this.creekFlow.update(dt, this.world, this.camera.position.x, this.camera.position.z)
    this.refreshTargetLabel()

    this.sky.update(dt, this.camera.position)
    this.sunLight.position.copy(this.sky.getSunPosition())
    this.applyDayNight()

    this.streamTimer += dt
    if (this.streamTimer > 0.15) {
      this.streamTimer = 0
      this.streamChunks()
    }
    if (this.deploy?.active) {
      this.tickDeploy(dt)
      this.flushMountQueue(GameEngine.DEPLOY_MOUNT_PER_FRAME)
      this.flushRebuildQueue()
    } else {
      // 先挂新块（走路前沿），再刷 LOD 重建；单帧有时间预算
      this.flushMountQueue(GameEngine.MOUNT_PER_FRAME)
      this.flushRebuildQueue()
    }

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

    // 准星隔帧更新，省 DDA；转向/移动时仍够跟手
    this.selectFrame++
    if (this.selectFrame % 2 === 0) this.updateBlockSelection()
    this.onFrame?.(dt)
  }

  setSpawn(x: number, y: number, z: number, yaw = 0, pitch = -0.25) {
    // 出生点拉到小溪旁平坦草坪
    const gx = Number.isFinite(x) ? x : 2
    const gz = Number.isFinite(z) ? z : 10
    const gy = this.getGroundY(gx, gz) + this.eyeHeight
    this.camera.position.set(gx, Math.max(y, gy), gz)
    this.yaw = yaw
    this.pitch = Math.max(-1.05, Math.min(0.95, pitch))
    this.applyCameraRotation()
    this.streamFocusX = Number.NaN
    this.streamFocusZ = Number.NaN
    this.streamChunks(true)
  }

  get deploying() {
    return Boolean(this.deploy?.active)
  }

  /**
   * 进服准备舱：落点上空平台 + 空气墙；倒计时到点投下。
   * 组队时可指定 cabinX/Z 与 partySlot，多人同舱错位站立。
   */
  beginDeploy(
    dest: { x: number; y: number; z: number; yaw?: number; pitch?: number },
    opts?: {
      durationSec?: number
      cabinX?: number
      cabinZ?: number
      partySlot?: number
      onProgress?: (remain: number, timeProgress: number) => void
      onComplete?: () => void
    }
  ) {
    this.clearDeployPad()
    const dropX = Number.isFinite(dest.x) ? dest.x : 2
    const dropZ = Number.isFinite(dest.z) ? dest.z : 10
    const cabinX = Number.isFinite(opts?.cabinX) ? Number(opts!.cabinX) : dropX
    const cabinZ = Number.isFinite(opts?.cabinZ) ? Number(opts!.cabinZ) : dropZ
    const groundY = this.getGroundY(cabinX, cabinZ)
    const dropGroundY = this.getGroundY(dropX, dropZ)
    const dy = Math.max(Number(dest.y) || 0, dropGroundY + this.eyeHeight)
    const padY = groundY + DEPLOY_PAD_HEIGHT
    const group = this.buildDeployPad(cabinX, padY, cabinZ)
    this.scene.add(group)

    const slot = Math.max(0, Math.floor(Number(opts?.partySlot) || 0))
    const ang = (slot * 1.85) % (Math.PI * 2)
    const rad = slot === 0 ? 0.4 : 1.4 + (slot % 3) * 0.45
    const startX = cabinX + Math.cos(ang) * rad
    const startZ = cabinZ + Math.sin(ang) * rad

    const duration = opts?.durationSec ?? DEPLOY_DURATION_SEC
    const warmTasks = buildDeployWarmTasks(this.audio)
    this.deploy = {
      active: true,
      group,
      padY,
      cx: cabinX,
      cz: cabinZ,
      dest: {
        x: dropX,
        y: dy,
        z: dropZ,
        yaw: dest.yaw ?? 0,
        pitch: dest.pitch ?? -0.25,
      },
      remain: duration,
      duration,
      endsAt: performance.now() + duration * 1000,
      lastUiAt: 0,
      lastStreamAt: 0,
      lastTickSec: -1,
      warmTasks,
      warmDone: 0,
      warmLabel: warmTasks[0]?.label || '就绪',
      onProgress: opts?.onProgress,
      onComplete: opts?.onComplete,
    }

    // 人在舱里：图按舱心刷；落点另圈在 streamChunks 里并铺
    this.streamFocusX = cabinX
    this.streamFocusZ = cabinZ
    this.camera.position.set(startX, padY + this.eyeHeight, startZ)
    this.yaw = this.deploy.dest.yaw
    this.pitch = Math.max(-1.05, Math.min(0.95, this.deploy.dest.pitch))
    this.velocityY = 0
    this.onGround = true
    this.applyCameraRotation()
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = 20
      this.scene.fog.far = CHUNK_SIZE * DEPLOY_STREAM_RADIUS + 48
    }
    this.streamChunks(true)
    this.flushMountQueue(GameEngine.DEPLOY_MOUNT_PER_FRAME)
    this.deploy.onProgress?.(this.deploy.remain, 0)
  }

  /** 准备舱资源预热进度 0..1 */
  getDeployWarmProgress() {
    const d = this.deploy
    if (!d?.warmTasks.length) return 1
    return Math.min(1, d.warmDone / d.warmTasks.length)
  }

  getDeployWarmLabel() {
    return this.deploy?.warmLabel || ''
  }

  private buildDeployPad(cx: number, padY: number, cz: number) {
    const g = new THREE.Group()
    g.name = 'deploy-pad'
    const half = DEPLOY_PAD_HALF
    const size = half * 2

    // 舱底板：Basic 材质，不受昼夜光照影响，避免夜里发黑
    const deckMat = new THREE.MeshBasicMaterial({
      color: 0x7a92a8,
      toneMapped: false,
    })
    const deck = new THREE.Mesh(new THREE.BoxGeometry(size, 0.14, size), deckMat)
    deck.position.set(cx, padY - 0.07, cz)
    g.add(deck)

    // 中心踏步区：略亮银灰
    const inset = size * 0.7
    const insetMat = new THREE.MeshBasicMaterial({
      color: 0xa8bcc8,
      toneMapped: false,
    })
    const insetMesh = new THREE.Mesh(new THREE.BoxGeometry(inset, 0.05, inset), insetMat)
    insetMesh.position.set(cx, padY + 0.01, cz)
    g.add(insetMesh)

    // 舱面浅色网格线（可读性）
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0xc5d8e6,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      toneMapped: false,
    })
    const gridStep = 1.1
    for (let i = -4; i <= 4; i++) {
      const o = i * gridStep
      if (Math.abs(o) > half - 0.2) continue
      const gh = new THREE.Mesh(new THREE.BoxGeometry(size * 0.92, 0.012, 0.035), gridMat)
      gh.position.set(cx, padY + 0.028, cz + o)
      g.add(gh)
      const gv = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, size * 0.92), gridMat)
      gv.position.set(cx + o, padY + 0.028, cz)
      g.add(gv)
    }

    // 舱面导光环
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9ae0ff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const ring = new THREE.Mesh(new THREE.RingGeometry(half * 0.78, half * 0.9, 48), ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(cx, padY + 0.035, cz)
    g.add(ring)

    // 十字定位线
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xd2f2ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    })
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(inset * 0.92, 0.02, 0.06), lineMat)
    crossH.position.set(cx, padY + 0.04, cz)
    g.add(crossH)
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, inset * 0.92), lineMat)
    crossV.position.set(cx, padY + 0.04, cz)
    g.add(crossV)

    // 四周可见空气墙（半透明亮边）
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x9ad8f5,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
    const edge = new THREE.MeshBasicMaterial({
      color: 0xd8f4ff,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
    const thick = 0.07
    const walls: { w: number; d: number; x: number; z: number }[] = [
      { w: size + thick * 2, d: thick, x: cx, z: cz + half },
      { w: size + thick * 2, d: thick, x: cx, z: cz - half },
      { w: thick, d: size, x: cx + half, z: cz },
      { w: thick, d: size, x: cx - half, z: cz },
    ]
    for (const w of walls) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(w.w, DEPLOY_WALL_H, w.d),
        wallMat
      )
      panel.position.set(w.x, padY + DEPLOY_WALL_H * 0.5, w.z)
      g.add(panel)
      const lip = new THREE.Mesh(
        new THREE.BoxGeometry(w.w, 0.06, w.d + 0.02),
        edge
      )
      lip.position.set(w.x, padY + DEPLOY_WALL_H, w.z)
      g.add(lip)
    }
    return g
  }

  private clearDeployPad() {
    if (!this.deploy) return
    this.scene.remove(this.deploy.group)
    const seen = new Set<THREE.Material>()
    this.deploy.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        if (!mat || seen.has(mat)) continue
        seen.add(mat)
        mat.dispose()
      }
    })
    this.deploy = null
  }

  private tickDeploy(_dt: number) {
    const d = this.deploy
    if (!d?.active) return

    if (this.activeAction) this.cancelAction()

    // 只钳水平（空气墙）；跳跃/蹲下在 update 里走舱面物理
    const half = DEPLOY_PAD_HALF - 0.05
    this.camera.position.x = Math.max(d.cx - half, Math.min(d.cx + half, this.camera.position.x))
    this.camera.position.z = Math.max(d.cz - half, Math.min(d.cz + half, this.camera.position.z))

    // 分帧预热投送后模型 / 音效 / 表数据
    for (let i = 0; i < GameEngine.DEPLOY_WARM_PER_TICK; i++) {
      if (d.warmDone >= d.warmTasks.length) break
      const task = d.warmTasks[d.warmDone]
      try {
        task.run()
      } catch {
        // 单个预热失败不阻断投送
      }
      d.warmDone += 1
      d.warmLabel =
        d.warmDone >= d.warmTasks.length
          ? '资源就绪'
          : d.warmTasks[d.warmDone]?.label || '加载中'
    }

    // 墙上时钟读秒：铺图卡帧时也不会变慢（不再用被 clamp 的 dt 累加）
    d.remain = Math.max(0, (d.endsAt - performance.now()) / 1000)
    const timeProgress = d.duration > 0 ? 1 - d.remain / d.duration : 1

    // 最后 5 秒叮叮叮倒计时提示
    if (d.remain > 0 && d.remain <= 5.05) {
      const sec = Math.ceil(d.remain)
      if (sec >= 1 && sec <= 5 && sec !== d.lastTickSec) {
        d.lastTickSec = sec
        this.audio?.play('deploy_tick', {
          volume: 0.9 + (5 - sec) * 0.05,
          pitch: 1 + (5 - sec) * 0.1,
        })
      }
    } else if (d.remain <= 0 && d.lastTickSec !== 0) {
      d.lastTickSec = 0
      this.audio?.play('deploy_go', { volume: 1 })
    }

    // 定期强制复扫：提升 LOD、补落点圈
    const nowMs = performance.now()
    if (nowMs - d.lastStreamAt > 900) {
      d.lastStreamAt = nowMs
      this.streamChunks(true)
    }

    // UI 约 10Hz，避免每帧写 Vue reactive 加重舱内卡顿
    if (nowMs - d.lastUiAt > 100 || d.remain <= 0) {
      d.lastUiAt = nowMs
      d.onProgress?.(d.remain, timeProgress)
    }

    // 到点投下；期间能铺多少地图算多少
    if (d.remain <= 0) this.finishDeploy()
  }

  private finishDeploy() {
    const d = this.deploy
    if (!d?.active) return
    const dest = d.dest
    const onComplete = d.onComplete
    this.clearDeployPad()
    this.streamFocusX = Number.NaN
    this.streamFocusZ = Number.NaN
    // 恢复雾
    const fogFar =
      this.quality === 'high'
        ? CHUNK_SIZE * LOAD_RADIUS + 16
        : this.quality === 'low'
          ? CHUNK_SIZE * LOAD_RADIUS - 4
          : CHUNK_SIZE * LOAD_RADIUS + 8
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.far = fogFar
      this.scene.fog.near = this.quality === 'low' ? 28 : 38
    }
    this.setSpawn(dest.x, dest.y, dest.z, dest.yaw, dest.pitch)
    this.flushMountQueue(6)
    onComplete?.()
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
    this.camera.aspect = w / Math.max(h, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  /** 脚底地表类型（脚步/落地音） */
  getSurfaceUnder(x: number, z: number): import('./gameAudio').SurfaceKind {
    const fx = Math.floor(x)
    const fz = Math.floor(z)
    const sy = this.world.surfaceHeight(fx, fz)
    if (this.world.isCreek(fx, fz) || this.world.get(fx, sy, fz) === 'water') {
      return 'water'
    }
    const feet = this.camera.position.y - this.eyeHeight
    const support = this.supportTopY(x, feet, z)
    const y = support != null ? Math.floor(support - 0.01) : sy
    const id = this.world.get(fx, y, fz)
    if (id === 'stone' || id === 'rubble' || id === 'alloy') return 'stone'
    if (id === 'sand') return 'sand'
    if (id === 'dirt' || id === 'stump') return 'dirt'
    if (id === 'wood' || id === 'plank') return 'wood'
    if (id === 'grass' || id === 'turf' || id === 'shrub') return 'grass'
    return 'grass'
  }

  /** 到小溪中心线的水平距离（格） */
  getCreekDistance(x: number, z: number) {
    return Math.abs(z - this.world.creekCenterZ(x))
  }

  /** 小地图采样：含玩家挖放覆盖 */
  getMinimapKind(x: number, z: number): MinimapKind {
    return this.world.minimapKind(x, z)
  }

  /** 同步小队标记立体透视针 */
  setSquadMarks(marks: SquadMark[]) {
    this.squadMarks.sync(marks)
  }

  /**
   * 准星标记落点：优先命中方块（可达约 64 格），否则落到地面。
   */
  raycastMarkAim(maxDist = 64): { x: number; y: number; z: number; label: string } | null {
    const hit = this.raycastBlock(maxDist)
    if (hit) {
      const { x, y, z } = hit.hit
      const id = this.world.get(x, y, z)
      let label = BLOCK_LABEL[id] || '目标'
      if (id === 'wood' || id === 'leaves') label = '树木'
      return { x: x + 0.5, y: y + 1.15, z: z + 0.5, label }
    }

    const o = this.camera.position
    const d = this.lookDir()
    if (d.lengthSq() < 1e-8) return null

    let t: number
    if (Math.abs(d.y) > 1e-4) {
      const approxY = this.getGroundY(o.x, o.z)
      t = (approxY - o.y) / d.y
      if (t < 0.4 || t > maxDist) t = Math.min(maxDist, Math.max(8, maxDist * 0.55))
    } else {
      t = Math.min(maxDist, 32)
    }
    const x = o.x + d.x * t
    const z = o.z + d.z * t
    const gy = this.getGroundY(x, z)
    return { x, y: gy + 1.15, z, label: '地面' }
  }

  /** 落地：草坪 / 石头 / 沙 / 水 / 跳坑 */
  private playLandingSfx(px: number, pz: number) {
    if (!this.audio) return
    const feetY = this.camera.position.y - this.eyeHeight
    const drop = this.jumpStartY - feetY
    const surface = this.getSurfaceUnder(px, pz)
    if (surface === 'water') {
      this.audio.play('splash', { volume: 1.15 })
      return
    }
    if (drop > 2.2 || this.airTime > 0.55 || this.fallPeakSpeed > 9) {
      this.audio.play('fall_pit')
      this.audio.play(this.audio.landForSurface(surface), { volume: 0.7 })
      return
    }
    this.audio.play(this.audio.landForSurface(surface), {
      volume: drop > 1.2 ? 1.1 : 0.85,
    })
  }

  applyGraphics(settings: Pick<PlaySettings, 'antialias' | 'quality'>) {
    this.quality = settings.quality
    const needAa = Boolean(settings.antialias) !== this.antialiasEnabled
    if (needAa) {
      this.antialiasEnabled = Boolean(settings.antialias)
      const old = this.renderer
      old.domElement.removeEventListener('click', this.requestLock)
      const next = new THREE.WebGLRenderer({
        antialias: this.antialiasEnabled,
        powerPreference: 'high-performance',
        alpha: false,
      })
      next.setClearColor(0x87ceeb, 1)
      next.domElement.style.touchAction = 'none'
      old.domElement.replaceWith(next.domElement)
      old.dispose()
      this.renderer = next
      this.renderer.domElement.addEventListener('click', this.requestLock)
    }
    this.renderer.setPixelRatio(pixelRatioForQuality(this.quality))
    // 画质影响雾距：高清更远更清晰，流畅更近省填充
    const fogFar =
      this.quality === 'high'
        ? CHUNK_SIZE * LOAD_RADIUS + 16
        : this.quality === 'low'
          ? CHUNK_SIZE * LOAD_RADIUS - 4
          : CHUNK_SIZE * LOAD_RADIUS + 8
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.far = fogFar
      this.scene.fog.near = this.quality === 'low' ? 28 : 38
    }
    this.resize()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.cancelIdleMount()
    this.clearDeployPad()
    window.removeEventListener('resize', this.resize)
    window.visualViewport?.removeEventListener('resize', this.resize)
    window.removeEventListener('orientationchange', this.resize)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    for (const meshes of this.chunks.values()) {
      if (meshes.solid) this.chunkGroup.remove(meshes.solid)
      if (meshes.water) this.chunkGroup.remove(meshes.water)
      if (meshes.grass) this.chunkGroup.remove(meshes.grass)
      disposeChunkMeshes(meshes)
    }
    this.chunks.clear()
    this.world.clearVoxelCache()
    this.rebuildQueue.clear()
    this.mountQueue.length = 0
    this.mountQueued.clear()
    this.pendingMeshJobs.clear()
    this.inflightMesh = 0
    this.chunkGen.clear()
    if (this.meshWorker) {
      this.meshWorker.terminate()
      this.meshWorker = null
    }
    this.body.dispose()
    this.debris.dispose()
    this.creekFlow.dispose()
    this.scene.remove(this.creekFlow.points)
    this.notch.dispose()
    this.crack.dispose()
    this.hideSelectionTint()
    this.hideGhostPreview()
    this.squadMarks.dispose()
    this.scene.remove(this.squadMarks.group)
    this.selectionTintGeo.dispose()
    this.selectionTintMat.dispose()
    if (this.selectionShapeMesh) {
      this.selectionShapeMesh.geometry.dispose()
      this.selectionShapeMesh = null
    }
    this.scene.remove(this.selectionTint)
    this.ghostGeo.dispose()
    this.ghostMatOk.dispose()
    this.ghostMatBad.dispose()
    this.scene.remove(this.ghostPreview)
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
    }
  }
}
