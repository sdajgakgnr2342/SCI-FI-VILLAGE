import * as THREE from 'three'
import {
  BLOCK_DISPLAY_LABEL,
  InfiniteTerrain,
  PREVIEW_BLOCK_IDS,
  SURFACE_Y,
  buildChunkMeshes,
  createSkyCloud,
  createSkySun,
  type BlockId,
} from '@/game/engine'
import { FirstPersonBody } from '@/game/playerBody'
import { createVillager } from '@/game/npcManager'

export type ModelExhibitId =
  | `block:${Exclude<BlockId, 'air'>}`
  | 'scene:creek'
  | 'scene:tree'
  | 'scene:rock1'
  | 'scene:rock2'
  | 'scene:rock3'
  | 'scene:shrub'
  | 'prop:cloud'
  | 'prop:sun'
  | 'prop:fp-body'
  | 'prop:npc'
  | 'scene:all-blocks'

export interface ModelExhibit {
  id: ModelExhibitId
  group: string
  label: string
  hint?: string
}

export const MODEL_EXHIBITS: ModelExhibit[] = [
  { id: 'scene:all-blocks', group: '总览', label: '全部方块阵列', hint: '一览所有方块材质' },
  { id: 'scene:creek', group: '场景', label: '小溪', hint: '浅水面 + 石子' },
  { id: 'scene:tree', group: '场景', label: '树木', hint: '树干 + 树冠' },
  { id: 'scene:rock1', group: '场景', label: '石头 · 小', hint: '风格化小石' },
  { id: 'scene:rock2', group: '场景', label: '石头 · 中', hint: '风格化中石' },
  { id: 'scene:rock3', group: '场景', label: '石头 · 大', hint: '风格化大石' },
  { id: 'scene:shrub', group: '场景', label: '灌木', hint: '枝干 + 草叶' },
  { id: 'prop:cloud', group: '天空', label: '白云', hint: '扁椭圆组合' },
  { id: 'prop:sun', group: '天空', label: '太阳', hint: '圆盘 + 光晕' },
  { id: 'prop:fp-body', group: '角色', label: '第一人称肢体', hint: '手臂 / 腿 / 斧' },
  { id: 'prop:npc', group: '角色', label: '村民 NPC', hint: '路过村民模型' },
  ...PREVIEW_BLOCK_IDS.map(
    (id): ModelExhibit => ({
      id: `block:${id}`,
      group: '方块',
      label: BLOCK_DISPLAY_LABEL[id] || id,
      hint: id,
    })
  ),
]

function clearChunkFlat(world: InfiniteTerrain) {
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < SURFACE_Y; y++) world.set(x, y, z, 'dirt')
      world.set(x, SURFACE_Y, z, 'grass')
      for (let y = SURFACE_Y + 1; y <= SURFACE_Y + 16; y++) world.set(x, y, z, 'air')
    }
  }
}

function addMeshesToGroup(group: THREE.Group, world: InfiniteTerrain) {
  const { solid, water, grass } = buildChunkMeshes(world, 0, 0)
  if (solid) {
    solid.matrixAutoUpdate = true
    solid.updateMatrix()
    group.add(solid)
  }
  if (water) {
    water.matrixAutoUpdate = true
    water.updateMatrix()
    group.add(water)
  }
  if (grass) {
    grass.matrixAutoUpdate = true
    grass.updateMatrix()
    group.add(grass)
  }
}

function centerGroup(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group)
  if (box.isEmpty()) return
  const c = box.getCenter(new THREE.Vector3())
  group.position.sub(c)
}

function placeRock(world: InfiniteTerrain, sx: number, sz: number, size: number) {
  const maxR = size === 1 ? 0 : 1
  const maxH = size
  for (let dz = -maxR; dz <= maxR; dz++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      world.set(sx + dx, SURFACE_Y, sz + dz, 'grass')
      for (let localY = 0; localY < maxH; localY++) {
        if (size >= 3 && localY >= 2 && Math.abs(dx) + Math.abs(dz) > 0) continue
        if (size === 2 && localY >= 1 && Math.abs(dx) + Math.abs(dz) > 1) continue
        world.set(sx + dx, SURFACE_Y + 1 + localY, sz + dz, 'stone')
      }
    }
  }
}

