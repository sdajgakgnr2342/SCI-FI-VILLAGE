import * as THREE from 'three'
import type { MaterialId } from './inventory'

export type MinimapKind =
  | 'grass'
  | 'dirt'
  | 'water'
  | 'sand'
  | 'stone'
  | 'tree'
  | 'wood'
  | 'shrub'
  | 'build'

export type BlockId =
  | 'air'
  | 'grass'
  | 'dirt'
  | 'water'
  | 'sand'
  | 'stone'
  | 'wood'
  | 'leaves'
  | 'shrub'
  | 'turf'
  | 'plank'
  | 'thatch'
  | 'stump'
  | 'rubble'
  | 'alloy'

/** 体素缓存编码（Uint8）；顺序勿改，否则已缓存数据会错位 */
const BLOCK_ID_LIST: BlockId[] = [
  'air',
  'grass',
  'dirt',
  'water',
  'sand',
  'stone',
  'wood',
  'leaves',
  'shrub',
  'turf',
  'plank',
  'thatch',
  'stump',
  'rubble',
  'alloy',
]
const BLOCK_ID_CODE: Record<BlockId, number> = {
  air: 0,
  grass: 1,
  dirt: 2,
  water: 3,
  sand: 4,
  stone: 5,
  wood: 6,
  leaves: 7,
  shrub: 8,
  turf: 9,
  plank: 10,
  thatch: 11,
  stump: 12,
  rubble: 13,
  alloy: 14,
}

/** 已烘焙的 chunk 体素柱（生成一次，之后 O(1) 读） */
type ChunkVoxels = {
  blocks: Uint8Array
  yMin: number
  yMax: number
  ySpan: number
  minSy: number
  maxSy: number
}

export const BLOCK_FACES: Record<
  Exclude<BlockId, 'air'>,
  { top: number; side: number; bottom: number; opacity?: number }
> = {
  grass: { top: 0x6db33f, side: 0x6db33f, bottom: 0x9a6b3c },
  turf: { top: 0x6db33f, side: 0x6db33f, bottom: 0x9a6b3c },
  dirt: { top: 0x9a6b3c, side: 0x845a32, bottom: 0x6e4a2a },
  sand: { top: 0xe8d7a5, side: 0xdccb90, bottom: 0xcfbe7c },
  water: { top: 0x3a7a9a, side: 0x2f6a88, bottom: 0x1a4a6a, opacity: 0.62 },
  stone: { top: 0x8a8e94, side: 0x7a7e84, bottom: 0x6a6e74 },
  wood: { top: 0xa87848, side: 0x916040, bottom: 0x7a4e28 },
  leaves: { top: 0x4fb844, side: 0x45a83c, bottom: 0x3a8f32 },
  shrub: { top: 0x8a9a3a, side: 0x7a8a30, bottom: 0x6a7a28 },
  plank: { top: 0xc4a06a, side: 0xb89058, bottom: 0xa88048 },
  thatch: { top: 0xc4b06a, side: 0xb4a05a, bottom: 0xa4904a },
  stump: { top: 0x6e4220, side: 0x5a3518, bottom: 0x3f2410 },
  rubble: { top: 0xa8a49a, side: 0x8e8a80, bottom: 0x6e6a62 },
  alloy: { top: 0xb7b9bc, side: 0xa3a6aa, bottom: 0x8e9196 },
}

/** 破坏掉落 */
export const BLOCK_HARVEST: Partial<
  Record<BlockId, { mat: MaterialId | null; needAxe?: boolean; remain?: BlockId }>
> = {
  grass: { mat: 'turf', remain: 'dirt' },
  turf: { mat: 'turf' },
  dirt: { mat: 'dirt' },
  sand: { mat: 'sand' },
  stone: { mat: 'stone', needAxe: true },
  wood: { mat: 'wood', needAxe: true },
  leaves: { mat: null },
  shrub: { mat: 'dry_grass' },
  plank: { mat: 'wood' },
  thatch: { mat: 'dry_grass' },
  stump: { mat: 'wood' },
  rubble: { mat: 'stone' },
  alloy: { mat: null },
}

/** 材料 → 放置方块 */
export const MATERIAL_BLOCK: Record<MaterialId, BlockId> = {
  turf: 'turf',
  stone: 'stone',
  wood: 'plank',
  dry_grass: 'thatch',
  dirt: 'dirt',
  sand: 'sand',
}

/** 草坪侧面：上层 1/4 草绿，下层 3/4 土色 */
const GRASS_SIDE_TOP = 0x6db33f
const GRASS_SIDE_DIRT = 0x8b5a2b
/** 草坪绿色层厚度（相对方块高度） */
const GRASS_CAP = 0.25
/** 树墩高度 / 碎石摊高度（相对 1 格） */
const STUMP_H = 0.42
/** 碎石摊略高一点，避免被选中高亮盖成「透明方块」 */
const RUBBLE_H = 0.48
const RUBBLE_INSET = 0.06

export const BLOCK_LABEL: Record<BlockId, string> = {
  air: '',
  grass: '草地',
  dirt: '泥土',
  water: '水',
  sand: '沙子',
  stone: '石头',
  wood: '树木',
  leaves: '树木',
  shrub: '灌木',
  turf: '草皮',
  plank: '木板',
  thatch: '干草',
  stump: '树墩',
  rubble: '碎石摊',
  alloy: '合金',
}

export const BLOCK_DISPLAY_LABEL: Record<BlockId, string> = { ...BLOCK_LABEL }

export const PREVIEW_BLOCK_IDS: Exclude<BlockId, 'air'>[] = [
  'grass',
  'dirt',
  'water',
  'sand',
  'stone',
  'wood',
  'leaves',
  'shrub',
  'turf',
  'plank',
  'thatch',
  'stump',
  'rubble',
  'alloy',
]

const FACES: {
  dir: [number, number, number]
  corners: [number, number, number][]
  shade: 'top' | 'side' | 'bottom'
}[] = [
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 'top' },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 'bottom' },
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 'side' },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 'side' },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 'side' },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 'side' },
]

/** 基准地表高度（起伏中心）；兼容旧调用 / 建模预览 */
export const SURFACE_Y = 4
/** 起伏振幅（格）：略收一点，减少台阶侧面三角形 */
const TERRAIN_AMP = 3
/** 地表最低 / 最高（含溪谷下切） */
const SURFACE_Y_MIN = 2
const SURFACE_Y_MAX = 10
/** 天然树/石相对地表的高度余量 */
export const FEATURE_HEADROOM = 10
/** 网格扫描最高层（坡顶 + 树冠）；实际按 chunk 局部高度收窄 */
export const MESH_Y_MAX = SURFACE_Y_MAX + FEATURE_HEADROOM + 2
/**
 * 方块用精确 0..1 顶点，保证棱对齐、像正经立方体。
 * 大幅面内外扩会在棱上叠出一圈「错位感」（缝不透光但面像没对齐）。
 * 细微光栅缝交给抗锯齿；几何上不再做可见级外扩。
 */
const FACE_SEAM_EXPAND = 0
export const CHUNK_SIZE = 16
/** 可视加载半径（块）；雾远与此对齐 */
export const LOAD_RADIUS = 5
/** 预取缓冲：可视外再挂 lod2，走路时提前建好 */
export const PRELOAD_RADIUS = 7
/** 进服准备舱：落点周边加载圈（40 秒舱内可多铺一圈） */
export const DEPLOY_STREAM_RADIUS = 6
/** 卸载滞回：比预取更大，来回走不反复建拆 */
export const UNLOAD_RADIUS = 9
/** 进服准备舱倒计时（秒） */
export const DEPLOY_DURATION_SEC = 40
/** 准备舱相对落点抬高 */
export const DEPLOY_PAD_HEIGHT = 42
/** 准备舱可行走半宽（格） */
export const DEPLOY_PAD_HALF = 5.5
/** 空气墙高度 */
export const DEPLOY_WALL_H = 3.4
/** 准星可交互距离（格）；超出不高亮、不可挖放 */
export const REACH_DISTANCE = 5
/** 玩家碰撞：眼高、身高、半宽（防穿墙） */
export const PLAYER_EYE = 1.62
export const PLAYER_EYE_CROUCH = 1.15
export const PLAYER_HEIGHT = 1.75
export const PLAYER_HEIGHT_CROUCH = 1.35
export const PLAYER_HALF_W = 0.28
/** 蹲/起身眼高过渡速度（越大越快） */
export const CROUCH_EYE_LERP = 5.5

export function chunkKey(cx: number, cz: number) {
  return `${cx},${cz}`
}

