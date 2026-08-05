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
  water: { top: 0x4fa4d8, side: 0x3d8fc4, bottom: 0x2f7aaf, opacity: 0.38 },
  stone: { top: 0x8a8e94, side: 0x7a7e84, bottom: 0x6a6e74 },
  wood: { top: 0x6b4a2a, side: 0x5a3a1e, bottom: 0x4a2e14 },
  leaves: { top: 0x4aa03f, side: 0x3d8f35, bottom: 0x2f6f28 },
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

    if (bank) {
      if (iy < SURFACE_Y) return iy === SURFACE_Y - 1 ? 'sand' : 'dirt'
      if (iy === SURFACE_Y) return 'sand'
      return 'air'
    }

    if (iy < SURFACE_Y) return 'dirt'
    if (iy === SURFACE_Y) return 'grass'
    return 'air'
  }

  private featureBlock(ix: number, iy: number, iz: number): BlockId | null {
    if (iy === SURFACE_Y + 1) {
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
        const top = SURFACE_Y + trunkH

        if (dx === 0 && dz === 0 && iy >= SURFACE_Y && iy < top) return 'wood'

        // 树冠更蓬松、外圈更稀，减少远景糊成绿墙
        if (iy < top - 1 || iy > top + 1) continue
        const ax = Math.abs(dx)
        const az = Math.abs(dz)
        if (ax > 2 || az > 2) continue
        if (dx === 0 && dz === 0 && iy < top) continue
        const manhattan = ax + az
        const jitter = (h >> ((ax * 3 + az + iy) & 7)) & 1
        if (iy === top + 1) {
          if (manhattan <= 1) return 'leaves'
          if (manhattan === 2 && ax === 1 && az === 1 && jitter === 0) return 'leaves'
        } else if (iy === top) {
          if (manhattan <= 1) return 'leaves'
          if (manhattan === 2 && jitter === 0) return 'leaves'
          if (manhattan === 2 && ax === 1 && az === 1) return 'leaves'
        } else {
          if (manhattan === 1) return 'leaves'
          if (manhattan === 2 && ax === 1 && az === 1 && jitter === 0) return 'leaves'
        }
      }
    }
    return null
  }

  private rockSeedInfo(rx: number, rz: number): { size: number } | null {
    if (this.isCreek(rx, rz) || this.isCreekBank(rx, rz)) return null
    const h = hash2(rx, rz, this.seed ^ 0x22)
    if (h % 61 !== 0) return null
    return { size: 1 + (h % 3) }
  }

  private rockAt(ix: number, iy: number, iz: number): BlockId | null {
    if (iy < SURFACE_Y || iy > SURFACE_Y + 3) return null
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const info = this.rockSeedInfo(ix - dx, iz - dz)
        if (!info) continue
        const { size } = info
        const maxR = size === 1 ? 0 : 1
        const maxH = size
        if (Math.abs(dx) > maxR || Math.abs(dz) > maxR) continue
        const localY = iy - SURFACE_Y
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
          cells.push({ x: sx + dx, y: SURFACE_Y + localY, z: sz + dz })
        }
      }
    }
    return cells
  }
}

type ChunkMeshes = { solid: THREE.Mesh | null; water: THREE.Mesh | null }

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

function buildChunkMeshes(world: InfiniteTerrain, cx: number, cz: number): ChunkMeshes {
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
          if (id !== 'water') continue
        }

        const palette = BLOCK_FACES[id]
        const isWater = id === 'water'

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir
          const neighbor = world.get(x + dx, y + dy, z + dz)
          if (isWater) {
            // 只对空气出面，靠透明度透出河床与岸壁颜色
            if (neighbor !== 'air') continue
          } else if (id === 'leaves') {
            // 叶与叶之间也出面，远看有层次，不易糊成绿墙
            if (neighbor !== 'air' && neighbor !== 'water' && neighbor !== 'leaves') continue
          } else if (neighbor !== 'air' && neighbor !== 'water') {
            continue
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
          if (id === 'leaves') {
            const hv = hash2(x, z, y ^ 0x55)
            tmp.multiplyScalar(0.78 + (hv % 45) / 100)
            if (neighbor === 'leaves') tmp.multiplyScalar(0.7)
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

          const leafInset = id === 'leaves' ? 0.05 : 0
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
              leafInset
            )
          }
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
      opacity: transparent ? 0.4 : 1,
      depthWrite: !transparent,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = true
    mesh.renderOrder = transparent ? 2 : 0
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    return mesh
  }

  return {
    solid: make(solidPos, solidNor, solidCol, solidIdx, false),
    water: make(waterPos, waterNor, waterCol, waterIdx, true),
  }
}