function placeTree(world: InfiniteTerrain, tx: number, tz: number) {
  const trunkH = 5
  const top = SURFACE_Y + 1 + trunkH
  world.set(tx, SURFACE_Y, tz, 'grass')
  for (let y = SURFACE_Y + 1; y < top; y++) world.set(tx, y, tz, 'wood')

  // 2～3 根正交侧枝：近低远高，斜向上托住树冠
  const branches: [number, number][] = [
    [1, 0],
    [0, -1],
    [-1, 0],
  ]
  for (let i = 0; i < branches.length; i++) {
    const [bx, bz] = branches[i]
    world.set(tx + bx, top - 2, tz + bz, 'wood')
    world.set(tx + bx * 2, top - 1, tz + bz * 2, 'wood')
  }

  // 更密的树冠
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dz === 0 && dy < 1) continue
        const ax = Math.abs(dx)
        const az = Math.abs(dz)
        const manhattan = ax + az
        if (ax > 2 || az > 2) continue
        if (dy === 1 && manhattan > 3) continue
        if (dy === -1 && manhattan > 3) continue
        if (dy === 0 && manhattan > 4) continue
        if (world.get(tx + dx, top + dy, tz + dz) === 'wood') continue
        world.set(tx + dx, top + dy, tz + dz, 'leaves')
      }
    }
  }
}

/** 按展品 id 构建可预览的 Object3D（调用方负责 dispose） */
export function buildExhibitObject(id: ModelExhibitId): THREE.Object3D {
  if (id === 'prop:cloud') {
    const c = createSkyCloud()
    c.scale.setScalar(0.35)
    return c
  }
  if (id === 'prop:sun') {
    const s = createSkySun()
    s.scale.setScalar(0.22)
    return s
  }
  if (id === 'prop:fp-body') {
    const body = new FirstPersonBody()
    body.root.position.set(0, 1.2, 0)
    body.root.rotation.y = Math.PI
    body.setHoldingAxe(true)
    body.update(0.016, 0.55, false, 0, false)
    // 调试页循环：走路 + 间歇挥斧（与游戏同一套 FirstPersonBody）
    body.root.userData.fpBody = body
    body.root.userData.labAnim = { t: 0, nextSwing: 1.2 }
    return body.root
  }
  if (id === 'prop:npc') {
    const { root } = createVillager(0.35)
    root.scale.setScalar(1)
    return root
  }

  const world = new InfiniteTerrain(424242)
  clearChunkFlat(world)
  const group = new THREE.Group()

  if (id.startsWith('block:')) {
    const bid = id.slice(6) as Exclude<BlockId, 'air'>
    const x = 8
    const z = 8
    world.set(x, SURFACE_Y, z, bid === 'water' || bid === 'sand' || bid === 'dirt' ? bid : 'grass')
    if (bid === 'grass' || bid === 'turf') {
      world.set(x, SURFACE_Y, z, bid)
    } else if (bid === 'dirt' || bid === 'sand' || bid === 'water' || bid === 'stone' || bid === 'plank' || bid === 'thatch' || bid === 'alloy' || bid === 'stump' || bid === 'rubble') {
      world.set(x, SURFACE_Y, z, bid)
    } else if (bid === 'wood') {
      world.set(x, SURFACE_Y, z, 'grass')
      world.set(x, SURFACE_Y + 1, z, 'wood')
      world.set(x, SURFACE_Y + 2, z, 'wood')
    } else if (bid === 'leaves') {
      world.set(x, SURFACE_Y, z, 'grass')
      world.set(x, SURFACE_Y + 1, z, 'leaves')
    } else if (bid === 'shrub') {
      world.set(x, SURFACE_Y, z, 'grass')
      world.set(x, SURFACE_Y + 1, z, 'shrub')
    }
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  if (id === 'scene:creek') {
    for (let x = 2; x <= 13; x++) {
      world.set(x, SURFACE_Y, 7, 'water')
      world.set(x, SURFACE_Y, 8, 'water')
      world.set(x, SURFACE_Y, 6, 'grass')
      world.set(x, SURFACE_Y, 9, 'grass')
    }
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  if (id === 'scene:tree') {
    placeTree(world, 8, 8)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  if (id === 'scene:rock1') {
    placeRock(world, 8, 8, 1)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }
  if (id === 'scene:rock2') {
    placeRock(world, 8, 8, 2)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }
  if (id === 'scene:rock3') {
    placeRock(world, 8, 8, 3)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }
  if (id === 'scene:shrub') {
    world.set(8, SURFACE_Y + 1, 8, 'shrub')
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  if (id === 'scene:all-blocks') {
    const ids = PREVIEW_BLOCK_IDS
    ids.forEach((bid, i) => {
      const x = 2 + (i % 7) * 2
      const z = 2 + Math.floor(i / 7) * 2
      if (bid === 'wood') {
        world.set(x, SURFACE_Y, z, 'grass')
        world.set(x, SURFACE_Y + 1, z, 'wood')
      } else if (bid === 'leaves' || bid === 'shrub') {
        world.set(x, SURFACE_Y, z, 'grass')
        world.set(x, SURFACE_Y + 1, z, bid)
      } else {
        world.set(x, SURFACE_Y, z, bid)
      }
    })
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  addMeshesToGroup(group, world)
  centerGroup(group)
  return group
}

export function disposeObject3D(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry?.dispose()
    if (m.userData.sharedMat) return
    const mat = m.material
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else (mat as THREE.Material)?.dispose()
  })
}
