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

/** 俯视小地图地表种类 */
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

const BLOCK_FACES: Record<
  Exclude<BlockId, 'air'>,
  { top: number; side: number; bottom: number; opacity?: number }
> = {
  grass: { top: 0x6db33f, side: 0x6db33f, bottom: 0x9a6b3c },
  turf: { top: 0x6db33f, side: 0x6db33f, bottom: 0x9a6b3c },
  dirt: { top: 0x9a6b3c, side: 0x845a32, bottom: 0x6e4a2a },
  sand: { top: 0xe8d7a5, side: 0xdccb90, bottom: 0xcfbe7c },
  water: { top: 0x3a7a9a, side: 0x2f6a88, bottom: 0x1a4a6a, opacity: 0.62 },
  stone: { top: 0x8a8e94, side: 0x7a7e84, bottom: 0x6a6e74 },
  wood: { top: 0x6b4a2a, side: 0x5a3a1e, bottom: 0x4a2e14 },
  leaves: { top: 0x4fb844, side: 0x45a83c, bottom: 0x3a8f32 },
  shrub: { top: 0x8a9a3a, side: 0x7a8a30, bottom: 0x6a7a28 },
  plank: { top: 0xc4a06a, side: 0xb89058, bottom: 0xa88048 },
  thatch: { top: 0xc4b06a, side: 0xb4a05a, bottom: 0xa4904a },
  stump: { top: 0x6e4220, side: 0x5a3518, bottom: 0x3f2410 },
  rubble: { top: 0xa8a49a, side: 0x8e8a80, bottom: 0x6e6a62 },
  alloy: { top: 0xb7b9bc, side: 0xa3a6aa, bottom: 0x8e9196 },
}

/** 破坏掉落 */
const BLOCK_HARVEST: Partial<
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