function disposeMesh(mesh: THREE.Mesh | null) {
  if (!mesh) return
  mesh.geometry.dispose()
  ;(mesh.material as THREE.Material).dispose()
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
  private eyeHeight = PLAYER_EYE
  private bodyHeight = PLAYER_HEIGHT

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
        // 圆形加载，少角上多余块
        if (dx * dx + dz * dz > LOAD_RADIUS * LOAD_RADIUS + 1) continue
        const key = chunkKey(cx + dx, cz + dz)
        needed.add(key)
        if (!this.chunks.has(key)) {
          const meshes = buildChunkMeshes(this.world, cx + dx, cz + dz)
          if (meshes.solid) this.chunkGroup.add(meshes.solid)
          if (meshes.water) this.chunkGroup.add(meshes.water)
          this.chunks.set(key, meshes)
        }
      }
    }

    for (const [key, meshes] of this.chunks) {
      const [sx, sz] = key.split(',').map(Number)
      const dist = Math.max(Math.abs(sx - cx), Math.abs(sz - cz))
      if (!needed.has(key) && dist > UNLOAD_RADIUS) {
        if (meshes.solid) this.chunkGroup.remove(meshes.solid)
        if (meshes.water) this.chunkGroup.remove(meshes.water)
        disposeMesh(meshes.solid)
        disposeMesh(meshes.water)
        this.chunks.delete(key)
      }
    }
  }

  /** 重建单个已加载区块网格 */
  private rebuildOneChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz)
    if (!this.chunks.has(key)) return
    const old = this.chunks.get(key)!
    if (old.solid) this.chunkGroup.remove(old.solid)
    if (old.water) this.chunkGroup.remove(old.water)
    disposeMesh(old.solid)
    disposeMesh(old.water)
    this.chunks.delete(key)
    const meshes = buildChunkMeshes(this.world, cx, cz)
    if (meshes.solid) this.chunkGroup.add(meshes.solid)
    if (meshes.water) this.chunkGroup.add(meshes.water)
    this.chunks.set(key, meshes)
  }

  /**
   * 按改动格重建：只刷所在块，边界格才刷邻块（避免每次 3×3 全刷导致砍树/开采瞬间卡顿）
   */
  private rebuildChunksForBlocks(blocks: { x: number; z: number }[]) {
    const keys = new Set<string>()
    for (const b of blocks) {
      const x = Math.floor(b.x)
      const z = Math.floor(b.z)
      const cx = Math.floor(x / CHUNK_SIZE)
      const cz = Math.floor(z / CHUNK_SIZE)
      keys.add(chunkKey(cx, cz))
      const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      if (lx <= 0) keys.add(chunkKey(cx - 1, cz))
      if (lx >= CHUNK_SIZE - 1) keys.add(chunkKey(cx + 1, cz))
      if (lz <= 0) keys.add(chunkKey(cx, cz - 1))
      if (lz >= CHUNK_SIZE - 1) keys.add(chunkKey(cx, cz + 1))
    }
    for (const key of keys) {
      const [cx, cz] = key.split(',').map(Number)
      this.rebuildOneChunk(cx, cz)
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
      this.updateGhostPreview(hit)
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
      place: { x: number; y: number; z: number }
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
   * 人机可行走：平地、无水体；脚/小腿高度无固体（石块、树干、墙等一律绕开）。
   * 故意不允许跨上一格台阶——人机不会跳。
   */
  isNpcWalkable(x: number, z: number): boolean {
    const fx = Math.floor(x)
    const fz = Math.floor(z)
    if (this.world.isCreek(fx, fz)) return false
    const floor = this.world.get(fx, SURFACE_Y, fz)
    if (floor === 'water' || floor === 'air') return false
    // 脚部与躯干占用：SURFACE_Y+1 ~ +2 有固体则不可站
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
    this.refreshTargetLabel()

    this.sky.update(dt, this.camera.position)
    this.sunLight.position.copy(this.sky.getSunPosition())

    this.streamTimer += dt
    if (this.streamTimer > 0.2) {
      this.streamTimer = 0
      this.streamChunks()
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
      disposeMesh(meshes.solid)
      disposeMesh(meshes.water)
    }
    this.chunks.clear()
    this.body.dispose()
    this.debris.dispose()
    this.notch.dispose()
    this.crack.dispose()
    this.hideSelectionTint()
    this.hideGhostPreview()
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