export function blockKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`
}

function hash2(x: number, z: number, seed: number) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seed | 0)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return (n ^ (n >>> 16)) >>> 0
}

function smoothstep01(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** 双线性 value noise，返回 0..1 */
function valueNoise2D(x: number, z: number, seed: number) {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = x - x0
  const fz = z - z0
  const ux = smoothstep01(fx)
  const uz = smoothstep01(fz)
  const v00 = (hash2(x0, z0, seed) >>> 0) / 4294967295
  const v10 = (hash2(x0 + 1, z0, seed) >>> 0) / 4294967295
  const v01 = (hash2(x0, z0 + 1, seed) >>> 0) / 4294967295
  const v11 = (hash2(x0 + 1, z0 + 1, seed) >>> 0) / 4294967295
  const a = v00 + (v10 - v00) * ux
  const b = v01 + (v11 - v01) * ux
  return a + (b - a) * uz
}

/** 无限起伏世界：缓坡草坪 + 溪谷；自然石头/树/灌木；overrides 记录挖放 */
export class InfiniteTerrain {
  readonly seed: number
  private overrides = new Map<string, BlockId>()
  private heightCache = new Map<string, number>()
  /** 已加载区域体素缓存：避免 meshing/碰撞反复跑过程式 sample */
  private voxels = new Map<string, ChunkVoxels>()

  constructor(seed = 42) {
    this.seed = seed
  }

  private voxelIndex(ch: ChunkVoxels, lx: number, y: number, lz: number) {
    return (lz * CHUNK_SIZE + lx) * ch.ySpan + (y - ch.yMin)
  }

  /**
   * 生成并缓存本 chunk 体素（含 overrides）。
   * 邻块树冠/石堆靠 sample 邻域扫描写入本块，不依赖邻块缓存已存在。
   */
  ensureChunkVoxels(cx: number, cz: number): ChunkVoxels {
    const key = chunkKey(cx, cz)
    const existing = this.voxels.get(key)
    if (existing) return existing

    const { minSy, maxSy } = this.computeSurfaceRange(cx, cz)
    const yMin = 0
    const yMax = Math.min(MESH_Y_MAX, maxSy + 1 + FEATURE_HEADROOM)
    const ySpan = yMax - yMin + 1
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * ySpan)
    const x0 = cx * CHUNK_SIZE
    const z0 = cz * CHUNK_SIZE
    let i = 0
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx
        const z = z0 + lz
        for (let y = yMin; y <= yMax; y++) {
          blocks[i++] = BLOCK_ID_CODE[this.sample(x, y, z)]
        }
      }
    }
    const ch: ChunkVoxels = { blocks, yMin, yMax, ySpan, minSy, maxSy }
    this.voxels.set(key, ch)
    return ch
  }

  /** 建网格前预热本块体素；邻块若已挂载则边界 get 也走缓存 */
  warmChunkVoxelsForMesh(cx: number, cz: number) {
    this.ensureChunkVoxels(cx, cz)
  }

  dropChunkVoxels(cx: number, cz: number) {
    this.voxels.delete(chunkKey(cx, cz))
  }

  /** 丢掉过远体素缓存（比网格卸载半径略大，边界碰撞/面剔除仍能命中） */
  pruneVoxelCache(cx: number, cz: number, keepRadius: number) {
    for (const key of [...this.voxels.keys()]) {
      const [sx, sz] = key.split(',').map(Number)
      if (Math.max(Math.abs(sx - cx), Math.abs(sz - cz)) > keepRadius) {
        this.voxels.delete(key)
      }
    }
  }

  clearVoxelCache() {
    this.voxels.clear()
  }

  private computeSurfaceRange(cx: number, cz: number): { minSy: number; maxSy: number } {
    const x0 = cx * CHUNK_SIZE
    const z0 = cz * CHUNK_SIZE
    let minSy = SURFACE_Y_MAX
    let maxSy = SURFACE_Y_MIN
    for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const sy = this.surfaceHeight(x, z)
        if (sy < minSy) minSy = sy
        if (sy > maxSy) maxSy = sy
      }
    }
    return { minSy, maxSy }
  }

  private patchVoxel(ix: number, iy: number, iz: number, id: BlockId) {
    const cx = Math.floor(ix / CHUNK_SIZE)
    const cz = Math.floor(iz / CHUNK_SIZE)
    const ch = this.voxels.get(chunkKey(cx, cz))
    if (!ch || iy < ch.yMin || iy > ch.yMax) return
    const lx = ix - cx * CHUNK_SIZE
    const lz = iz - cz * CHUNK_SIZE
    ch.blocks[this.voxelIndex(ch, lx, iy, lz)] = BLOCK_ID_CODE[id]
  }

  creekCenterZ(x: number) {
    return (
      Math.sin(x * 0.035 + this.seed * 0.001) * 6 +
      Math.sin(x * 0.012 + 1.7) * 3
    )
  }

  creekDist(x: number, z: number) {
    return Math.abs(z - this.creekCenterZ(x))
  }

  isCreek(x: number, z: number) {
    return this.creekDist(x, z) < 1.65
  }

  isCreekBank(x: number, z: number) {
    const d = this.creekDist(x, z)
    return d >= 1.65 && d < 2.6
  }

  /**
   * 该柱地表方块顶面整数 Y（草 / 水面所在格）。
   * 多层噪声缓坡 + 溪谷下切，阶梯坡近似吃鸡起伏。
   */
  surfaceHeight(x: number, z: number): number {
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const key = `${ix},${iz}`
    const cached = this.heightCache.get(key)
    if (cached !== undefined) return cached

    const n =
      valueNoise2D(ix * 0.018, iz * 0.018, this.seed ^ 0xa11) * 0.62 +
      valueNoise2D(ix * 0.045, iz * 0.045, this.seed ^ 0xb22) * 0.28 +
      valueNoise2D(ix * 0.11, iz * 0.11, this.seed ^ 0xc33) * 0.1
    let h = SURFACE_Y + Math.round((n - 0.5) * 2 * TERRAIN_AMP)

    // 溪谷：靠近水道逐渐下切，形成低洼水面
    const d = this.creekDist(ix + 0.5, iz + 0.5)
    if (d < 4.2) {
      const t = 1 - d / 4.2
      h -= Math.round(smoothstep01(t) * 2)
    }

    h = Math.max(SURFACE_Y_MIN, Math.min(SURFACE_Y_MAX, h))
    if (this.heightCache.size > 24000) this.heightCache.clear()
    this.heightCache.set(key, h)
    return h
  }

  /** 树 / 石 / 灌木立在草皮之上的起始层 */
  featureBaseY(x: number, z: number) {
    return this.surfaceHeight(x, z) + 1
  }

  hasOverride(x: number, y: number, z: number) {
    return this.overrides.has(blockKey(Math.floor(x), Math.floor(y), Math.floor(z)))
  }

  /** 本 chunk 地表高度范围，用于收窄网格扫描 */
  chunkSurfaceRange(cx: number, cz: number): { minSy: number; maxSy: number } {
    const ch = this.voxels.get(chunkKey(cx, cz))
    if (ch) return { minSy: ch.minSy, maxSy: ch.maxSy }
    return this.computeSurfaceRange(cx, cz)
  }

  /**
   * 天然小溪保护格：水面恒在、水下为沙/土，忽略挖成 air 的覆盖。
   * 仍允许在河道上建造（plank 等固体）。非河道返回 null。
   */
  private creekProtectedBlock(ix: number, iy: number, iz: number): BlockId | null {
    if (!this.isCreek(ix, iz)) return null
    const sy = this.surfaceHeight(ix, iz)
    if (iy === sy) {
      const o = this.overrides.get(blockKey(ix, iy, iz))
      if (o !== undefined && o !== 'air' && o !== 'water') return o
      return 'water'
    }
    if (iy < sy) {
      const o = this.overrides.get(blockKey(ix, iy, iz))
      if (o !== undefined && o !== 'air') return o
      return iy >= sy - 1 ? 'sand' : 'dirt'
    }
    return null
  }

  sample(x: number, y: number, z: number): BlockId {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const iz = Math.floor(z)

    const creekCell = this.creekProtectedBlock(ix, iy, iz)
    if (creekCell !== null) return creekCell

    const o = this.overrides.get(blockKey(ix, iy, iz))
    if (o !== undefined) return o

    if (iy < 0) return 'dirt'

    const sy = this.surfaceHeight(ix, iz)
    const featMax = sy + 1 + FEATURE_HEADROOM
    if (iy > featMax) return 'air'

    const creek = this.isCreek(ix, iz)
    const bank = this.isCreekBank(ix, iz)

    // 地表之上：天然特征（树石灌木）
    if (iy > sy && !creek && !bank) {
      const feat = this.featureBlock(ix, iy, iz)
      if (feat) return feat
    }

    if (iy < sy) return 'dirt'
    if (iy === sy) return 'grass'
    return 'air'
  }

  private featureBlock(ix: number, iy: number, iz: number): BlockId | null {
    const feat = this.featureBaseY(ix, iz)
    if (iy < feat || iy > feat + FEATURE_HEADROOM) return null
    if (iy === feat) {
      const h = hash2(ix, iz, this.seed ^ 0x51)
      if (h % 47 === 0 && !this.nearTreeTrunk(ix, iz) && !this.nearRock(ix, iz, 2)) {
        return 'shrub'
      }
    }
    const tree = this.treeAt(ix, iy, iz)
    if (tree) return tree
    const rock = this.rockAt(ix, iy, iz)
    if (rock) return rock
    return null
  }

  private nearTreeTrunk(ix: number, iz: number) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (this.isTreeSeed(ix + dx, iz + dz)) return true
      }
    }
    return false
  }

  private nearRock(ix: number, iz: number, r: number) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (this.rockSeedInfo(ix + dx, iz + dz)) return true
      }
    }
    return false
  }

  private isTreeSeed(tx: number, tz: number) {
    if (this.isCreek(tx, tz) || this.isCreekBank(tx, tz)) return false
    // 略疏，远看树冠不易糊成一片墙
    return hash2(tx, tz, this.seed ^ 0x11) % 103 === 0
  }

  private treeAt(ix: number, iy: number, iz: number): BlockId | null {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = ix - dx
        const tz = iz - dz
        if (!this.isTreeSeed(tx, tz)) continue
        const h = hash2(tx, tz, this.seed ^ 0x11)
        const trunkH = 4 + (h % 3)
        const feat = this.featureBaseY(tx, tz)
        // 树干从该柱草皮之上开始，不替换地表草方块
        const top = feat + trunkH

        if (dx === 0 && dz === 0 && iy >= feat && iy < top) return 'wood'

        // 2～3 根侧枝：托住树冠，避免叶子悬空
        const branch = this.treeBranchOffset(h, dx, dz, iy, top)
        if (branch) return 'wood'

        // 树冠：中层更密，顶/底略收
        if (iy < top - 1 || iy > top + 1) continue
        const ax = Math.abs(dx)
        const az = Math.abs(dz)
        if (ax > 2 || az > 2) continue
        if (dx === 0 && dz === 0 && iy < top) continue
        const manhattan = ax + az
        const jitter = (h >> ((ax * 3 + az + iy) & 7)) & 1
        if (iy === top + 1) {
          if (manhattan <= 2) return 'leaves'
          if (manhattan === 3 && jitter === 0) return 'leaves'
        } else if (iy === top) {
          if (manhattan <= 3) return 'leaves'
          if (manhattan === 4 && ax <= 2 && az <= 2) return 'leaves'
        } else {
          if (manhattan <= 2) return 'leaves'
          if (manhattan === 3 && jitter === 0) return 'leaves'
        }
      }
    }
    return null
  }

  /** 侧枝相对树心的偏移：斜向上阶梯（近低远高） */
  private treeBranchOffset(
    h: number,
    dx: number,
    dz: number,
    iy: number,
    top: number
  ): boolean {
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
    const count = 2 + (h % 2)
    const start = h % dirs.length
    const step = count === 2 ? 2 : 1
    for (let i = 0; i < count; i++) {
      const dir = dirs[(start + i * step) % dirs.length]
      // 近干较低、远端抬高 → 斜向上
      if (iy === top - 2 && dx === dir[0] && dz === dir[1]) return true
      if (iy === top - 1 && dx === dir[0] * 2 && dz === dir[1] * 2) return true
    }
    return false
  }

  private rockSeedInfo(rx: number, rz: number): { size: number } | null {
    if (this.isCreek(rx, rz) || this.isCreekBank(rx, rz)) return null
    const h = hash2(rx, rz, this.seed ^ 0x22)
    if (h % 61 !== 0) return null
    return { size: 1 + (h % 3) }
  }

  /**
   * 建模预览用：登记为「天然石」，仍走风格化网格（set 不会变成玩家方块石）。
   */
  private previewRockAnchors = new Map<string, number>()
  private previewNaturalStones = new Set<string>()

  /** 调试页放置与村落一致的风格化石堆 */
  placePreviewRock(sx: number, sz: number, size: number) {
    const ax = Math.floor(sx)
    const az = Math.floor(sz)
    const feat = this.featureBaseY(ax, az)
    const sy = this.surfaceHeight(ax, az)
    const maxR = size === 1 ? 0 : 1
    const maxH = Math.max(1, Math.min(3, size | 0))
    for (let dz = -maxR; dz <= maxR; dz++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        this.set(ax + dx, sy, az + dz, 'grass')
        for (let localY = 0; localY < maxH; localY++) {
          if (maxH >= 3 && localY >= 2 && Math.abs(dx) + Math.abs(dz) > 0) continue
          if (maxH === 2 && localY >= 1 && Math.abs(dx) + Math.abs(dz) > 1) continue
          const x = ax + dx
          const y = feat + localY
          const z = az + dz
          this.set(x, y, z, 'stone')
          this.previewNaturalStones.add(blockKey(x, y, z))
        }
      }
    }
    this.previewRockAnchors.set(blockKey(ax, feat, az), maxH)
  }

  /** 调试页：按村落 treeAt 同一套干/枝/冠规则写入 */
  placePreviewTree(tx: number, tz: number) {
    const ax = Math.floor(tx)
    const az = Math.floor(tz)
    const h = hash2(ax, az, this.seed ^ 0x11)
    const trunkH = 4 + (h % 3)
    const feat = this.featureBaseY(ax, az)
    const sy = this.surfaceHeight(ax, az)
    const top = feat + trunkH
    this.set(ax, sy, az, 'grass')
    for (let y = feat; y < top; y++) this.set(ax, y, az, 'wood')

    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let iy = top - 2; iy <= top + 1; iy++) {
          if (dx === 0 && dz === 0) continue
          if (this.treeBranchOffset(h, dx, dz, iy, top)) {
            this.set(ax + dx, iy, az + dz, 'wood')
          }
        }
        for (let iy = top - 1; iy <= top + 1; iy++) {
          if (dx === 0 && dz === 0 && iy < top) continue
          const axd = Math.abs(dx)
          const azd = Math.abs(dz)
          if (axd > 2 || azd > 2) continue
          const manhattan = axd + azd
          const jitter = (h >> ((axd * 3 + azd + iy) & 7)) & 1
          let leaf = false
          if (iy === top + 1) {
            leaf = manhattan <= 2 || (manhattan === 3 && jitter === 0)
          } else if (iy === top) {
            leaf = manhattan <= 3 || (manhattan === 4 && axd <= 2 && azd <= 2)
          } else {
            leaf = manhattan <= 2 || (manhattan === 3 && jitter === 0)
          }
          if (!leaf) continue
          if (this.get(ax + dx, iy, az + dz) === 'wood') continue
          this.set(ax + dx, iy, az + dz, 'leaves')
        }
      }
    }
  }

  /** 调试页：地表之上的灌木（与 featureBlock 同层） */
  placePreviewShrub(sx: number, sz: number) {
    const ax = Math.floor(sx)
    const az = Math.floor(sz)
    const sy = this.surfaceHeight(ax, az)
    const feat = this.featureBaseY(ax, az)
    this.set(ax, sy, az, 'grass')
    this.set(ax, feat, az, 'shrub')
  }

  /**
   * 天然石堆外观锚点：种子格在草皮之上返回尺寸。
   * 其它天然石格应跳过方块出面（由锚点画整坨风格化石）。
   */
  naturalRockAnchorSize(x: number, y: number, z: number): number | null {
    if (y !== this.featureBaseY(x, z)) return null
    if (this.get(x, y, z) !== 'stone') return null
    const preview = this.previewRockAnchors.get(blockKey(x, y, z))
    if (preview != null) return preview
    const o = this.overrides.get(blockKey(x, y, z))
    if (o !== undefined) return null // 玩家改过的格不当天然锚点
    const info = this.rockSeedInfo(x, z)
    return info ? info.size : null
  }

  /** 是否属于天然石堆但非锚点（只碰撞、不单独画方块） */
  isNaturalRockFollower(x: number, y: number, z: number): boolean {
    if (this.get(x, y, z) !== 'stone') return false
    const key = blockKey(Math.floor(x), Math.floor(y), Math.floor(z))
    if (this.previewNaturalStones.has(key)) {
      return this.previewRockAnchors.get(key) == null
    }
    const o = this.overrides.get(key)
    if (o !== undefined) return false
    if (this.naturalRockAnchorSize(x, y, z) != null) return false
    return this.rockAt(x, y, z) === 'stone'
  }

  private rockAt(ix: number, iy: number, iz: number): BlockId | null {
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const sx = ix - dx
        const sz = iz - dz
        const info = this.rockSeedInfo(sx, sz)
        if (!info) continue
        const feat = this.featureBaseY(sx, sz)
        const { size } = info
        const maxR = size === 1 ? 0 : 1
        const maxH = size
        if (Math.abs(dx) > maxR || Math.abs(dz) > maxR) continue
        const localY = iy - feat
        if (localY < 0 || localY >= maxH) continue
        if (size >= 3 && localY >= 2 && Math.abs(dx) + Math.abs(dz) > 0) continue
        if (size === 2 && localY >= 1 && Math.abs(dx) + Math.abs(dz) > 1) continue
        return 'stone'
      }
    }
    return null
  }

  get(x: number, y: number, z: number): BlockId {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const iz = Math.floor(z)

    const creekCell = this.creekProtectedBlock(ix, iy, iz)
    if (creekCell !== null) return creekCell

    const o = this.overrides.get(blockKey(ix, iy, iz))
    if (o !== undefined) return o

    const cx = Math.floor(ix / CHUNK_SIZE)
    const cz = Math.floor(iz / CHUNK_SIZE)
    const ch = this.voxels.get(chunkKey(cx, cz))
    if (ch) {
      if (iy < ch.yMin) return 'dirt'
      if (iy > ch.yMax) return 'air'
      const lx = ix - cx * CHUNK_SIZE
      const lz = iz - cz * CHUNK_SIZE
      return BLOCK_ID_LIST[ch.blocks[this.voxelIndex(ch, lx, iy, lz)]] ?? 'air'
    }
    return this.sample(ix, iy, iz)
  }

  set(x: number, y: number, z: number, id: BlockId) {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const iz = Math.floor(z)

    // 河道：禁止挖空洞；水面/河床写回自然态
    if (this.isCreek(ix, iz)) {
      const sy = this.surfaceHeight(ix, iz)
      if (iy === sy && (id === 'air' || id === 'water')) {
        this.overrides.delete(blockKey(ix, iy, iz))
        this.patchVoxel(ix, iy, iz, 'water')
        return
      }
      if (iy < sy && id === 'air') {
        id = iy >= sy - 1 ? 'sand' : 'dirt'
      }
    }

    this.overrides.set(blockKey(ix, iy, iz), id)
    this.patchVoxel(ix, iy, iz, id)
  }

  /** Worker 建网格用：chunk±margin 内的 overrides（稀疏） */
  collectOverridesAround(
    cx: number,
    cz: number,
    marginChunks = 1
  ): { x: number; y: number; z: number; blockId: BlockId }[] {
    const x0 = (cx - marginChunks) * CHUNK_SIZE
    const z0 = (cz - marginChunks) * CHUNK_SIZE
    const x1 = (cx + marginChunks + 1) * CHUNK_SIZE
    const z1 = (cz + marginChunks + 1) * CHUNK_SIZE
    const out: { x: number; y: number; z: number; blockId: BlockId }[] = []
    for (const [key, id] of this.overrides) {
      const [xs, ys, zs] = key.split(',')
      const x = Number(xs)
      const y = Number(ys)
      const z = Number(zs)
      if (x < x0 || x >= x1 || z < z0 || z >= z1) continue
      out.push({ x, y, z, blockId: id })
    }
    return out
  }

  /**
   * 俯视小地图用地表种类：草地 / 溪水 / 沙岸 / 石头 / 树 / 灌木 / 建造物。
   * 溪流用连续坐标并略加宽，避免大图稀疏采样“看不见河”。
   */
  minimapKind(x: number, z: number): MinimapKind {
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const sy = this.surfaceHeight(ix, iz)
    const hasOverrides = this.overrides.size > 0

    if (hasOverrides) {
      const oSurf = this.overrides.get(blockKey(ix, sy, iz))
      if (oSurf !== undefined) {
        if (oSurf === 'water') return 'water'
        if (oSurf === 'sand') return 'sand'
        if (oSurf === 'dirt' || oSurf === 'air' || oSurf === 'stump') return 'dirt'
        if (oSurf === 'stone' || oSurf === 'rubble' || oSurf === 'alloy') return 'stone'
        if (
          oSurf === 'plank' ||
          oSurf === 'wood' ||
          oSurf === 'thatch' ||
          oSurf === 'turf' ||
          oSurf === 'grass'
        ) {
          return oSurf === 'grass' || oSurf === 'turf' ? 'grass' : 'build'
        }
      }
    }

    // 溪流优先于昂贵特征扫描（连续坐标 + 加宽）
    const cd = Math.abs(z - this.creekCenterZ(x))
    if (cd < 2.15) return 'water'
    if (cd < 3.05) return 'sand'

    if (hasOverrides) {
      const oAbove = this.overrides.get(blockKey(ix, sy + 1, iz))
      if (oAbove !== undefined && oAbove !== 'air' && oAbove !== 'leaves' && oAbove !== 'water') {
        if (oAbove === 'shrub') return 'shrub'
        if (oAbove === 'stone' || oAbove === 'rubble' || oAbove === 'alloy') return 'stone'
        if (oAbove === 'wood' || oAbove === 'plank') return 'wood'
        return 'build'
      }
    }

    const hs = hash2(ix, iz, this.seed ^ 0x51)
    // 小地图跳过 nearTree/nearRock，省掉每格数十次哈希
    if (hs % 47 === 0) return 'shrub'

    // 树：只看本格 + 十字邻格种子，不做 5×5 全扫
    if (this.isTreeSeed(ix, iz)) return 'wood'
    if (
      this.isTreeSeed(ix - 1, iz) ||
      this.isTreeSeed(ix + 1, iz) ||
      this.isTreeSeed(ix, iz - 1) ||
      this.isTreeSeed(ix, iz + 1) ||
      this.isTreeSeed(ix - 1, iz - 1) ||
      this.isTreeSeed(ix + 1, iz - 1) ||
      this.isTreeSeed(ix - 1, iz + 1) ||
      this.isTreeSeed(ix + 1, iz + 1)
    ) {
      return 'tree'
    }

    // 小地图只标石堆锚点，避免 rockAt 全邻域扫描
    if (this.rockSeedInfo(ix, iz)) return 'stone'

    if (hasOverrides && this.looksLikePlayerBuild(ix, iz)) return 'build'

    return 'grass'
  }

  solid(x: number, y: number, z: number) {
    const id = this.get(x, y, z)
    // 树叶可穿过，不当障碍
    if (id === 'air' || id === 'water' || id === 'leaves') return false
    // 灌木 / 天然树干：不占满整格，碰撞见 bodyCollides 造型半径
    if (id === 'shrub' || id === 'wood') return false
    // 天然风格石：同上
    if (id === 'stone' && this.isNaturalStone(x, y, z)) return false
    return true
  }

  /** 程序生成石（非玩家放置）；建模预览石也算天然 */
  isNaturalStone(x: number, y: number, z: number) {
    if (this.get(x, y, z) !== 'stone') return false
    const key = blockKey(Math.floor(x), Math.floor(y), Math.floor(z))
    if (this.previewNaturalStones.has(key)) return true
    if (this.overrides.has(key)) return false
    return this.rockAt(Math.floor(x), Math.floor(y), Math.floor(z)) === 'stone'
  }

  /**
   * 该列是否像玩家房屋/墙体：覆盖层里有墙体或地板建材。
   * 忽略挖空（air）与单纯地表挖掘，避免误判。
   */
  looksLikePlayerBuild(ix: number, iz: number): boolean {
    const x = Math.floor(ix)
    const z = Math.floor(iz)
    const sy = this.surfaceHeight(x, z)
    for (let y = sy; y <= sy + 12; y++) {
      const o = this.overrides.get(blockKey(x, y, z))
      if (o === undefined || o === 'air' || o === 'water' || o === 'leaves') continue
      if (o === 'plank' || o === 'turf') return true
      if (y >= sy + 1) return true
    }
    return false
  }

  /** 准星打到树干/树叶时，收集整棵树的方块 */
  treeCellsAt(x: number, y: number, z: number): { x: number; y: number; z: number }[] | null {
    const id = this.get(x, y, z)
    let tx = Math.floor(x)
    let tz = Math.floor(z)
    if (id === 'wood' || id === 'plank') {
      // 沿柱找最低树干
    } else if (id === 'leaves') {
      let found = false
      for (let dy = -10; dy <= 2 && !found; dy++) {
        for (let dz = -2; dz <= 2 && !found; dz++) {
          for (let dx = -2; dx <= 2 && !found; dx++) {
            if (this.get(tx + dx, Math.floor(y) + dy, tz + dz) === 'wood') {
              tx = tx + dx
              tz = tz + dz
              found = true
            }
          }
        }
      }
      if (!found) return null
    } else {
      return null
    }

    let baseY = -1
    for (let yy = 0; yy <= MESH_Y_MAX; yy++) {
      const b = this.get(tx, yy, tz)
      if (b === 'wood' || b === 'plank') {
        baseY = yy
        break
      }
    }
    if (baseY < 0) return null
    let topY = baseY
    while (true) {
      const b = this.get(tx, topY + 1, tz)
      if (b !== 'wood' && b !== 'plank') break
      topY++
    }

    const cells: { x: number; y: number; z: number }[] = []
    for (let yy = baseY; yy <= topY; yy++) {
      const b = this.get(tx, yy, tz)
      if (b === 'wood' || b === 'plank') cells.push({ x: tx, y: yy, z: tz })
    }
    // 侧枝木头
    for (let yy = topY - 2; yy <= topY + 1; yy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dz === 0) continue
          if (this.get(tx + dx, yy, tz + dz) === 'wood') {
            cells.push({ x: tx + dx, y: yy, z: tz + dz })
          }
        }
      }
    }
    for (let yy = topY - 1; yy <= topY + 2; yy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (this.get(tx + dx, yy, tz + dz) === 'leaves') {
            cells.push({ x: tx + dx, y: yy, z: tz + dz })
          }
        }
      }
    }
    return cells.length ? cells : null
  }

  /** 准星打到石头时，收集整块岩石 */
  rockCellsAt(x: number, y: number, z: number): { x: number; y: number; z: number }[] | null {
    const hx = Math.floor(x)
    const hy = Math.floor(y)
    const hz = Math.floor(z)
    if (this.get(hx, hy, hz) !== 'stone') return null

    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const sx = hx - dx
        const sz = hz - dz
        const info = this.rockSeedInfo(sx, sz)
        if (!info) continue
        const cells = this.enumerateRock(sx, sz, info.size)
        if (cells.some((c) => c.x === hx && c.y === hy && c.z === hz)) {
          return cells.filter((c) => this.get(c.x, c.y, c.z) === 'stone')
        }
      }
    }

    // 兜底：连通石头
    const cells: { x: number; y: number; z: number }[] = []
    const seen = new Set<string>()
    const q = [{ x: hx, y: hy, z: hz }]
    while (q.length) {
      const c = q.pop()!
      const k = `${c.x},${c.y},${c.z}`
      if (seen.has(k)) continue
      seen.add(k)
      if (this.get(c.x, c.y, c.z) !== 'stone') continue
      cells.push(c)
      for (const [ox, oy, oz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ] as const) {
        q.push({ x: c.x + ox, y: c.y + oy, z: c.z + oz })
      }
    }
    return cells.length ? cells : null
  }

  /**
   * 开采用：整块岩石占用的全部格。
   * 天然石返回种子展开的完整占地（含已挖空的格也要盖 air，避免幽灵石）；
   * 放置石返回连通分量。
   */
  allRockCellsAt(x: number, y: number, z: number): { x: number; y: number; z: number }[] | null {
    const hx = Math.floor(x)
    const hy = Math.floor(y)
    const hz = Math.floor(z)
    if (this.get(hx, hy, hz) !== 'stone') return null

    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const sx = hx - dx
        const sz = hz - dz
        const info = this.rockSeedInfo(sx, sz)
        if (!info) continue
        const cells = this.enumerateRock(sx, sz, info.size)
        if (cells.some((c) => c.x === hx && c.y === hy && c.z === hz)) {
          return cells
        }
      }
    }

    return this.rockCellsAt(hx, hy, hz)
  }

  /**
   * 石头高亮/外观应对齐的绘制点：天然石用种子格；放置石堆用几何中心。
   */
  rockDrawInfo(
    x: number,
    y: number,
    z: number
  ): { x: number; y: number; z: number; size: number } | null {
    const anchor = this.naturalRockAnchorSize(x, y, z)
    if (anchor != null) return { x, y, z, size: anchor }

    const cells = this.rockCellsAt(x, y, z)
    if (!cells?.length) return null

    for (const c of cells) {
      const s = this.naturalRockAnchorSize(c.x, c.y, c.z)
      if (s != null) return { x: c.x, y: c.y, z: c.z, size: s }
    }

    // 玩家放置石堆：与 chunk 网格一致，画在几何中心
    let sx = 0
    let sy = 0
    let sz = 0
    for (const c of cells) {
      sx += c.x
      sy += c.y
      sz += c.z
    }
    const n = cells.length
    const size = n <= 1 ? 1 : n <= 4 ? 2 : 3
    return { x: sx / n, y: sy / n, z: sz / n, size }
  }

  private enumerateRock(sx: number, sz: number, size: number) {
    const cells: { x: number; y: number; z: number }[] = []
    const feat = this.featureBaseY(sx, sz)
    const maxR = size === 1 ? 0 : 1
    const maxH = size
    for (let dz = -maxR; dz <= maxR; dz++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        for (let localY = 0; localY < maxH; localY++) {
          if (size >= 3 && localY >= 2 && Math.abs(dx) + Math.abs(dz) > 0) continue
          if (size === 2 && localY >= 1 && Math.abs(dx) + Math.abs(dz) > 1) continue
          cells.push({ x: sx + dx, y: feat + localY, z: sz + dz })
        }
      }
    }
    return cells
  }
}

export type ChunkLod = 0 | 1 | 2
export type ChunkMeshes = {
  solid: THREE.Mesh | null
  water: THREE.Mesh | null
  grass: THREE.Mesh | null
  lod: ChunkLod
  /** 快速地表占位，完整网格到达后替换 */
  proxy?: boolean
}

/** chunk 切比雪夫距离 → LOD：0 近 / 1 中 / 2 远（带宽略宽，少触发重建） */
export function chunkLodFromDist(dist: number): ChunkLod {
  if (dist <= 1) return 0
  if (dist <= 3) return 1
  return 2
}

function pushFaceQuad(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  corners: [number, number, number][],
  origin: [number, number, number],
  normal: [number, number, number],
  color: THREE.Color,
  yBias = 0,
  inset = 0
) {
  const [ox, oy, oz] = origin
  const [nx, ny, nz] = normal
  // inset>0：叶等造型内收；方块传 0 保持棱对齐
  const pull = inset
  for (const c of corners) {
    const lx = c[0]
    const ly = c[1]
    const lz = c[2]
    pos.push(ox + lx - nx * pull, oy + ly + yBias - ny * pull, oz + lz - nz * pull)
    nor.push(nx, ny, nz)
    col.push(color.r, color.g, color.b)
  }
  idx.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
  return vertex + 4
}

function pushGrassCardQuad(
  pos: number[],
  nor: number[],
  uv: number[],
  idx: number[],
  vertex: number,
  cx: number,
  y0: number,
  cz: number,
  halfW: number,
  height: number,
  yaw: number
) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const rx = -s * halfW
  const rz = c * halfW
  const y1 = y0 + height
  const corners: [number, number, number][] = [
    [cx - rx, y0, cz - rz],
    [cx + rx, y0, cz + rz],
    [cx + rx, y1, cz + rz],
    [cx - rx, y1, cz - rz],
  ]
  const uvs: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
  for (let i = 0; i < 4; i++) {
    pos.push(corners[i][0], corners[i][1], corners[i][2])
    nor.push(c, 0.12, s)
    uv.push(uvs[i][0], uvs[i][1])
  }
  idx.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
  return vertex + 4
}

/** Canvas 生成草丛贴图（一次，全图共享） */
let grassTuftTex: THREE.CanvasTexture | null = null
let grassTuftMat: THREE.MeshLambertMaterial | null = null

export function getGrassTuftMaterial() {
  if (grassTuftMat) return grassTuftMat
  if (typeof document === 'undefined') {
    // Worker 不应创建草材质；回退纯色以免炸
    grassTuftMat = new THREE.MeshLambertMaterial({
      color: 0x5a9a3a,
      alphaTest: 0.32,
      side: THREE.DoubleSide,
    })
    return grassTuftMat
  }
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  // 固定种子，避免每次刷新纹理抖动
  let seed = 0x9e3779b9
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return (seed & 0xffff) / 0x10000
  }

  const bladeCount = 22
  for (let i = 0; i < bladeCount; i++) {
    const x = 70 + rnd() * 116
    const y = 210 + rnd() * 28
    const h = 55 + rnd() * 90
    const w = 2.2 + rnd() * 3.5
    const red = 28 + rnd() * 45
    const green = 90 + rnd() * 110
    ctx.strokeStyle = `rgba(${red | 0},${green | 0},${30 + (rnd() * 25) | 0},${0.75 + rnd() * 0.25})`
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + (rnd() - 0.5) * 28,
      y - h * 0.55,
      x + (rnd() - 0.5) * 18,
      y - h
    )
    ctx.stroke()
  }

  grassTuftTex = new THREE.CanvasTexture(canvas)
  grassTuftTex.colorSpace = THREE.SRGBColorSpace
  grassTuftTex.magFilter = THREE.LinearFilter
  grassTuftTex.minFilter = THREE.LinearMipmapLinearFilter
  grassTuftTex.generateMipmaps = true
  grassTuftMat = new THREE.MeshLambertMaterial({
    map: grassTuftTex,
    alphaTest: 0.32,
    transparent: false,
    side: THREE.DoubleSide,
    depthWrite: true,
  })
  return grassTuftMat
}

/**
 * 卡片草：近处 2～3 簇；中距离抽稀；远处隔 2 格最多 1 簇。
 */
function pushGrassCards(
  pos: number[],
  nor: number[],
  uv: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  lod: ChunkLod = 0
) {
  const h = hash2(x, z, y ^ 0xb3)
  // 中：隔一格；远：每 2 格一抽
  if (lod === 1 && ((x + z) & 1) === 1) return vertex
  if (lod >= 2 && ((x ^ z) & 3) !== 0) return vertex

  // 远景不画卡片草；近景每格最多 1 簇×2 面，显著降 overdraw
  if (lod >= 2) return vertex
  const count = 1

  let v = vertex
  const topY = y + 1
  const slots: [number, number][] = [[0.5, 0.5]]
  const rot = (h % 4) * (Math.PI / 2)
  const rc = Math.cos(rot)
  const rs = Math.sin(rot)
  for (let i = 0; i < count; i++) {
    const hx = hash2(x + i * 19, z - i * 11, y ^ (0x71 + i * 13))
    let lx = slots[i][0] - 0.5
    let lz = slots[i][1] - 0.5
    const rx = lx * rc - lz * rs
    const rz = lx * rs + lz * rc
    const jitter = 0.05
    const cx = x + 0.5 + rx + (((hx % 17) - 8) / 100) * jitter * 8
    const cz = z + 0.5 + rz + ((((hx >> 5) % 17) - 8) / 100) * jitter * 8
    const hgt = 0.2 + ((hx >> 3) % 14) / 100
    const halfW = 0.18 + ((hx >> 9) % 10) / 100
    const yaw0 = ((hx % 628) / 100) * 0.5
    const planes = 2
    for (let k = 0; k < planes; k++) {
      const yaw = yaw0 + (k * Math.PI) / planes
      const lean = (((hx >> (k + 2)) % 9) - 4) * 0.012
      v = pushGrassCardQuad(
        pos,
        nor,
        uv,
        idx,
        v,
        cx + lean,
        topY,
        cz + lean * 0.6,
        halfW * (0.9 + (k % 2) * 0.08),
        hgt * (0.92 + ((hx >> k) % 5) / 40),
        yaw
      )
    }
  }
  return v
}

/** 侧面按 Y 切成上下两段（草坪绿帽 / 土） */
function sideBandCorners(
  base: [number, number, number][],
  y0: number,
  y1: number
): [number, number, number][] {
  return base.map((c) => [c[0], c[1] === 0 ? y0 : y1, c[2]]) as [number, number, number][]
}

/** 矮方块（树墩/碎石摊）的顶点：高度压缩，碎石摊还略缩小底面 */
function shortBlockCorners(
  base: [number, number, number][],
  y0: number,
  y1: number,
  inset = 0
): [number, number, number][] {
  const span = 1 - inset * 2
  return base.map(
    (c) =>
      [
        inset + c[0] * span,
        y0 + c[1] * (y1 - y0),
        inset + c[2] * span,
      ] as [number, number, number]
  )
}

/**
 * 弯曲叶瓣：4 段弧面薄片（约 16 顶点/瓣）。
 * 比实心方块叶更自然，顶点量与原十字薄片接近，开销可控。
 */
function pushCurvedLeafBlade(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  ox: number,
  oy: number,
  oz: number,
  yaw: number,
  pitch: number,
  len: number,
  wid: number,
  bend: number,
  color: THREE.Color,
  segs = 4
) {
  const nSeg = Math.max(1, segs | 0)
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  // 叶长轴 / 侧向（世界坐标）
  const fx = sy * cp
  const fy = sp
  const fz = cy * cp
  const rx = cy
  const rz = -sy

  let v = vertex
  for (let i = 0; i < nSeg; i++) {
    const t0 = i / nSeg
    const t1 = (i + 1) / nSeg
    const arch0 = Math.sin(Math.PI * t0) * bend
    const arch1 = Math.sin(Math.PI * t1) * bend
    const w0 = wid * Math.sin(Math.PI * Math.max(0.08, Math.min(0.92, t0)))
    const w1 = wid * Math.sin(Math.PI * Math.max(0.08, Math.min(0.92, t1)))

    const p0x = ox + fx * (t0 * len)
    const p0y = oy + fy * (t0 * len) + arch0
    const p0z = oz + fz * (t0 * len)
    const p1x = ox + fx * (t1 * len)
    const p1y = oy + fy * (t1 * len) + arch1
    const p1z = oz + fz * (t1 * len)

    const c0: [number, number, number] = [p0x - rx * w0, p0y, p0z - rz * w0]
    const c1: [number, number, number] = [p0x + rx * w0, p0y, p0z + rz * w0]
    const c2: [number, number, number] = [p1x + rx * w1, p1y, p1z + rz * w1]
    const c3: [number, number, number] = [p1x - rx * w1, p1y, p1z - rz * w1]

    // 近似法线：向上偏一点，双面各推一次
    const nx = -fy * rz
    const ny = 0.85
    const nz = fy * rx
    const inv = 1 / Math.max(0.001, Math.hypot(nx, ny, nz))
    const n: [number, number, number] = [nx * inv, ny * inv, nz * inv]
    v = pushFaceQuad(pos, nor, col, idx, v, [c0, c1, c2, c3], [0, 0, 0], n, color)
    v = pushFaceQuad(pos, nor, col, idx, v, [c0, c3, c2, c1], [0, 0, 0], [-n[0], -n[1], -n[2]], color)
  }
  return v
}

/** 外露叶：近处密；中距离减瓣；远处只画外露叶且更稀 */
export function pushLeafCluster(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  tmp: THREE.Color,
  exposed: boolean,
  lod: ChunkLod = 0
) {
  if (lod >= 2 && !exposed) return vertex
  const h = hash2(x, z, y ^ 0x91)
  let count: number
  if (lod >= 2) count = exposed ? 1 : 0
  else if (lod === 1) count = exposed ? 2 : 1
  else count = exposed ? 5 + (h % 2) : 3 + (h % 2)
  if (count <= 0) return vertex
  const bladeSegs = lod >= 2 ? 2 : lod === 1 ? 2 : 3
  let v = vertex
  for (let i = 0; i < count; i++) {
    const hx = hash2(x + i * 5, z + i, y ^ (0x41 + i * 7))
    const ox = x + 0.02 + ((hx % 96) / 100) * 0.96
    const oy = y + 0.02 + (((hx >> 6) % 96) / 100) * 0.96
    const oz = z + 0.02 + (((hx >> 12) % 96) / 100) * 0.96
    const yaw = ((hx % 628) / 100) * 1.0
    const pitch = -0.5 + (((hx >> 4) % 65) / 100) * 1.1
    const len = (lod >= 2 ? 0.5 : 0.78) + ((hx >> 3) % 40) / 100
    const wid = (lod >= 2 ? 0.16 : 0.24) + ((hx >> 8) % 18) / 100
    const bend = 0.14 + ((hx >> 2) % 14) / 100
    tmp.setHex(0x4fb844).multiplyScalar(0.84 + ((hx >> 9) % 26) / 100)
    v = pushCurvedLeafBlade(
      pos,
      nor,
      col,
      idx,
      v,
      ox,
      oy,
      oz,
      yaw,
      pitch,
      len,
      wid,
      bend,
      tmp,
      bladeSegs
    )
  }
  return v
}

const WOOD_CYL_SIDES = 8
export const WOOD_TRUNK_R = 0.3
const WOOD_BRANCH_R = 0.13

/** 空心圆柱外壳（只画外壁，不填实心、不画内壁） */
function pushCylinderShellY(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  cx: number,
  y0: number,
  y1: number,
  cz: number,
  radius: number,
  color: THREE.Color
) {
  let v = vertex
  for (let i = 0; i < WOOD_CYL_SIDES; i++) {
    const a0 = (i / WOOD_CYL_SIDES) * Math.PI * 2
    const a1 = ((i + 1) / WOOD_CYL_SIDES) * Math.PI * 2
    const c0 = Math.cos(a0)
    const s0 = Math.sin(a0)
    const c1 = Math.cos(a1)
    const s1 = Math.sin(a1)
    const x0 = cx + c0 * radius
    const z0 = cz + s0 * radius
    const x1 = cx + c1 * radius
    const z1 = cz + s1 * radius
    const nx = (c0 + c1) * 0.5
    const nz = (s0 + s1) * 0.5
    const inv = 1 / Math.max(0.001, Math.hypot(nx, nz))
    // 从外侧看为逆时针（Three.js FrontSide），避免外壁被剔成“空心朝自己”
    const corners: [number, number, number][] = [
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ]
    v = pushFaceQuad(pos, nor, col, idx, v, corners, [0, 0, 0], [nx * inv, 0, nz * inv], color)
  }
  return v
}

/** 任意方向空心圆筒（斜向上侧枝）；sides 可降以减轻细枝开销 */
function pushCylinderShellAxis(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number,
  color: THREE.Color,
  sides = WOOD_CYL_SIDES
) {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  if (len < 0.05) return vertex
  const fx = dx / len
  const fy = dy / len
  const fz = dz / len
  let px: number
  let py: number
  let pz: number
  if (Math.abs(fy) < 0.92) {
    px = fz
    py = 0
    pz = -fx
  } else {
    px = 1
    py = 0
    pz = 0
  }
  const pl = Math.hypot(px, py, pz) || 1
  px /= pl
  py /= pl
  pz /= pl
  const qx = fy * pz - fz * py
  const qy = fz * px - fx * pz
  const qz = fx * py - fy * px

  const nSides = Math.max(3, sides | 0)
  let v = vertex
  for (let i = 0; i < nSides; i++) {
    const a0 = (i / nSides) * Math.PI * 2
    const a1 = ((i + 1) / nSides) * Math.PI * 2
    const c0 = Math.cos(a0)
    const s0 = Math.sin(a0)
    const c1 = Math.cos(a1)
    const s1 = Math.sin(a1)
    const r0x = (px * c0 + qx * s0) * radius
    const r0y = (py * c0 + qy * s0) * radius
    const r0z = (pz * c0 + qz * s0) * radius
    const r1x = (px * c1 + qx * s1) * radius
    const r1y = (py * c1 + qy * s1) * radius
    const r1z = (pz * c1 + qz * s1) * radius
    // 从外侧看为逆时针，外壁朝外
    const corners: [number, number, number][] = [
      [ax + r0x, ay + r0y, az + r0z],
      [bx + r0x, by + r0y, bz + r0z],
      [bx + r1x, by + r1y, bz + r1z],
      [ax + r1x, ay + r1y, az + r1z],
    ]
    const nx = (r0x + r1x) * 0.5
    const ny = (r0y + r1y) * 0.5
    const nz = (r0z + r1z) * 0.5
    const inv = 1 / Math.max(0.001, Math.hypot(nx, ny, nz))
    v = pushFaceQuad(pos, nor, col, idx, v, corners, [0, 0, 0], [nx * inv, ny * inv, nz * inv], color)
  }
  return v
}

function isTrunkColumnWood(world: InfiniteTerrain, x: number, y: number, z: number) {
  if (world.get(x, y, z) !== 'wood') return false
  return world.get(x, y + 1, z) === 'wood' || world.get(x, y - 1, z) === 'wood'
}

/**
 * 木头：主干只画竖直筒；侧枝由「近干节」画一整根斜筒到枝尖。
 * 枝尖不再单独画，避免与树干分离 / 树叶里悬浮碎枝。
 */
export function pushWoodCylinder(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  world: InfiniteTerrain,
  tmp: THREE.Color
) {
  const above = world.get(x, y + 1, z) === 'wood'
  const below = world.get(x, y - 1, z) === 'wood'
  tmp.setHex(BLOCK_FACES.wood.side)

  if (above || below) {
    return pushCylinderShellY(pos, nor, col, idx, vertex, x + 0.5, y, y + 1, z + 0.5, WOOD_TRUNK_R, tmp)
  }

  // 侧枝格：找同高相邻的主干
  const ortho: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  let trunk: [number, number, number] | null = null
  for (const [ox, oz] of ortho) {
    const tx = x + ox
    const tz = z + oz
    if (isTrunkColumnWood(world, tx, y, tz)) {
      trunk = [tx, y, tz]
      break
    }
  }

  // 斜上方的外伸枝尖
  let tip: [number, number, number] | null = null
  for (const [ox, oz] of ortho) {
    const fx = x + ox
    const fy = y + 1
    const fz = z + oz
    if (world.get(fx, fy, fz) !== 'wood') continue
    if (isTrunkColumnWood(world, fx, fy, fz)) continue
    tip = [fx, fy, fz]
    break
  }

  // 只有近干节负责画整根枝；枝尖静默（碰撞仍在）
  if (!trunk) return vertex

  const ax = trunk[0] + 0.5
  const ay = trunk[1] + 0.4
  const az = trunk[2] + 0.5
  if (tip) {
    return pushCylinderShellAxis(
      pos,
      nor,
      col,
      idx,
      vertex,
      ax,
      ay,
      az,
      tip[0] + 0.5,
      tip[1] + 0.65,
      tip[2] + 0.5,
      WOOD_BRANCH_R,
      tmp
    )
  }
  // 单节短枝
  return pushCylinderShellAxis(
    pos,
    nor,
    col,
    idx,
    vertex,
    ax,
    ay,
    az,
    x + 0.5,
    y + 0.7,
    z + 0.5,
    WOOD_BRANCH_R,
    tmp
  )
}

/** 十二面体模板（detail=0，约 36 三角）——只建一次 */
const ROCK_TEMPLATE: { verts: Float32Array; indices: Uint16Array } = (() => {
  const g = new THREE.DodecahedronGeometry(1, 0)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const idx = g.index
  const verts = new Float32Array(pos.array as ArrayLike<number>)
  const indices = idx
    ? new Uint16Array(idx.array as ArrayLike<number>)
    : (() => {
        const n = pos.count
        const a = new Uint16Array(n)
        for (let i = 0; i < n; i++) a[i] = i
        return a
      })()
  g.dispose()
  return { verts, indices }
})()

function pushTriColored(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  color: THREE.Color
) {
  const e1x = bx - ax
  const e1y = by - ay
  const e1z = bz - az
  const e2x = cx - ax
  const e2y = cy - ay
  const e2z = cz - az
  let nx = e1y * e2z - e1z * e2y
  let ny = e1z * e2x - e1x * e2z
  let nz = e1x * e2y - e1y * e2x
  const inv = 1 / Math.max(0.0001, Math.hypot(nx, ny, nz))
  nx *= inv
  ny *= inv
  nz *= inv
  pos.push(ax, ay, az, bx, by, bz, cx, cy, cz)
  nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
  col.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b)
  idx.push(vertex, vertex + 1, vertex + 2)
  return vertex + 3
}

function pushRockBlob(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  ox: number,
  oy: number,
  oz: number,
  sx: number,
  sy: number,
  sz: number,
  yaw: number,
  seed: number,
  color: THREE.Color
) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const { verts, indices } = ROCK_TEMPLATE
  const deformed: number[] = []
  for (let i = 0; i < verts.length; i += 3) {
    let vx = verts[i]
    let vy = verts[i + 1]
    let vz = verts[i + 2]
    // 轻量确定性形变（非 Math.random），保持低面数
    const n =
      0.82 +
      0.22 * Math.sin(vx * 3.1 + seed * 0.01) * Math.cos(vz * 2.7 + seed * 0.02) +
      0.12 * Math.sin(vy * 4.3 + seed * 0.03)
    vx *= n
    vy *= n
    vz *= n
    const rx = vx * c - vz * s
    const rz = vx * s + vz * c
    deformed.push(ox + rx * sx, oy + vy * sy, oz + rz * sz)
  }
  let v = vertex
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3
    const ib = indices[i + 1] * 3
    const ic = indices[i + 2] * 3
    v = pushTriColored(
      pos,
      nor,
      col,
      idx,
      v,
      deformed[ia],
      deformed[ia + 1],
      deformed[ia + 2],
      deformed[ib],
      deformed[ib + 1],
      deformed[ib + 2],
      deformed[ic],
      deformed[ic + 1],
      deformed[ic + 2],
      color
    )
  }
  return v
}

/**
 * 风格化组合石（方案二思路）：主体 + 少量凸起，合批进 chunk。
 * size 1 小 / 2 中 / 3 大；面数很低，避免发热。
 */
export function pushStylizedRock(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  size: number,
  tmp: THREE.Color,
  lod: ChunkLod = 0
) {
  const h = hash2(Math.floor(x), Math.floor(z), Math.floor(y) ^ 0x22)
  const hue = 0.07 + ((h % 8) / 100) * 0.5
  tmp.setHSL(hue, 0.1, 0.32 + ((h >> 4) % 12) / 100)
  const yaw = ((h % 628) / 100) * 0.5

  // 主体尺度：小 / 中 / 大
  const base =
    size === 1 ? 0.42 : size === 2 ? 0.72 : 1.05
  const sx = base * (0.95 + ((h >> 2) % 10) / 100)
  const sy = base * (0.55 + ((h >> 6) % 18) / 100)
  const sz = base * (0.85 + ((h >> 8) % 14) / 100)
  const cx = x + 0.5
  const cz = z + 0.5
  // 底部贴草地顶（y 为石堆底格 / featureBaseY），略埋一点更稳
  const cy = y + sy * 0.55

  let v = pushRockBlob(pos, nor, col, idx, vertex, cx, cy, cz, sx, sy, sz, yaw, h, tmp)

  // 远景不画凸起；中景只画 1 个
  const bumps = lod >= 2 ? 0 : lod === 1 ? (size >= 2 ? 1 : 0) : size === 1 ? 0 : size === 2 ? 1 : 2
  for (let i = 0; i < bumps; i++) {
    const hx = hash2(Math.floor(x) + i * 7, Math.floor(z) - i * 3, h ^ (0x55 + i))
    const ang = yaw + ((hx % 628) / 100)
    const dist = base * (0.35 + ((hx >> 3) % 20) / 100)
    const bs = base * (0.22 + ((hx >> 5) % 16) / 100)
    tmp.setHSL(hue, 0.09, 0.28 + ((hx >> 2) % 16) / 100)
    v = pushRockBlob(
      pos,
      nor,
      col,
      idx,
      v,
      cx + Math.cos(ang) * dist,
      y + bs * 0.45 + ((hx >> 8) % 10) / 100,
      cz + Math.sin(ang) * dist,
      bs,
      bs * (0.5 + ((hx >> 4) % 12) / 100),
      bs * (0.7 + ((hx >> 6) % 10) / 100),
      ang * 0.7,
      hx,
      tmp
    )
  }
  return v
}

const SHRUB_STEM_HEX = 0x6b4a3a
const SHRUB_STEM_LT_HEX = 0x8b6a4a
/** 偏亮绿，远看也能读出“叶团” */
const SHRUB_LEAF_HEX = [0x4fb844, 0x5ec84a, 0x6ad05a, 0x8aaa4a, 0x3f9a38] as const
const SHRUB_STEM_SIDES = 5

function pushShrubLeafBurst(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  ox: number,
  oy: number,
  oz: number,
  seed: number,
  count: number,
  scale: number,
  tmp: THREE.Color
) {
  let v = vertex
  for (let l = 0; l < count; l++) {
    const hl = hash2((seed + l * 13) | 0, (seed ^ (l * 97)) | 0, 0xb7 + l)
    const yaw = ((hl % 628) / 100)
    const pitch = 0.15 + ((hl >> 4) % 70) / 100
    const len = (0.16 + ((hl >> 2) % 14) / 100) * scale
    const wid = (0.055 + ((hl >> 6) % 12) / 100) * scale
    const bend = 0.1 + ((hl >> 3) % 18) / 100
    const ox2 = ox + (((hl % 21) - 10) / 100) * 0.12 * scale
    const oy2 = oy + ((((hl >> 8) % 17) - 4) / 100) * 0.1 * scale
    const oz2 = oz + ((((hl >> 12) % 21) - 10) / 100) * 0.12 * scale
    tmp.setHex(SHRUB_LEAF_HEX[hl % SHRUB_LEAF_HEX.length])
    v = pushCurvedLeafBlade(pos, nor, col, idx, v, ox2, oy2, oz2, yaw, pitch, len, wid, bend, tmp)
  }
  return v
}

/**
 * 风格化灌木：枝干骨架 + 饱满叶团，合批进 chunk solid。
 * lod 0 全量 / 1 减密 / 2 远景剪影。
 */
export function pushStylizedShrub(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  lod: ChunkLod,
  tmp: THREE.Color
) {
  const h = hash2(x, z, y ^ 0x51)
  const cx = x + 0.5
  const cz = z + 0.5
  const baseY = y + 0.02
  const stemCount = lod >= 2 ? 1 : lod === 1 ? 1 : 2
  const mainDirs: [number, number, number, number, number][] = [
    [0.1, 1, 0.1, 0.48, 1],
    [-0.1, 1, -0.05, 0.42, -1],
    [0.05, 1, -0.15, 0.52, 1],
    [-0.08, 1, 0.12, 0.4, -1],
  ]

  let v = vertex
  for (let i = 0; i < stemCount; i++) {
    const b = mainDirs[i]
    const hx = hash2(x + i * 17, z - i * 9, h ^ (0x33 + i))
    const dx = b[0] + (((hx % 21) - 10) / 100) * 0.15
    const dy = b[1]
    const dz = b[2] + ((((hx >> 4) % 21) - 10) / 100) * 0.15
    const inv = 1 / Math.max(0.001, Math.hypot(dx, dy, dz))
    const fx = dx * inv
    const fy = dy * inv
    const fz = dz * inv
    const len = b[3] * (0.92 + ((hx >> 6) % 16) / 100)
    const curveDir = b[4]
    const midT = 0.55
    const midBend = 0.08 * curveDir * (0.6 + ((hx >> 2) % 10) / 10)
    const midX = cx + fx * len * midT + midBend
    const midY = baseY + fy * len * midT
    const midZ = cz + fz * len * midT + midBend * 0.4
    const tipX = cx + fx * len + midBend * 0.35
    const tipY = baseY + fy * len
    const tipZ = cz + fz * len + midBend * 0.15
    const thick = 0.014 + ((hx >> 8) % 10) / 1000
    tmp.setHex(SHRUB_STEM_HEX)
    v = pushCylinderShellAxis(
      pos,
      nor,
      col,
      idx,
      v,
      cx,
      baseY,
      cz,
      midX,
      midY,
      midZ,
      thick,
      tmp,
      SHRUB_STEM_SIDES
    )
    v = pushCylinderShellAxis(
      pos,
      nor,
      col,
      idx,
      v,
      midX,
      midY,
      midZ,
      tipX,
      tipY,
      tipZ,
      thick * 0.72,
      tmp,
      SHRUB_STEM_SIDES
    )

    // 主枝中段叶簇
    const midLeaves = lod >= 2 ? 1 : lod === 1 ? 2 : 7
    v = pushShrubLeafBurst(
      pos,
      nor,
      col,
      idx,
      v,
      midX,
      midY,
      midZ,
      hx ^ 0x55,
      midLeaves,
      lod >= 2 ? 0.7 : 1,
      tmp
    )

    const subCount = lod >= 2 ? 0 : lod === 1 ? 1 : 3 + (hx % 2)
    for (let s = 0; s < subCount; s++) {
      const hs = hash2(x + s * 5, z + i * 3, hx ^ (0x71 + s * 11))
      const t = 0.28 + ((hs % 55) / 100) * 0.52
      const sx = cx + fx * len * t + midBend * t
      const sy = baseY + fy * len * t
      const sz = cz + fz * len * t + midBend * 0.4 * t
      let sdx = (((hs % 61) - 30) / 100) * 0.7 + fx * 0.35
      let sdy = 0.45 + ((hs >> 4) % 40) / 100
      let sdz = ((((hs >> 8) % 61) - 30) / 100) * 0.7 + fz * 0.35
      const sl = Math.hypot(sdx, sdy, sdz) || 1
      sdx /= sl
      sdy /= sl
      sdz /= sl
      const subLen = 0.12 + ((hs >> 2) % 16) / 100
      const ex = sx + sdx * subLen
      const ey = sy + sdy * subLen
      const ez = sz + sdz * subLen
      tmp.setHex(SHRUB_STEM_LT_HEX)
      v = pushCylinderShellAxis(
        pos,
        nor,
        col,
        idx,
        v,
        sx,
        sy,
        sz,
        ex,
        ey,
        ez,
        0.005 + ((hs >> 6) % 6) / 1000,
        tmp,
        4
      )

      const leafCount = lod >= 2 ? 1 : lod === 1 ? 2 : 8 + (hs % 3)
      v = pushShrubLeafBurst(
        pos,
        nor,
        col,
        idx,
        v,
        (sx + ex) * 0.5,
        (sy + ey) * 0.5,
        (sz + ez) * 0.5,
        hs,
        leafCount,
        lod >= 2 ? 0.75 : 1.05,
        tmp
      )
    }

    // 主枝顶端叶团
    const tipLeaves = lod >= 2 ? 1 : lod === 1 ? 2 : 10
    v = pushShrubLeafBurst(pos, nor, col, idx, v, tipX, tipY, tipZ, h ^ (0xa1 + i * 5), tipLeaves, lod >= 1 ? 0.9 : 1.1, tmp)
  }

  // 冠层体积填叶 + 基部（近景全量，中景砍半）
  if (lod < 2) {
    const canopyN = lod === 0 ? 18 : 4
    for (let i = 0; i < canopyN; i++) {
      const hc = hash2(x + i * 3, z - i * 5, h ^ (0xd1 + i))
      const ang = (hc % 628) / 100
      const r = 0.08 + ((hc >> 4) % 28) / 100
      const hy = baseY + 0.18 + ((hc >> 8) % 36) / 100
      v = pushShrubLeafBurst(
        pos,
        nor,
        col,
        idx,
        v,
        cx + Math.cos(ang) * r,
        hy,
        cz + Math.sin(ang) * r,
        hc,
        lod === 0 ? 2 : 1,
        0.95,
        tmp
      )
    }
    const baseN = lod === 0 ? 10 : 3
    for (let i = 0; i < baseN; i++) {
      const hb = hash2(x - i * 7, z + i * 5, h ^ (0xc3 + i))
      const ang = (hb % 628) / 100
      const r = 0.05 + ((hb >> 4) % 16) / 100
      tmp.setHex(SHRUB_LEAF_HEX[hb % SHRUB_LEAF_HEX.length])
      const yaw = ang + (((hb >> 2) % 20) - 10) / 50
      const pitch = 0.2 + ((hb >> 6) % 45) / 100
      v = pushCurvedLeafBlade(
        pos,
        nor,
        col,
        idx,
        v,
        cx + Math.cos(ang) * r,
        baseY + 0.02,
        cz + Math.sin(ang) * r,
        yaw,
        pitch,
        0.14 + ((hb >> 3) % 10) / 100,
        0.05 + ((hb >> 8) % 8) / 100,
        0.1 + ((hb >> 5) % 14) / 100,
        tmp
      )
    }
  }

  return v
}

const CREEK_WATER_HEX = 0x3a7a9a
const CREEK_WATER_SIDE_HEX = 0x2f6a88
const CREEK_BED_HEX = 0x6a5a48
const CREEK_PEBBLE_HEX = [0x8a7a6a, 0x9a8a7a, 0x6a5a4a, 0x6a8a7a] as const
const CREEK_EDGE_STONE_HEX = [0x7a8a7a, 0x9aaa9a] as const

/**
 * 浅水面：压扁「水管」观感——薄顶面 + 溪缘侧壁。
 * pushFaceQuad 的 corners 相对 origin。
 */
function pushCreekWaterCell(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  world: InfiniteTerrain,
  tmp: THREE.Color
) {
  const wave = Math.sin(x * 0.55 + z * 0.31) * 0.007
  const wy = y + 0.036 + wave
  const bedY = y + 0.004
  const west = world.get(x - 1, y, z) === 'water' ? 0 : 0.08
  const east = world.get(x + 1, y, z) === 'water' ? 0 : 0.08
  const south = world.get(x, y, z - 1) === 'water' ? 0 : 0.08
  const north = world.get(x, y, z + 1) === 'water' ? 0 : 0.08
  const x0 = west
  const x1 = 1 - east
  const z0 = south
  const z1 = 1 - north
  if (x1 <= x0 + 0.04 || z1 <= z0 + 0.04) return vertex

  tmp.setHex(CREEK_WATER_HEX)
  let v = pushFaceQuad(
    pos,
    nor,
    col,
    idx,
    vertex,
    [
      [x0, 0, z0],
      [x1, 0, z0],
      [x1, 0, z1],
      [x0, 0, z1],
    ],
    [x, wy, z],
    [0, 1, 0],
    tmp
  )

  tmp.setHex(CREEK_WATER_SIDE_HEX)
  const sideH = wy - bedY
  if (west > 0) {
    v = pushFaceQuad(
      pos,
      nor,
      col,
      idx,
      v,
      [
        [x0, 0, z0],
        [x0, 0, z1],
        [x0, sideH, z1],
        [x0, sideH, z0],
      ],
      [x, bedY, z],
      [-1, 0, 0],
      tmp
    )
  }
  if (east > 0) {
    v = pushFaceQuad(
      pos,
      nor,
      col,
      idx,
      v,
      [
        [x1, 0, z1],
        [x1, 0, z0],
        [x1, sideH, z0],
        [x1, sideH, z1],
      ],
      [x, bedY, z],
      [1, 0, 0],
      tmp
    )
  }
  if (south > 0) {
    v = pushFaceQuad(
      pos,
      nor,
      col,
      idx,
      v,
      [
        [x1, 0, z0],
        [x0, 0, z0],
        [x0, sideH, z0],
        [x1, sideH, z0],
      ],
      [x, bedY, z],
      [0, 0, -1],
      tmp
    )
  }
  if (north > 0) {
    v = pushFaceQuad(
      pos,
      nor,
      col,
      idx,
      v,
      [
        [x0, 0, z1],
        [x1, 0, z1],
        [x1, sideH, z1],
        [x0, sideH, z1],
      ],
      [x, bedY, z],
      [0, 0, 1],
      tmp
    )
  }
  return v
}

/** 水底湿沙 + 扁平石子（合批进 solid，可透过水面看见） */
function pushCreekBedDecor(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  lod: ChunkLod,
  tmp: THREE.Color
) {
  tmp.setHex(CREEK_BED_HEX)
  let v = pushFaceQuad(
    pos,
    nor,
    col,
    idx,
    vertex,
    [
      [0.04, 0, 0.04],
      [0.96, 0, 0.04],
      [0.96, 0, 0.96],
      [0.04, 0, 0.96],
    ],
    [x, y + 0.005, z],
    [0, 1, 0],
    tmp
  )

  const h = hash2(x, z, y ^ 0x3c)
  const pebbleN = lod >= 2 ? 1 + (h % 2) : lod === 1 ? 2 + (h % 2) : 3 + (h % 3)
  for (let i = 0; i < pebbleN; i++) {
    const hp = hash2(x + i * 11, z - i * 7, h ^ (0x44 + i))
    const px = x + 0.18 + ((hp % 64) / 100) * 0.64
    const pz = z + 0.18 + (((hp >> 6) % 64) / 100) * 0.64
    const py = y + 0.012 + ((hp >> 12) % 8) / 1000
    const s = 0.03 + ((hp >> 3) % 12) / 200
    tmp.setHex(CREEK_PEBBLE_HEX[hp % CREEK_PEBBLE_HEX.length])
    v = pushRockBlob(
      pos,
      nor,
      col,
      idx,
      v,
      px,
      py,
      pz,
      s * (1.1 + ((hp >> 2) % 8) / 20),
      s * (0.22 + ((hp >> 5) % 10) / 100),
      s * (0.9 + ((hp >> 8) % 10) / 20),
      ((hp % 628) / 100) * 0.5,
      hp,
      tmp
    )
  }
  return v
}

/** 溪边平躺小石（仅装饰，不改碰撞格） */
function pushCreekEdgeStones(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  lod: ChunkLod,
  tmp: THREE.Color
) {
  if (lod >= 2) return vertex
  const h = hash2(x, z, y ^ 0x5e)
  if (h % 3 !== 0) return vertex
  const n = lod === 0 ? 1 + (h % 2) : 1
  let v = vertex
  for (let i = 0; i < n; i++) {
    const hs = hash2(x + i * 9, z - i * 4, h ^ (0x61 + i))
    const px = x + 0.2 + ((hs % 60) / 100) * 0.6
    const pz = z + 0.2 + (((hs >> 6) % 60) / 100) * 0.6
    const s = 0.04 + ((hs >> 3) % 14) / 200
    tmp.setHex(CREEK_EDGE_STONE_HEX[hs % CREEK_EDGE_STONE_HEX.length])
    v = pushRockBlob(
      pos,
      nor,
      col,
      idx,
      v,
      px,
      y + 0.02,
      pz,
      s * (1.2 + ((hs >> 2) % 10) / 20),
      s * (0.18 + ((hs >> 5) % 12) / 100),
      s * (0.8 + ((hs >> 8) % 12) / 20),
      ((hs % 628) / 100) * 0.4,
      hs,
      tmp
    )
  }
  return v
}

/**
 * 邻格是否挡住本格这一面。
 * 树干/叶/灌木/天然石是造型物，不占满整格，不能当实心遮挡（否则草坪侧面会被错误裁掉变「透明」）。
 */
function neighborOccludesFace(
  world: InfiniteTerrain,
  nx: number,
  ny: number,
  nz: number,
  neighbor: BlockId
) {
  if (neighbor === 'air' || neighbor === 'water') return false
  if (neighbor === 'leaves' || neighbor === 'shrub' || neighbor === 'wood') return false
  // 天然石（含建模预览石）不占满整格；仅玩家建造石才遮挡
  if (neighbor === 'stone' && world.isNaturalStone(nx, ny, nz)) return false
  return true
}

/**
 * 可贪婪合并的实心建造方块。
 * 不含 grass/turf：侧面要「薄绿皮 + 大块泥土」分层，不能并成纯色大面。
 * 天然石仍走风格化路径。
 */
const GREEDY_SOLID: ReadonlySet<BlockId> = new Set([
  'plank',
  'dirt',
  'sand',
  'thatch',
  'alloy',
  'stone',
])

function isGreedySolidCell(world: InfiniteTerrain, id: BlockId, x: number, y: number, z: number) {
  if (!GREEDY_SOLID.has(id)) return false
  // 天然石堆仍用风格化网格，不进贪婪方块面
  if (id === 'stone' && world.isNaturalStone(x, y, z)) return false
  return true
}

/**
 * 对实心方块做 6 向贪婪网格。
 * lod≥1 时跳过底面；y 范围按 chunk 地表收窄。
 */
function pushGreedySolidQuads(
  world: InfiniteTerrain,
  cx: number,
  cz: number,
  lod: ChunkLod,
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  tmp: THREE.Color,
  yMin: number,
  yMax: number
) {
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const dims = [CHUNK_SIZE, yMax - yMin + 1, CHUNK_SIZE]
  const origin = [x0, yMin, z0]
  let v = vertex

  const dirs: { axis: 0 | 1 | 2; sign: 1 | -1; shade: 'top' | 'side' | 'bottom' }[] = [
    { axis: 0, sign: 1, shade: 'side' },
    { axis: 0, sign: -1, shade: 'side' },
    { axis: 1, sign: 1, shade: 'top' },
    { axis: 1, sign: -1, shade: 'bottom' },
    { axis: 2, sign: 1, shade: 'side' },
    { axis: 2, sign: -1, shade: 'side' },
  ]

  // 复用 mask，避免每片 new Array
  let mask: (BlockId | null)[] = []

  for (const dir of dirs) {
    if (lod >= 1 && dir.shade === 'bottom') continue

    const uA = ((dir.axis + 1) % 3) as 0 | 1 | 2
    const vA = ((dir.axis + 2) % 3) as 0 | 1 | 2
    const sliceCount = dims[dir.axis]
    const uSize = dims[uA]
    const vSize = dims[vA]
    const maskLen = uSize * vSize
    if (mask.length < maskLen) mask = new Array(maskLen)

    for (let slice = 0; slice < sliceCount; slice++) {
      for (let i = 0; i < maskLen; i++) mask[i] = null

      for (let vv = 0; vv < vSize; vv++) {
        for (let uu = 0; uu < uSize; uu++) {
          const coord = [0, 0, 0]
          coord[dir.axis] = slice
          coord[uA] = uu
          coord[vA] = vv
          const x = origin[0] + coord[0]
          const y = origin[1] + coord[1]
          const z = origin[2] + coord[2]
          const id = world.get(x, y, z)
          if (!isGreedySolidCell(world, id, x, y, z)) continue
          const nx = x + (dir.axis === 0 ? dir.sign : 0)
          const ny = y + (dir.axis === 1 ? dir.sign : 0)
          const nz = z + (dir.axis === 2 ? dir.sign : 0)
          const neighbor = world.get(nx, ny, nz)
          if (neighborOccludesFace(world, nx, ny, nz, neighbor)) continue
          mask[uu + vv * uSize] = id
        }
      }

      let n = 0
      while (n < maskLen) {
        const id = mask[n]
        if (id == null) {
          n++
          continue
        }
        const uu = n % uSize
        const vv = (n / uSize) | 0
        let w = 1
        while (uu + w < uSize && mask[n + w] === id) w++
        let h = 1
        grow: while (vv + h < vSize) {
          for (let k = 0; k < w; k++) {
            if (mask[uu + k + (vv + h) * uSize] !== id) break grow
          }
          h++
        }
        for (let dv = 0; dv < h; dv++) {
          for (let du = 0; du < w; du++) {
            mask[uu + du + (vv + dv) * uSize] = null
          }
        }

        const palette = BLOCK_FACES[id as Exclude<BlockId, 'air'>]
        tmp.setHex(palette[dir.shade])
        if (dir.shade === 'side') tmp.multiplyScalar(0.94)
        if (dir.shade === 'bottom') tmp.multiplyScalar(0.8)

        const plane = origin[dir.axis] + slice + (dir.sign > 0 ? 1 : 0)
        const corners: [number, number, number][] = [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ]
        const put = (i: number, u: number, vLoc: number) => {
          const p: [number, number, number] = [0, 0, 0]
          p[dir.axis] = plane
          p[uA] = origin[uA] + u
          p[vA] = origin[vA] + vLoc
          corners[i] = p
        }
        // 与 FACES 同向，保证光照法线朝外
        if (dir.sign > 0) {
          put(0, uu, vv)
          put(1, uu + w, vv)
          put(2, uu + w, vv + h)
          put(3, uu, vv + h)
        } else {
          put(0, uu, vv + h)
          put(1, uu + w, vv + h)
          put(2, uu + w, vv)
          put(3, uu, vv)
        }

        const normal: [number, number, number] = [0, 0, 0]
        normal[dir.axis] = dir.sign
        v = pushFaceQuad(pos, nor, col, idx, v, corners, [0, 0, 0], normal, tmp, 0, FACE_SEAM_EXPAND)
        n++
      }
    }
  }
  return v
}

/** 扫描体素并产出 TypedArray（Worker / 主线程共用） */
function buildChunkMeshBuffersInner(
  world: InfiniteTerrain,
  cx: number,
  cz: number,
  lod: ChunkLod = 0
): ChunkMeshBuffers {
  // 先烘焙本块体素：块内 get/面剔除 O(1)；邻块未缓存时仍走 sample
  world.warmChunkVoxelsForMesh(cx, cz)

  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const x1 = x0 + CHUNK_SIZE
  const z1 = z0 + CHUNK_SIZE

  const solidPos: number[] = []
  const solidNor: number[] = []
  const solidCol: number[] = []
  const solidIdx: number[] = []
  let solidV = 0

  const waterPos: number[] = []
  const waterNor: number[] = []
  const waterCol: number[] = []
  const waterIdx: number[] = []
  let waterV = 0

  const grassPos: number[] = []
  const grassNor: number[] = []
  const grassUv: number[] = []
  const grassIdx: number[] = []
  let grassV = 0

  const tmp = new THREE.Color()
  // 按本 chunk 地表收窄 Y：起伏后若仍扫 0..MESH_Y_MAX，CPU 会暴涨
  const { minSy, maxSy } = world.chunkSurfaceRange(cx, cz)
  const yMin = Math.max(0, minSy - 1)
  const yMax = Math.min(MESH_Y_MAX, maxSy + 1 + FEATURE_HEADROOM)

  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const id = world.get(x, y, z)
        if (id === 'air') continue

        if (
          world.get(x + 1, y, z) !== 'air' &&
          world.get(x - 1, y, z) !== 'air' &&
          world.get(x, y + 1, z) !== 'air' &&
          world.get(x, y - 1, z) !== 'air' &&
          world.get(x, y, z + 1) !== 'air' &&
          world.get(x, y, z - 1) !== 'air'
        ) {
          // 树叶/木/石/灌木仍要出外观；草坪在树石下也要出顶面（否则镂空露天）
          if (
            id !== 'water' &&
            id !== 'leaves' &&
            id !== 'wood' &&
            id !== 'stone' &&
            id !== 'shrub' &&
            id !== 'grass' &&
            id !== 'turf'
          ) {
            continue
          }
        }

        const palette = BLOCK_FACES[id]
        const isWater = id === 'water'

        // 小溪：浅水面 + 水底石子（跳过方块水）
        if (id === 'water') {
          waterV = pushCreekWaterCell(
            waterPos,
            waterNor,
            waterCol,
            waterIdx,
            waterV,
            x,
            y,
            z,
            world,
            tmp
          )
          solidV = pushCreekBedDecor(
            solidPos,
            solidNor,
            solidCol,
            solidIdx,
            solidV,
            x,
            y,
            z,
            lod,
            tmp
          )
          continue
        }

        // 溪边草地：平躺装饰石
        if ((id === 'grass' || id === 'turf') && world.isCreekBank(x, z)) {
          solidV = pushCreekEdgeStones(
            solidPos,
            solidNor,
            solidCol,
            solidIdx,
            solidV,
            x,
            y,
            z,
            lod,
            tmp
          )
        }

        // 自然草：卡片草单独层；方块面走下方分层侧面（上绿下土）
        if (id === 'grass' && world.get(x, y + 1, z) === 'air') {
          grassV = pushGrassCards(grassPos, grassNor, grassUv, grassIdx, grassV, x, y, z, lod)
        }
        if (isGreedySolidCell(world, id, x, y, z)) continue

        // 灌木：枝干 + 草叶（跳过方块面）
        if (id === 'shrub') {
          solidV = pushStylizedShrub(solidPos, solidNor, solidCol, solidIdx, solidV, x, y, z, lod, tmp)
          continue
        }

        // 石头：仅天然石堆用风格化组合石；玩家放置的石头走方块贪婪网格
        if (id === 'stone') {
          if (world.isNaturalRockFollower(x, y, z)) continue
          const size = world.naturalRockAnchorSize(x, y, z)
          if (size != null) {
            solidV = pushStylizedRock(
              solidPos,
              solidNor,
              solidCol,
              solidIdx,
              solidV,
              x,
              y,
              z,
              size,
              tmp,
              lod
            )
            continue
          }
        }

        // 树叶：弯曲叶瓣（表面更密，内部也补密度）
        if (id === 'leaves') {
          const exposed =
            world.get(x + 1, y, z) === 'air' ||
            world.get(x - 1, y, z) === 'air' ||
            world.get(x, y + 1, z) === 'air' ||
            world.get(x, y - 1, z) === 'air' ||
            world.get(x, y, z + 1) === 'air' ||
            world.get(x, y, z - 1) === 'air'
          solidV = pushLeafCluster(
            solidPos,
            solidNor,
            solidCol,
            solidIdx,
            solidV,
            x,
            y,
            z,
            tmp,
            exposed,
            lod
          )
          continue
        }

        // 木头：空心圆柱（只渲染外壁）
        if (id === 'wood') {
          solidV = pushWoodCylinder(
            solidPos,
            solidNor,
            solidCol,
            solidIdx,
            solidV,
            x,
            y,
            z,
            world,
            tmp
          )
          continue
        }

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir
          const nx = x + dx
          const ny = y + dy
          const nz = z + dz
          const neighbor = world.get(nx, ny, nz)
          if (isWater) {
            // 只对空气出面，靠透明度透出河床与岸壁颜色
            if (neighbor !== 'air') continue
          } else if (neighborOccludesFace(world, nx, ny, nz, neighbor)) {
            continue
          }

          const pos = isWater ? waterPos : solidPos
          const nor = isWater ? waterNor : solidNor
          const col = isWater ? waterCol : solidCol
          const idx = isWater ? waterIdx : solidIdx
          const yBias = isWater && face.shade === 'top' ? -0.08 : 0

          if ((id === 'grass' || id === 'turf') && face.shade === 'side') {
            // 侧面：薄绿皮 + 大块泥土（精确对接，不重叠外扩）
            const split = 1 - GRASS_CAP
            tmp.setHex(GRASS_SIDE_DIRT).multiplyScalar(0.94)
            solidV = pushFaceQuad(
              solidPos,
              solidNor,
              solidCol,
              solidIdx,
              solidV,
              sideBandCorners(face.corners, 0, split),
              [x, y, z],
              [dx, dy, dz],
              tmp,
              0,
              FACE_SEAM_EXPAND
            )
            tmp.setHex(GRASS_SIDE_TOP).multiplyScalar(0.96)
            solidV = pushFaceQuad(
              solidPos,
              solidNor,
              solidCol,
              solidIdx,
              solidV,
              sideBandCorners(face.corners, split, 1),
              [x, y, z],
              [dx, dy, dz],
              tmp,
              0,
              FACE_SEAM_EXPAND
            )
            continue
          }

          // 远景草坪底面可省
          if ((id === 'grass' || id === 'turf') && face.shade === 'bottom' && lod >= 1) {
            continue
          }

          if (!palette) continue
          tmp.setHex(palette[face.shade])
          if (face.shade === 'side') tmp.multiplyScalar(0.94)
          if (face.shade === 'bottom') tmp.multiplyScalar(0.8)
          // 水面略淡，透出河床与岸色
          if (isWater) tmp.multiplyScalar(face.shade === 'top' ? 0.95 : 0.85)
          // 草坪顶面深浅不均，避免纯色平板
          if ((id === 'grass' || id === 'turf') && face.shade === 'top') {
            const hv = hash2(x, z, y ^ 0x2a)
            tmp.multiplyScalar(0.88 + (hv % 22) / 100)
          }

          // 树墩 / 碎石摊：矮一截，碎石摊像一摊碎石
          let corners = face.corners
          let faceYBias = yBias
          if (id === 'stump') {
            corners = shortBlockCorners(face.corners, 0, STUMP_H)
            if (face.shade === 'top' && neighbor !== 'air' && neighbor !== 'water') continue
          } else if (id === 'rubble') {
            corners = shortBlockCorners(face.corners, 0, RUBBLE_H, RUBBLE_INSET)
            if (face.shade === 'top' && neighbor !== 'air' && neighbor !== 'water') continue
          }

          if (isWater) {
            waterV = pushFaceQuad(
              pos,
              nor,
              col,
              idx,
              waterV,
              corners,
              [x, y, z],
              [dx, dy, dz],
              tmp,
              faceYBias,
              FACE_SEAM_EXPAND
            )
          } else {
            solidV = pushFaceQuad(
              pos,
              nor,
              col,
              idx,
              solidV,
              corners,
              [x, y, z],
              [dx, dy, dz],
              tmp,
              faceYBias,
              FACE_SEAM_EXPAND
            )
          }
        }
      }
    }
  }

  solidV = pushGreedySolidQuads(
    world,
    cx,
    cz,
    lod,
    solidPos,
    solidNor,
    solidCol,
    solidIdx,
    solidV,
    tmp,
    yMin,
    yMax
  )

  return {
    lod,
    solid:
      solidPos.length > 0
        ? {
            pos: new Float32Array(solidPos),
            nor: new Float32Array(solidNor),
            col: new Float32Array(solidCol),
            idx: new Uint32Array(solidIdx),
          }
        : null,
    water:
      waterPos.length > 0
        ? {
            pos: new Float32Array(waterPos),
            nor: new Float32Array(waterNor),
            col: new Float32Array(waterCol),
            idx: new Uint32Array(waterIdx),
          }
        : null,
    grass:
      grassPos.length > 0
        ? {
            pos: new Float32Array(grassPos),
            nor: new Float32Array(grassNor),
            uv: new Float32Array(grassUv),
            idx: new Uint32Array(grassIdx),
          }
        : null,
  }
}

export type ChunkMeshLayerBuffers = {
  pos: Float32Array
  nor: Float32Array
  col: Float32Array
  idx: Uint32Array
}

export type ChunkGrassBuffers = {
  pos: Float32Array
  nor: Float32Array
  uv: Float32Array
  idx: Uint32Array
}

export type ChunkMeshBuffers = {
  lod: ChunkLod
  solid: ChunkMeshLayerBuffers | null
  water: ChunkMeshLayerBuffers | null
  grass: ChunkGrassBuffers | null
}

/** 供 Worker / 主线程：只算顶点缓冲，不碰 Mesh */
export function buildChunkMeshBuffers(
  world: InfiniteTerrain,
  cx: number,
  cz: number,
  lod: ChunkLod = 0
): ChunkMeshBuffers {
  return buildChunkMeshBuffersInner(world, cx, cz, lod)
}

function makeLayerMesh(
  layer: ChunkMeshLayerBuffers | null,
  transparent: boolean
): THREE.Mesh | null {
  if (!layer) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(layer.pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(layer.nor, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(layer.col, 3))
  geo.setIndex(new THREE.BufferAttribute(layer.idx, 1))
  geo.computeBoundingSphere()
  const mesh = new THREE.Mesh(geo, transparent ? getSharedWaterMat() : getSharedSolidMat())
  mesh.frustumCulled = true
  mesh.renderOrder = transparent ? 2 : 0
  mesh.userData.sharedMat = true
  mesh.matrixAutoUpdate = false
  mesh.updateMatrix()
  return mesh
}

export function meshesFromChunkBuffers(data: ChunkMeshBuffers): ChunkMeshes {
  let grass: THREE.Mesh | null = null
  if (data.grass) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(data.grass.pos, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(data.grass.nor, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(data.grass.uv, 2))
    geo.setIndex(new THREE.BufferAttribute(data.grass.idx, 1))
    geo.computeBoundingSphere()
    grass = new THREE.Mesh(geo, getGrassTuftMaterial())
    grass.frustumCulled = true
    grass.renderOrder = 1
    grass.userData.sharedMat = true
    grass.matrixAutoUpdate = false
    grass.updateMatrix()
  }
  return {
    solid: makeLayerMesh(data.solid, false),
    water: makeLayerMesh(data.water, true),
    grass,
    lod: data.lod,
  }
}

/**
 * 廉价地表代理：只铺顶面与台阶侧面（无树草）。
 * Worker 完整网格未到时先挡住「镂空空气」，转视角不再穿帮。
 */
export function buildChunkGroundProxy(
  world: InfiniteTerrain,
  cx: number,
  cz: number
): ChunkMeshes {
  world.warmChunkVoxelsForMesh(cx, cz)

  const solidPos: number[] = []
  const solidNor: number[] = []
  const solidCol: number[] = []
  const solidIdx: number[] = []
  let solidV = 0

  const waterPos: number[] = []
  const waterNor: number[] = []
  const waterCol: number[] = []
  const waterIdx: number[] = []
  let waterV = 0

  const tmp = new THREE.Color()
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const dirs: [number, number, number, [number, number, number][]][] = [
    [1, 0, 0, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [-1, 0, 0, [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
    [0, 0, 1, [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [0, 0, -1, [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
  ]

  for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
    for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
      const sy = world.surfaceHeight(x, z)
      const id = world.get(x, sy, z)
      const isWater = id === 'water'

      if (isWater) {
        tmp.setHex(0x3a7a9a).multiplyScalar(0.92)
        waterV = pushFaceQuad(
          waterPos,
          waterNor,
          waterCol,
          waterIdx,
          waterV,
          [
            [0, 1, 1],
            [1, 1, 1],
            [1, 1, 0],
            [0, 1, 0],
          ],
          [x, sy, z],
          [0, 1, 0],
          tmp,
          0.02,
          FACE_SEAM_EXPAND
        )
        tmp.setHex(0xb89a6a).multiplyScalar(0.9)
        solidV = pushFaceQuad(
          solidPos,
          solidNor,
          solidCol,
          solidIdx,
          solidV,
          [
            [0.02, 0, 0.02],
            [0.98, 0, 0.02],
            [0.98, 0, 0.98],
            [0.02, 0, 0.98],
          ],
          [x, sy + 0.01, z],
          [0, 1, 0],
          tmp,
          0,
          FACE_SEAM_EXPAND
        )
      } else {
        const hex =
          id === 'sand' ? 0xe8d7a5 : id === 'dirt' || id === 'air' ? 0x9a6b3c : 0x6db33f
        tmp.setHex(hex).multiplyScalar(0.96)
        solidV = pushFaceQuad(
          solidPos,
          solidNor,
          solidCol,
          solidIdx,
          solidV,
          [
            [0, 1, 1],
            [1, 1, 1],
            [1, 1, 0],
            [0, 1, 0],
          ],
          [x, sy, z],
          [0, 1, 0],
          tmp,
          0,
          FACE_SEAM_EXPAND
        )
      }

      // 台阶侧面：邻柱更低时补竖直条，避免坡地镂空
      for (const [dx, , dz, corners] of dirs) {
        const nsy = world.surfaceHeight(x + dx, z + dz)
        if (nsy >= sy) continue
        for (let y = nsy; y < sy; y++) {
          tmp.setHex(0x8b5a2b).multiplyScalar(0.88)
          solidV = pushFaceQuad(
            solidPos,
            solidNor,
            solidCol,
            solidIdx,
            solidV,
            corners as [number, number, number][],
            [x, y, z],
            [dx, 0, dz],
            tmp,
            0,
            FACE_SEAM_EXPAND
          )
        }
      }
    }
  }

  const toLayer = (pos: number[], nor: number[], col: number[], idx: number[]) =>
    pos.length
      ? {
          pos: new Float32Array(pos),
          nor: new Float32Array(nor),
          col: new Float32Array(col),
          idx: new Uint32Array(idx),
        }
      : null

  return {
    solid: makeLayerMesh(toLayer(solidPos, solidNor, solidCol, solidIdx), false),
    water: makeLayerMesh(toLayer(waterPos, waterNor, waterCol, waterIdx), true),
    grass: null,
    lod: 2,
    proxy: true,
  }
}

/** 供建模预览等外部使用；lod 默认近景全密度 */
export function buildChunkMeshes(
  world: InfiniteTerrain,
  cx: number,
  cz: number,
  lod: ChunkLod = 0
): ChunkMeshes {
  return meshesFromChunkBuffers(buildChunkMeshBuffers(world, cx, cz, lod))
}

function disposeMesh(mesh: THREE.Mesh | null) {
  if (!mesh) return
  mesh.geometry.dispose()
  const mat = mesh.material as THREE.Material
  // 共享材质（草/solid/water）不销毁
  if (mesh.userData.sharedMat || mat === grassTuftMat || mat === sharedSolidMat || mat === sharedWaterMat) {
    return
  }
  mat.dispose()
}

let sharedSolidMat: THREE.MeshLambertMaterial | null = null
let sharedWaterMat: THREE.MeshLambertMaterial | null = null

export function getSharedSolidMat() {
  if (!sharedSolidMat) {
    sharedSolidMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    })
  }
  return sharedSolidMat
}

export function getSharedWaterMat() {
  if (!sharedWaterMat) {
    sharedWaterMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  }
  return sharedWaterMat
}

export function disposeChunkMeshes(meshes: ChunkMeshes) {
  disposeMesh(meshes.solid)
  disposeMesh(meshes.water)
  disposeMesh(meshes.grass)
}