const BLOCK_LABEL: Record<BlockId, string> = {
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

/** 地表高度：平坦草坪 */
export const SURFACE_Y = 4
/** 树 / 石 / 灌木立在草皮之上的起始层（不替换地表草） */
export const FEATURE_Y = SURFACE_Y + 1
/** 网格最高层（含树与建造） */
const MESH_Y_MAX = SURFACE_Y + 28
const CHUNK_SIZE = 16
/** 玩家周围加载半径（块） */
const LOAD_RADIUS = 5
/** 卸载半径略大，避免边界抖动 */
const UNLOAD_RADIUS = 6
/** 准星可交互距离（格）；超出不高亮、不可挖放 */
const REACH_DISTANCE = 5
/** 玩家碰撞：眼高、身高、半宽（防穿墙） */
const PLAYER_EYE = 1.62
const PLAYER_EYE_CROUCH = 1.15
const PLAYER_HEIGHT = 1.75
const PLAYER_HEIGHT_CROUCH = 1.35
const PLAYER_HALF_W = 0.28
/** 蹲/起身眼高过渡速度（越大越快） */
const CROUCH_EYE_LERP = 5.5

function chunkKey(cx: number, cz: number) {
  return `${cx},${cz}`
}

function blockKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`
}

function hash2(x: number, z: number, seed: number) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seed | 0)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return (n ^ (n >>> 16)) >>> 0
}

/** 无限平坦世界：草坪 + 土地，小溪横切；自然石头/树/灌木；overrides 记录挖放 */
export class InfiniteTerrain {
  readonly seed: number
  private overrides = new Map<string, BlockId>()

  constructor(seed = 42) {
    this.seed = seed
  }

  creekCenterZ(x: number) {
    return (
      Math.sin(x * 0.035 + this.seed * 0.001) * 6 +
      Math.sin(x * 0.012 + 1.7) * 3
    )
  }

  isCreek(x: number, z: number) {
    const d = Math.abs(z - this.creekCenterZ(x))
    return d < 1.65
  }

  isCreekBank(x: number, z: number) {
    const d = Math.abs(z - this.creekCenterZ(x))
    return d >= 1.65 && d < 2.6
  }

  sample(x: number, y: number, z: number): BlockId {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const iz = Math.floor(z)
    const o = this.overrides.get(blockKey(ix, iy, iz))
    if (o !== undefined) return o

    if (iy < 0) return 'dirt'

    const creek = this.isCreek(ix, iz)
    const bank = this.isCreekBank(ix, iz)

    if (!creek && !bank) {
      const feat = this.featureBlock(ix, iy, iz)
      if (feat) return feat
    }

    if (iy > SURFACE_Y) return 'air'

    if (creek) {
      if (iy < SURFACE_Y) return 'dirt'
      if (iy === SURFACE_Y) return 'water'
      return 'air'
    }

    // 溪岸：草地可走到水边（无沙岸挡条），仍禁树木等大型特征
    if (iy < SURFACE_Y) return 'dirt'
    if (iy === SURFACE_Y) return 'grass'
    return 'air'
  }

  private featureBlock(ix: number, iy: number, iz: number): BlockId | null {
    if (iy === FEATURE_Y) {
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
        // 树干从草皮之上开始，不替换地表草方块
        const top = FEATURE_Y + trunkH

        if (dx === 0 && dz === 0 && iy >= FEATURE_Y && iy < top) return 'wood'

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
   * 天然石堆外观锚点：种子格在草皮之上（FEATURE_Y）返回尺寸。
   * 其它天然石格应跳过方块出面（由锚点画整坨风格化石）。
   */
  naturalRockAnchorSize(x: number, y: number, z: number): number | null {
    if (y !== FEATURE_Y) return null
    if (this.get(x, y, z) !== 'stone') return null
    const o = this.overrides.get(blockKey(x, y, z))
    if (o !== undefined) return null // 玩家改过的格不当天然锚点
    const info = this.rockSeedInfo(x, z)
    return info ? info.size : null
  }

  /** 是否属于天然石堆但非锚点（只碰撞、不单独画方块） */
  isNaturalRockFollower(x: number, y: number, z: number): boolean {
    if (this.get(x, y, z) !== 'stone') return false
    const o = this.overrides.get(blockKey(x, y, z))
    if (o !== undefined) return false
    if (this.naturalRockAnchorSize(x, y, z) != null) return false
    return this.rockAt(x, y, z) === 'stone'
  }

  private rockAt(ix: number, iy: number, iz: number): BlockId | null {
    if (iy < FEATURE_Y || iy > FEATURE_Y + 3) return null
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const info = this.rockSeedInfo(ix - dx, iz - dz)
        if (!info) continue
        const { size } = info
        const maxR = size === 1 ? 0 : 1
        const maxH = size
        if (Math.abs(dx) > maxR || Math.abs(dz) > maxR) continue
        const localY = iy - FEATURE_Y
        if (localY < 0 || localY >= maxH) continue
        if (size >= 3 && localY >= 2 && Math.abs(dx) + Math.abs(dz) > 0) continue
        if (size === 2 && localY >= 1 && Math.abs(dx) + Math.abs(dz) > 1) continue
        return 'stone'
      }
    }
    return null
  }

  get(x: number, y: number, z: number): BlockId {
    return this.sample(x, y, z)
  }

  /**
   * 俯视小地图用地表种类：草地 / 溪水 / 沙岸 / 石头 / 树 / 灌木 / 建造物。
   * 与 sample 同源，避免逐格扫整棵树。
   */
  minimapKind(x: number, z: number): MinimapKind {
    const ix = Math.floor(x)
    const iz = Math.floor(z)

    if (this.looksLikePlayerBuild(ix, iz)) return 'build'

    const oSurf = this.overrides.get(blockKey(ix, SURFACE_Y, iz))
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

    const oAbove = this.overrides.get(blockKey(ix, SURFACE_Y + 1, iz))
    if (oAbove !== undefined && oAbove !== 'air' && oAbove !== 'leaves' && oAbove !== 'water') {
      if (oAbove === 'shrub') return 'shrub'
      if (oAbove === 'stone' || oAbove === 'rubble' || oAbove === 'alloy') return 'stone'
      if (oAbove === 'wood' || oAbove === 'plank') return 'wood'
      return 'build'
    }

    if (this.isCreek(ix, iz)) return 'water'
    if (this.isCreekBank(ix, iz)) return 'sand'

    const hs = hash2(ix, iz, this.seed ^ 0x51)
    if (hs % 47 === 0 && !this.nearTreeTrunk(ix, iz) && !this.nearRock(ix, iz, 2)) {
      return 'shrub'
    }

    if (this.isTreeSeed(ix, iz)) return 'wood'
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dz === 0) continue
        if (!this.isTreeSeed(ix - dx, iz - dz)) continue
        const ax = Math.abs(dx)
        const az = Math.abs(dz)
        if (ax <= 2 && az <= 2 && ax + az <= 3) return 'tree'
      }
    }

    if (this.rockAt(ix, FEATURE_Y, iz) || this.rockAt(ix, FEATURE_Y + 1, iz)) {
      return 'stone'
    }

    return 'grass'
  }

  set(x: number, y: number, z: number, id: BlockId) {
    this.overrides.set(blockKey(Math.floor(x), Math.floor(y), Math.floor(z)), id)
  }

  solid(x: number, y: number, z: number) {
    const id = this.get(x, y, z)
    // 树叶可穿过，不当障碍；树干仍阻挡
    return id !== 'air' && id !== 'water' && id !== 'leaves'
  }

  /**
   * 该列是否像玩家房屋/墙体：覆盖层里有墙体或地板建材。
   * 忽略挖空（air）与单纯地表挖掘，避免误判。
   */
  looksLikePlayerBuild(ix: number, iz: number): boolean {
    const x = Math.floor(ix)
    const z = Math.floor(iz)
    for (let y = SURFACE_Y; y <= SURFACE_Y + 12; y++) {
      const o = this.overrides.get(blockKey(x, y, z))
      if (o === undefined || o === 'air' || o === 'water' || o === 'leaves') continue
      if (o === 'plank' || o === 'turf') return true
      if (y >= SURFACE_Y + 1) return true
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

  private enumerateRock(sx: number, sz: number, size: number) {
    const cells: { x: number; y: number; z: number }[] = []
    const maxR = size === 1 ? 0 : 1
    const maxH = size
    for (let dz = -maxR; dz <= maxR; dz++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        for (let localY = 0; localY < maxH; localY++) {
          if (size >= 3 && localY >= 2 && Math.abs(dx) + Math.abs(dz) > 0) continue
          if (size === 2 && localY >= 1 && Math.abs(dx) + Math.abs(dz) > 1) continue
          cells.push({ x: sx + dx, y: FEATURE_Y + localY, z: sz + dz })
        }
      }
    }
    return cells
  }
}

type ChunkLod = 0 | 1 | 2
type ChunkMeshes = {
  solid: THREE.Mesh | null
  water: THREE.Mesh | null
  grass: THREE.Mesh | null
  lod: ChunkLod
}

/** chunk 切比雪夫距离 → LOD：0 近 / 1 中 / 2 远 */
function chunkLodFromDist(dist: number): ChunkLod {
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
  const pull = inset
  for (const c of corners) {
    // 沿法线内收一点，叶块之间留缝
    pos.push(ox + c[0] - nx * pull, oy + c[1] + yBias - ny * pull, oz + c[2] - nz * pull)
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

function getGrassTuftMaterial() {
  if (grassTuftMat) return grassTuftMat
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
 * 卡片草：近处 2～3 簇；中距离抽稀 1～2 簇；远处隔格最多 1 簇。
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
  // 中/远：棋盘抽稀，近处全密度
  if (lod >= 1 && ((x + z) & 1) === 1) return vertex

  let count: number
  if (lod >= 2) count = 1
  else if (lod === 1) count = 1 + (h % 2)
  else count = 2 + (h % 2)

  let v = vertex
  const topY = y + 1
  const slots: [number, number][] =
    count === 1
      ? [[0.5, 0.5]]
      : count === 2
        ? [
            [0.22, 0.22],
            [0.78, 0.78],
          ]
        : [
            [0.2, 0.28],
            [0.8, 0.22],
            [0.5, 0.8],
          ]
  const rot = (h % 4) * (Math.PI / 2)
  const rc = Math.cos(rot)
  const rs = Math.sin(rot)
  for (let i = 0; i < count; i++) {
    const hx = hash2(x + i * 19, z - i * 11, y ^ (0x71 + i * 13))
    let lx = slots[i][0] - 0.5
    let lz = slots[i][1] - 0.5
    const rx = lx * rc - lz * rs
    const rz = lx * rs + lz * rc
    const jitter = lod >= 2 ? 0.03 : 0.06
    const cx = x + 0.5 + rx + (((hx % 17) - 8) / 100) * jitter * 8
    const cz = z + 0.5 + rz + ((((hx >> 5) % 17) - 8) / 100) * jitter * 8
    const hgt = 0.2 + ((hx >> 3) % 14) / 100
    const halfW = 0.18 + ((hx >> 9) % 10) / 100
    const yaw0 = ((hx % 628) / 100) * 0.5
    const planes = lod >= 2 ? 2 : 3
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
  color: THREE.Color
) {
  const segs = 4
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
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs
    const t1 = (i + 1) / segs
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
function pushLeafCluster(
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
  if (lod >= 2) count = 2 + (h % 2)
  else if (lod === 1) count = exposed ? 5 + (h % 2) : 3 + (h % 2)
  else count = exposed ? 10 + (h % 4) : 7 + (h % 3)
  let v = vertex
  for (let i = 0; i < count; i++) {
    const hx = hash2(x + i * 5, z + i, y ^ (0x41 + i * 7))
    const ox = x + 0.02 + ((hx % 96) / 100) * 0.96
    const oy = y + 0.02 + (((hx >> 6) % 96) / 100) * 0.96
    const oz = z + 0.02 + (((hx >> 12) % 96) / 100) * 0.96
    const yaw = ((hx % 628) / 100) * 1.0
    const pitch = -0.5 + (((hx >> 4) % 65) / 100) * 1.1
    const len = (lod >= 2 ? 0.55 : 0.78) + ((hx >> 3) % 40) / 100
    const wid = (lod >= 2 ? 0.18 : 0.24) + ((hx >> 8) % 18) / 100
    const bend = 0.14 + ((hx >> 2) % 14) / 100
    tmp.setHex(0x4fb844).multiplyScalar(0.84 + ((hx >> 9) % 26) / 100)
    v = pushCurvedLeafBlade(pos, nor, col, idx, v, ox, oy, oz, yaw, pitch, len, wid, bend, tmp)
  }
  return v
}

const WOOD_CYL_SIDES = 8
const WOOD_TRUNK_R = 0.3
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
    const corners: [number, number, number][] = [
      [x0, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z0],
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
    const corners: [number, number, number][] = [
      [ax + r0x, ay + r0y, az + r0z],
      [ax + r1x, ay + r1y, az + r1z],
      [bx + r1x, by + r1y, bz + r1z],
      [bx + r0x, by + r0y, bz + r0z],
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
function pushWoodCylinder(
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
function pushStylizedRock(
  pos: number[],
  nor: number[],
  col: number[],
  idx: number[],
  vertex: number,
  x: number,
  y: number,
  z: number,
  size: number,
  tmp: THREE.Color
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
  // 底部贴草地顶（y 为 FEATURE_Y / 石堆底格），略埋一点更稳
  const cy = y + sy * 0.55

  let v = pushRockBlob(pos, nor, col, idx, vertex, cx, cy, cz, sx, sy, sz, yaw, h, tmp)

  // 中石 1 个凸起、大石 2 个；凸起更小，总面数仍可控
  const bumps = size === 1 ? 0 : size === 2 ? 1 : 2
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
function pushStylizedShrub(
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
  const stemCount = lod >= 2 ? 2 : lod === 1 ? 3 : 4
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
    const midLeaves = lod >= 2 ? 2 : lod === 1 ? 4 : 7
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
      lod >= 2 ? 0.75 : 1,
      tmp
    )

    const subCount = lod >= 2 ? 1 : lod === 1 ? 2 : 3 + (hx % 2)
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

      const leafCount = lod >= 2 ? 3 : lod === 1 ? 5 : 8 + (hs % 3)
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
        lod >= 2 ? 0.8 : 1.05,
        tmp
      )
    }

    // 主枝顶端叶团
    const tipLeaves = lod >= 2 ? 3 : lod === 1 ? 6 : 10
    v = pushShrubLeafBurst(pos, nor, col, idx, v, tipX, tipY, tipZ, h ^ (0xa1 + i * 5), tipLeaves, 1.1, tmp)
  }

  // 冠层体积填叶 + 基部（近/中景）
  if (lod < 2) {
    const canopyN = lod === 0 ? 18 : 10
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
    const baseN = lod === 0 ? 10 : 5
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

/** 供建模预览等外部使用；lod 默认近景全密度 */
export function buildChunkMeshes(
  world: InfiniteTerrain,
  cx: number,
  cz: number,
  lod: ChunkLod = 0
): ChunkMeshes {
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
  const yMin = 0
  const yMax = MESH_Y_MAX

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

        // 灌木：枝干 + 草叶（跳过方块面）
        if (id === 'shrub') {
          solidV = pushStylizedShrub(solidPos, solidNor, solidCol, solidIdx, solidV, x, y, z, lod, tmp)
          continue
        }

        // 石头：天然锚点 / 放置石堆各画一次风格化组合石（跟随格跳过）
        if (id === 'stone') {
          if (world.isNaturalRockFollower(x, y, z)) continue
          let size = world.naturalRockAnchorSize(x, y, z)
          let drawX = x
          let drawY = y
          let drawZ = z
          if (size == null) {
            const cells = world.rockCellsAt(x, y, z)
            if (!cells?.length) continue
            let best = cells[0]
            for (const c of cells) {
              if (
                c.y < best.y ||
                (c.y === best.y && (c.x < best.x || (c.x === best.x && c.z < best.z)))
              ) {
                best = c
              }
            }
            if (best.x !== x || best.y !== y || best.z !== z) continue
            size = cells.length <= 1 ? 1 : cells.length <= 4 ? 2 : 3
            // 石堆几何中心，避免画在边角格
            let sx = 0
            let sy = 0
            let sz = 0
            for (const c of cells) {
              sx += c.x
              sy += c.y
              sz += c.z
            }
            const n = cells.length
            drawX = sx / n
            drawY = sy / n
            drawZ = sz / n
          }
          solidV = pushStylizedRock(
            solidPos,
            solidNor,
            solidCol,
            solidIdx,
            solidV,
            drawX,
            drawY,
            drawZ,
            size,
            tmp
          )
          continue
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
          const neighbor = world.get(x + dx, y + dy, z + dz)
          if (isWater) {
            // 只对空气出面，靠透明度透出河床与岸壁颜色
            if (neighbor !== 'air') continue
          } else if (neighbor !== 'air' && neighbor !== 'water') {
            // 草皮顶面：树/石/叶/灌木立在其上时仍出顶面，避免镂空露天
            const propOnGrass =
              (id === 'grass' || id === 'turf') &&
              face.shade === 'top' &&
              (neighbor === 'wood' ||
                neighbor === 'stone' ||
                neighbor === 'leaves' ||
                neighbor === 'shrub')
            if (!propOnGrass) continue
          }

          const pos = isWater ? waterPos : solidPos
          const nor = isWater ? waterNor : solidNor
          const col = isWater ? waterCol : solidCol
          const idx = isWater ? waterIdx : solidIdx
          const yBias = isWater && face.shade === 'top' ? -0.08 : 0

          if ((id === 'grass' || id === 'turf') && face.shade === 'side') {
            tmp.setHex(GRASS_SIDE_DIRT).multiplyScalar(0.94)
            solidV = pushFaceQuad(
              solidPos,
              solidNor,
              solidCol,
              solidIdx,
              solidV,
              sideBandCorners(face.corners, 0, 1 - GRASS_CAP),
              [x, y, z],
              [dx, dy, dz],
              tmp
            )
            tmp.setHex(GRASS_SIDE_TOP).multiplyScalar(0.96)
            solidV = pushFaceQuad(
              solidPos,
              solidNor,
              solidCol,
              solidIdx,
              solidV,
              sideBandCorners(face.corners, 1 - GRASS_CAP, 1),
              [x, y, z],
              [dx, dy, dz],
              tmp
            )
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
            waterV = pushFaceQuad(pos, nor, col, idx, waterV, corners, [x, y, z], [dx, dy, dz], tmp, faceYBias)
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
              0
            )
          }
        }

        // 草坪：卡片草（单独层，alphaTest）
        if (
          (id === 'grass' || id === 'turf') &&
          world.get(x, y + 1, z) === 'air'
        ) {
          grassV = pushGrassCards(grassPos, grassNor, grassUv, grassIdx, grassV, x, y, z, lod)
        }
      }
    }
  }

  const make = (
    positions: number[],
    normals: number[],
    colors: number[],
    indices: number[],
    transparent: boolean
  ) => {
    if (!positions.length) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeBoundingSphere()
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      transparent,
      opacity: transparent ? 0.62 : 1,
      depthWrite: !transparent,
      side: transparent ? THREE.DoubleSide : THREE.FrontSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = true
    mesh.renderOrder = transparent ? 2 : 0
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    return mesh
  }

  const makeGrass = () => {
    if (!grassPos.length) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(grassPos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(grassNor, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(grassUv, 2))
    geo.setIndex(grassIdx)
    geo.computeBoundingSphere()
    const mesh = new THREE.Mesh(geo, getGrassTuftMaterial())
    mesh.frustumCulled = true
    mesh.renderOrder = 1
    mesh.userData.sharedMat = true
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    return mesh
  }

  return {
    solid: make(solidPos, solidNor, solidCol, solidIdx, false),
    water: make(waterPos, waterNor, waterCol, waterIdx, true),
    grass: makeGrass(),
    lod,
  }
}

function disposeMesh(mesh: THREE.Mesh | null) {
  if (!mesh) return
  mesh.geometry.dispose()
  const mat = mesh.material as THREE.Material
  // 共享草丛材质不销毁
  if (mat !== grassTuftMat) mat.dispose()
}

function disposeChunkMeshes(meshes: ChunkMeshes) {
  disposeMesh(meshes.solid)
  disposeMesh(meshes.water)
  disposeMesh(meshes.grass)
}

/** 小溪流水高光粒子（沿中心线漂移，仅近距） */
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
    this.resync(world, 0, 0)
  }

  private resync(world: InfiniteTerrain, px: number, _pz: number) {
    const span = 28
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i]
      d.x = px - span * 0.5 + (i / this.count) * span + (Math.random() - 0.5) * 0.8
      const cz = world.creekCenterZ(d.x)
      const tangZ = world.creekCenterZ(d.x + 0.35) - cz
      const len = Math.hypot(0.35, tangZ) || 1
      const rx = -tangZ / len
      const rz = 0.35 / len
      this.positions[i * 3] = d.x + rx * d.offset
      this.positions[i * 3 + 1] = SURFACE_Y + 0.05
      this.positions[i * 3 + 2] = cz + rz * d.offset
    }
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
  }

  update(dt: number, world: InfiniteTerrain, px: number, pz: number) {
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
      this.positions[i * 3 + 1] = SURFACE_Y + 0.048 + Math.sin(this.time * 2.2 + d.phase) * 0.01
      this.positions[i * 3 + 2] = cz + rz * off
    }
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    // 远离小溪时略隐藏
    const dist = Math.abs(pz - world.creekCenterZ(px))
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
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
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
  private t = 0

  constructor() {
    // 太阳圆盘
    const sunGeo = new THREE.SphereGeometry(4.5, 16, 16)
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8 })
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat)
    this.sunMesh.position.set(40, 55, -30)
    this.group.add(this.sunMesh)

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(7, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.25 })
    )
    glow.position.copy(this.sunMesh.position)
    this.group.add(glow)

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

  update(dt: number, cam: THREE.Vector3) {
    this.t += dt
    // 太阳相对相机保持远距方位，形成「天空中的太阳」
    this.sunMesh.position.set(cam.x + 55, cam.y + 48, cam.z - 35)
    const glow = this.group.children[1]
    if (glow) glow.position.copy(this.sunMesh.position)

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
  private static readonly REBUILD_PER_FRAME = 2
  private keys = new Set<string>()
  private yaw = 0
  private pitch = -0.28
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
  private sky: SkyDecor
  private sunLight: THREE.DirectionalLight
  private lastChunkCX = Number.NaN
  private lastChunkCZ = Number.NaN
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

    const hemi = new THREE.HemisphereLight(0xdff2ff, 0x8fbf6a, 0.9)
    this.scene.add(hemi)
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.2)
    this.sunLight.position.set(40, 60, -20)
    this.scene.add(this.sunLight)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.32))

    this.sky = new SkyDecor()
    this.scene.add(this.sky.group)

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
    const cx = Math.floor(this.camera.position.x / CHUNK_SIZE)
    const cz = Math.floor(this.camera.position.z / CHUNK_SIZE)
    if (!force && cx === this.lastChunkCX && cz === this.lastChunkCZ) return
    this.lastChunkCX = cx
    this.lastChunkCZ = cz

    const needed = new Set<string>()
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        if (dx * dx + dz * dz > LOAD_RADIUS * LOAD_RADIUS + 1) continue
        const key = chunkKey(cx + dx, cz + dz)
        needed.add(key)
        const wantLod = chunkLodFromDist(Math.max(Math.abs(dx), Math.abs(dz)))
        const existing = this.chunks.get(key)
        if (!existing) {
          this.mountChunk(cx + dx, cz + dz, wantLod)
        } else if (existing.lod !== wantLod) {
          this.rebuildQueue.add(key)
        }
      }
    }

    for (const [key, meshes] of this.chunks) {
      const [sx, sz] = key.split(',').map(Number)
      const dist = Math.max(Math.abs(sx - cx), Math.abs(sz - cz))
      if (!needed.has(key) && dist > UNLOAD_RADIUS) {
        this.unmountChunk(key, meshes)
        this.rebuildQueue.delete(key)
      }
    }
  }

  private mountChunk(cx: number, cz: number, lod: ChunkLod) {
    const key = chunkKey(cx, cz)
    const meshes = buildChunkMeshes(this.world, cx, cz, lod)
    if (meshes.solid) this.chunkGroup.add(meshes.solid)
    if (meshes.water) this.chunkGroup.add(meshes.water)
    if (meshes.grass) this.chunkGroup.add(meshes.grass)
    this.chunks.set(key, meshes)
  }

  private unmountChunk(key: string, meshes: ChunkMeshes) {
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
    if (!this.chunks.has(key)) return
    const old = this.chunks.get(key)!
    this.unmountChunk(key, old)
    this.mountChunk(cx, cz, this.focusChunkLod(cx, cz))
  }

  private enqueueRebuild(cx: number, cz: number) {
    const key = chunkKey(cx, cz)
    if (this.chunks.has(key)) this.rebuildQueue.add(key)
  }

  private flushRebuildQueue() {
    if (!this.rebuildQueue.size) return
    let n = 0
    for (const key of [...this.rebuildQueue]) {
      if (n >= GameEngine.REBUILD_PER_FRAME) break
      this.rebuildQueue.delete(key)
      if (!this.chunks.has(key)) continue
      const [cx, cz] = key.split(',').map(Number)
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
    this.moveForward = Math.max(-1, Math.min(1, forward))
    this.moveStrafe = Math.max(-1, Math.min(1, strafe))
  }

  queueJump() {
    this.jumpQueued = true
  }

  applyLook(deltaX: number, deltaY: number, sensitivity = 0.0055) {
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
    if (this.lookBufX === 0 && this.lookBufY === 0) return
    // 更高跟手：几乎当场转完，只留一点平滑去抖
    const k = 1 - Math.exp(-36 * dt)
    const useX = this.lookBufX * k
    const useY = this.lookBufY * k
    this.lookBufX -= useX
    this.lookBufY -= useY
    if (Math.abs(this.lookBufX) < 1e-5) this.lookBufX = 0
    if (Math.abs(this.lookBufY) < 1e-5) this.lookBufY = 0

    this.yaw -= useX
    this.pitch -= useY
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
      yaw: this.yaw,
      pitch: this.pitch,
      crouching: this.crouching,
      action: this.actionKind,
    }
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
      else this.targetName = BLOCK_LABEL[id] || ''
    } else {
      this.targetName = ''
    }
  }

  getTargetHarvestKind(): HarvestKind | null {
    if (this.activeAction) return this.activeAction.kind
    if (!this.selected) return null
    const id = this.world.get(this.selected.hit.x, this.selected.hit.y, this.selected.hit.z)
    return this.kindForBlock(id)
  }

  /** 开始挖掘/砍/开采（砍树/采石会自动切到斧头） */
  beginHarvest() {
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
      this.lastActionHint = '无法操作此方块'
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

    const duration = ACTION_DURATION[kind]
    this.activeAction = {
      kind,
      duration,
      elapsed: 0,
      hits: 0,
      nextHitAt: kind === 'chop' || kind === 'mine' ? 0 : duration,
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

    if (kind === 'chop' || kind === 'mine') {
      this.performHit()
    } else {
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

  breakBlock() {
    this.beginHarvest()
  }

  placeBlock(_id?: BlockId) {
    this.beginBuild()
  }

  buildWithMaterial() {
    this.beginBuild()
  }

  private performHit() {
    if (!this.activeAction) return
    const a = this.activeAction
    a.hits += 1
    if (a.kind === 'chop') {
      this.body.playSwing('axe')
      this.body.setHoldingAxe(true)
      this.notch.showAt(a.x, a.y, a.z, a.face, a.hits)
      this.debris.burst(a.x + 0.5, a.y + 0.5, a.z + 0.5, 0x8b5a2b, 10, new THREE.Vector3(a.face.x, 0.2, a.face.z))
      this.audio?.play('chop')
    } else if (a.kind === 'mine') {
      this.body.playSwing('axe')
      this.body.setHoldingAxe(true)
      this.crack.showAt(a.x, a.y, a.z, a.face, a.hits)
      this.debris.burst(a.x + 0.5, a.y + 0.5, a.z + 0.5, 0x8a8e94, 12, new THREE.Vector3(a.face.x, 0.2, a.face.z))
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
      // 石头逐块开采：准星必须仍对准同一格
      return this.world.get(a.x, a.y, a.z) === 'stone' && hx === a.x && hy === a.y && hz === a.z
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

    if (a.kind === 'dig' || a.kind === 'clear' || a.kind === 'build') {
      this.actionSfxAcc += dt
      if (this.actionSfxAcc >= 0.28) {
        this.actionSfxAcc = 0
        this.audio?.play(a.kind === 'build' ? 'build' : 'dig')
        this.body.playSwing(a.kind === 'build' ? 'place' : 'dig')
      }
    }

    if (a.kind === 'chop') {
      // 3 秒 3 刀：0 / 1 / 2 秒各一刀，第 3 秒完成
      const expected = Math.min(3, Math.floor(a.elapsed) + 1)
      while (a.hits < expected && a.hits < 3) this.performHit()
    } else if (a.kind === 'mine') {
      // 1.2 秒约 2 下裂纹
      const expected = Math.min(2, Math.floor(a.elapsed / 0.6) + 1)
      while (a.hits < expected && a.hits < 2) this.performHit()
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
    const harvest = BLOCK_HARVEST[id]
    if (harvest?.mat && this.inventory) {
      addMaterial(this.inventory, harvest.mat, 1)
      this.onInventoryChange?.()
      this.lastActionHint = `+1`
    }
    this.world.set(a.x, a.y, a.z, harvest?.remain ?? 'air')
    this.rebuildChunkAt(a.x, a.z)
    this.emitBlocks([{ x: a.x, y: a.y, z: a.z, blockId: harvest?.remain ?? 'air' }])
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
    this.debris.burst(burstX + 0.5, burstY + 0.6, burstZ + 0.5, 0x8b5a2b, 12)
    this.hideSelectionTint()
    this.lastActionHint = `+${woodCount} 木材`
    this.updateBlockSelection()
  }

  /** 开采：石头立刻消失并入库（不留碎石摊） */
  private finishMineStone(x: number, y: number, z: number) {
    if (this.world.get(x, y, z) !== 'stone') return
    this.debris.burst(x + 0.5, y + 0.35, z + 0.5, 0x9a968c, 8)
    this.world.set(x, y, z, 'air')
    this.rebuildChunkAt(x, z)
    this.emitBlocks([{ x, y, z, blockId: 'air' }])
    if (this.inventory) {
      addMaterial(this.inventory, 'stone', 1)
      this.onInventoryChange?.()
    }
    this.hideSelectionTint()
    this.lastActionHint = '+1 石材'
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
      if (id !== 'air' && id !== 'water') {
        if (t > maxDist + 1e-4) return null
        const place = { x: x + face.x, y: y + face.y, z: z + face.z }
        const placeId = this.world.get(place.x, place.y, place.z)
        return {
          hit: { x, y, z },
          place: placeId === 'air' ? place : null,
          face: { ...face },
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

  /** 准星对准且 ≤ REACH_DISTANCE 才高亮选中；否则清空 */
  private updateBlockSelection() {
    const hit = this.raycastBlock(REACH_DISTANCE)
    this.selected = hit

    if (this.buildMode) {
      this.hideSelectionTint()
      this.refreshTargetLabel()
      this.updateGhostPreview(this.selected)
      return
    }

    this.hideGhostPreview()
    if (!hit) {
      this.hideSelectionTint()
      this.targetName = ''
      return
    }

    const { x, y, z } = hit.hit
    const id = this.world.get(x, y, z)

    // 树木：整株高亮；其它方块单格高亮
    let cells: { x: number; y: number; z: number }[] = [{ x, y, z }]
    if (id === 'wood' || id === 'leaves' || id === 'plank') {
      cells = this.world.treeCellsAt(x, y, z) || cells
    }

    this.showSelectionTint(cells)
    this.refreshTargetLabel()
  }

  private hideSelectionTint() {
    this.selectionTint.visible = false
    for (const m of this.selectionTintMeshes) m.visible = false
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
    return false
  }

  /** 脚下支撑面高度（固体顶），自脚位向下搜索 */
  private supportTopY(px: number, feetY: number, pz: number) {
    const i0 = Math.floor(px - PLAYER_HALF_W)
    const i1 = Math.floor(px + PLAYER_HALF_W - 1e-6)
    const k0 = Math.floor(pz - PLAYER_HALF_W)
    const k1 = Math.floor(pz + PLAYER_HALF_W - 1e-6)
    const j0 = Math.floor(feetY - 0.001)
    for (let j = j0; j >= j0 - 3; j--) {
      for (let i = i0; i <= i1; i++) {
        for (let k = k0; k <= k1; k++) {
          if (this.world.solid(i, j, k)) return j + 1
        }
      }
    }
    return null
  }

  getGroundY(x: number, z: number) {
    for (let y = SURFACE_Y + 2; y >= 0; y--) {
      if (this.world.solid(x, y, z)) return y + 1
    }
    const fx = Math.floor(x)
    const fz = Math.floor(z)
    if (this.world.get(fx, SURFACE_Y, fz) === 'water') {
      return SURFACE_Y
    }
    return SURFACE_Y + 1
  }

  /** 人机站立高度：只走平地，不贴石头/房顶爬升 */
  getNpcStandY(_x?: number, _z?: number) {
    return SURFACE_Y + 1
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
    const floor = this.world.get(fx, SURFACE_Y, fz)
    if (floor === 'water' || floor === 'air') return false
    for (let y = SURFACE_Y + 1; y <= SURFACE_Y + 2; y++) {
      if (this.world.solid(fx, y, fz)) return false
    }
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
   * 一格高台不能靠走跨上去，必须跳跃。
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

  /** 卡进方块时沿水平微移脱出 */
  private unstuck() {
    const y = this.camera.position.y
    const baseX = this.camera.position.x
    const baseZ = this.camera.position.z
    const offsets = [0.05, 0.1, 0.2, 0.35, 0.5]
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
      }
    }
    const support = this.supportTopY(baseX, y - this.eyeHeight + 1.2, baseZ)
    if (support != null) {
      const ey = support + this.eyeHeight
      if (!this.bodyCollides(baseX, ey, baseZ)) {
        this.camera.position.y = ey
        this.velocityY = 0
        this.onGround = true
      }
    }
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
    // 走动/跳跃打断挖、砍、开采等进行中的操作
    if (this.activeAction && (moveStrength > 0.12 || this.jumpQueued || this.keys.has('Space'))) {
      this.cancelAction()
    }
    if (moveLen > 1e-4) {
      const speed = 1.4 + moveStrength * 2.6
      move.multiplyScalar((speed * dt) / moveLen)
      this.tryMoveAxis('x', this.camera.position.x + move.x)
      this.tryMoveAxis('z', this.camera.position.z + move.z)
    }

    const wantJump = this.jumpQueued || this.keys.has('Space')
    this.jumpQueued = false
    if (wantJump && this.onGround) {
      this.velocityY = 7.8
      this.onGround = false
      this.jumpStartY = this.camera.position.y - this.eyeHeight
      this.audio?.play('jump')
    }

    const wasGround = this.wasOnGround
    if (!this.onGround) {
      this.airTime += dt
      this.fallPeakSpeed = Math.max(this.fallPeakSpeed, -this.velocityY)
    }

    this.velocityY -= 20 * dt
    const px = this.camera.position.x
    const pz = this.camera.position.z
    const nextY = this.camera.position.y + this.velocityY * dt

    if (this.velocityY <= 0) {
      if (!this.bodyCollides(px, nextY, pz)) {
        this.camera.position.y = nextY
        const feet = this.camera.position.y - this.eyeHeight
        const support = this.supportTopY(px, feet, pz)
        this.onGround = support != null && feet - support < 0.08 && feet - support >= -0.02
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

    if (this.onGround && !wasGround) {
      this.playLandingSfx(px, pz)
      this.airTime = 0
      this.fallPeakSpeed = 0
    }
    if (this.onGround) {
      this.airTime = 0
      this.fallPeakSpeed = 0
    }
    this.wasOnGround = this.onGround

    if (this.bodyCollides(this.camera.position.x, this.camera.position.y, this.camera.position.z)) {
      this.unstuck()
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

    this.streamTimer += dt
    if (this.streamTimer > 0.2) {
      this.streamTimer = 0
      this.streamChunks()
    }
    this.flushRebuildQueue()

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

    this.updateBlockSelection()
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
    this.streamChunks(true)
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
    if (this.world.isCreek(fx, fz) || this.world.get(fx, SURFACE_Y, fz) === 'water') {
      return 'water'
    }
    const feet = this.camera.position.y - this.eyeHeight
    const support = this.supportTopY(x, feet, z)
    const y = support != null ? Math.floor(support - 0.01) : SURFACE_Y
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

    const groundY = SURFACE_Y + 1
    let t: number
    if (Math.abs(d.y) > 1e-4) {
      t = (groundY - o.y) / d.y
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
    this.rebuildQueue.clear()
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
