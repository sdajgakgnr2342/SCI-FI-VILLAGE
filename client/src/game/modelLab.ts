import * as THREE from 'three'
import {
  BLOCK_DISPLAY_LABEL,
  InfiniteTerrain,
  PREVIEW_BLOCK_IDS,
  buildChunkMeshes,
  createSkyCloud,
  createSkySun,
  type BlockId,
} from '@/game/engine'
import { FirstPersonBody } from '@/game/playerBody'
import { createVillager } from '@/game/npcManager'
import {
  CHEST_TIER_HINT,
  CHEST_TIER_LABEL,
  createAllTreasureChests,
  createTreasureChest,
  disposeChestExtras,
  type ChestTier,
} from '@/game/treasureChest'
import {
  createBuildPropsShowcase,
  createCobbleFloorLv1,
  createCraftBenchLv1,
  createDoorLv1,
  createFenceLv1,
  createLampLv1,
  createPondLv1,
  createStoveLv1,
  createWindowLv1,
  createWireFenceLv1,
  createYardPropsShowcase,
  disposeBuildPropsExtras,
} from '@/game/buildProps'
import {
  MONSTER_HINT,
  MONSTER_LABEL,
  MONSTER_TIER_ORDER,
  createAllMonsters,
  createMonster,
  disposeMonsterExtras,
  type MonsterTier,
} from '@/game/wildMonster'
import {
  FIRE_PIT_RADIUS,
  createCleaver,
  createFirePitDemo,
  createFpWeaponView,
  createHitFxShowcase,
  createPistol,
  createRifle,
  createSniper,
  createStaff,
  createWeaponsShowcase,
  disposeCombatExtras,
} from '@/game/combatProps'

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
  | 'chest:legendary'
  | 'chest:supreme'
  | 'chest:exquisite'
  | 'chest:fine'
  | 'chest:common'
  | 'chest:all'
  | 'build:room'
  | 'build:yard'
  | 'build:window'
  | 'build:door'
  | 'build:stove'
  | 'build:craft'
  | 'build:lamp'
  | 'build:fence'
  | 'build:wire'
  | 'build:cobble'
  | 'build:pond'
  | 'weapon:all'
  | 'weapon:staff'
  | 'weapon:cleaver'
  | 'weapon:pistol'
  | 'weapon:rifle'
  | 'weapon:sniper'
  | 'weapon:fp-pistol'
  | 'weapon:fp-rifle'
  | 'weapon:fp-sniper'
  | 'weapon:hit-fx'
  | 'weapon:fire-pit'
  | 'monster:all'
  | `monster:${MonsterTier}`
  | 'scene:all-blocks'

export interface ModelExhibit {
  id: ModelExhibitId
  group: string
  label: string
  hint?: string
}

const CHEST_EXHIBITS: ModelExhibit[] = (
  ['legendary', 'supreme', 'exquisite', 'fine', 'common'] as ChestTier[]
).map((tier) => ({
  id: `chest:${tier}` as ModelExhibitId,
  group: '宝箱',
  label: CHEST_TIER_LABEL[tier],
  hint: CHEST_TIER_HINT[tier],
}))

const MONSTER_EXHIBITS: ModelExhibit[] = MONSTER_TIER_ORDER.map((tier) => ({
  id: `monster:${tier}` as ModelExhibitId,
  group: '野怪',
  label: MONSTER_LABEL[tier],
  hint: MONSTER_HINT[tier],
}))

export const MODEL_EXHIBITS: ModelExhibit[] = [
  { id: 'scene:all-blocks', group: '总览', label: '全部方块阵列', hint: '一览所有方块材质' },
  {
    id: 'monster:all',
    group: '野怪',
    label: '五档野怪总览',
    hint: '非人形奇物 · 等级越高越凶',
  },
  ...MONSTER_EXHIBITS,
  {
    id: 'build:room',
    group: '建造',
    label: '室内建造总览',
    hint: '点击门/火炉/制作台切换双态',
  },
  { id: 'build:window', group: '建造', label: '窗户 · 1级', hint: '装饰用木框玻璃窗' },
  { id: 'build:door', group: '建造', label: '门 · 1级', hint: '点击切换：关闭挡路 / 打开通行' },
  {
    id: 'build:stove',
    group: '建造',
    label: '火炉厨具 · 1级',
    hint: '点击切换：未点火 / 燃烧中',
  },
  {
    id: 'build:craft',
    group: '建造',
    label: '制作台 · 1级',
    hint: '点击切换：待机 / 制作中特效',
  },
  {
    id: 'build:lamp',
    group: '建造',
    label: '灯 · 1级',
    hint: '点击切换：关闭 / 暖光 / 亮光',
  },
  {
    id: 'build:yard',
    group: '室外',
    label: '院子道具总览',
    hint: '栅栏 / 铁丝网 / 鹅卵石 / 池塘',
  },
  { id: 'build:fence', group: '室外', label: '栅栏 · 1级', hint: '木围栏 · 可拼接' },
  {
    id: 'build:wire',
    group: '室外',
    label: '通电铁丝网 · 1级',
    hint: '点击切换：断电 / 通电防御',
  },
  { id: 'build:cobble', group: '室外', label: '鹅卵石 · 1级', hint: '每格 2～3 颗不重叠微凸圆石' },
  {
    id: 'build:pond',
    group: '室外',
    label: '小池塘 · 1级',
    hint: '点击切换：空塘 / 养鱼中',
  },
  { id: 'weapon:all', group: '武器', label: '武器总览', hint: '木棍 / 砍刀 / 手枪 / 步枪 / 狙击' },
  { id: 'weapon:staff', group: '武器', label: '长木棍', hint: '点击挥击 + 斩击特效' },
  { id: 'weapon:cleaver', group: '武器', label: '大砍刀', hint: '点击挥击 + 斩击特效' },
  { id: 'weapon:pistol', group: '武器', label: '单发手枪', hint: '世界模型 · 红点瞄具' },
  { id: 'weapon:rifle', group: '武器', label: '步枪', hint: '世界模型 · 红点瞄具' },
  { id: 'weapon:sniper', group: '武器', label: '狙击枪', hint: '世界模型 · 高倍镜' },
  {
    id: 'weapon:fp-pistol',
    group: '武器',
    label: '手枪 · 第一人称',
    hint: '红点倍镜 · 点击开火',
  },
  {
    id: 'weapon:fp-rifle',
    group: '武器',
    label: '步枪 · 第一人称',
    hint: '红点倍镜 · 点击开火',
  },
  {
    id: 'weapon:fp-sniper',
    group: '武器',
    label: '狙击 · 第一人称',
    hint: '高倍镜 2～8x · 滚轮调倍 · 点击开火',
  },
  {
    id: 'weapon:hit-fx',
    group: '武器',
    label: '击打特效',
    hint: '点击循环：斩击 / 击中 / 枪口',
  },
  {
    id: 'weapon:fire-pit',
    group: '武器',
    label: '火堆',
    hint: `半径 ${FIRE_PIT_RADIUS} 格灼烧 · 圈内野怪持续掉血`,
  },
  { id: 'chest:all', group: '宝箱', label: '五档宝箱总览', hint: '传奇 → 普通并排对比' },
  ...CHEST_EXHIBITS,
  { id: 'scene:creek', group: '场景', label: '小溪', hint: '与村落相同的河道水面 / 河床 / 卵石' },
  { id: 'scene:tree', group: '场景', label: '树木', hint: '与村落相同的干 / 枝 / 冠网格' },
  { id: 'scene:rock1', group: '场景', label: '石头 · 小', hint: '风格化小石（天然锚点）' },
  { id: 'scene:rock2', group: '场景', label: '石头 · 中', hint: '风格化中石（天然锚点）' },
  { id: 'scene:rock3', group: '场景', label: '石头 · 大', hint: '风格化大石（天然锚点）' },
  { id: 'scene:shrub', group: '场景', label: '灌木', hint: '与村落相同的灌木网格' },
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

/** 清掉 chunk(0,0) 上的天然特征，保留真实起伏与河道 */
function clearChunkFeatures(world: InfiniteTerrain) {
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      const sy = world.surfaceHeight(x, z)
      if (world.isCreek(x, z)) {
        for (let y = sy + 1; y <= sy + 16; y++) world.set(x, y, z, 'air')
        world.set(x, sy, z, 'water')
        continue
      }
      for (let y = Math.max(0, sy - 3); y < sy; y++) world.set(x, y, z, 'dirt')
      world.set(x, sy, z, 'grass')
      for (let y = sy + 1; y <= sy + 16; y++) world.set(x, y, z, 'air')
    }
  }
}

function findDrySpot(
  world: InfiniteTerrain,
  preferX = 8,
  preferZ = 8
): { x: number; z: number } {
  const ok = (x: number, z: number) =>
    x >= 2 && x <= 13 && z >= 2 && z <= 13 && !world.isCreek(x, z) && !world.isCreekBank(x, z)
  if (ok(preferX, preferZ)) return { x: preferX, z: preferZ }
  for (let r = 1; r < 8; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = preferX + dx
        const z = preferZ + dz
        if (ok(x, z)) return { x, z }
      }
    }
  }
  return { x: preferX, z: preferZ }
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

function placeBlockSample(world: InfiniteTerrain, bid: Exclude<BlockId, 'air'>, x: number, z: number) {
  const sy = world.surfaceHeight(x, z)
  const feat = world.featureBaseY(x, z)
  if (bid === 'grass' || bid === 'turf' || bid === 'dirt' || bid === 'sand' || bid === 'water') {
    world.set(x, sy, z, bid)
    return
  }
  if (bid === 'stone' || bid === 'plank' || bid === 'thatch' || bid === 'alloy' || bid === 'stump' || bid === 'rubble') {
    world.set(x, sy, z, bid)
    return
  }
  world.set(x, sy, z, 'grass')
  if (bid === 'wood') {
    world.set(x, feat, z, 'wood')
    world.set(x, feat + 1, z, 'wood')
  } else if (bid === 'leaves' || bid === 'shrub') {
    world.set(x, feat, z, bid)
  } else {
    world.set(x, sy, z, bid)
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
    body.root.userData.fpBody = body
    body.root.userData.labAnim = { t: 0, nextSwing: 1.2 }
    return body.root
  }
  if (id === 'prop:npc') {
    const { root } = createVillager(0.35)
    root.scale.setScalar(1)
    return root
  }

  if (id === 'chest:all') {
    return createAllTreasureChests()
  }
  if (id.startsWith('chest:')) {
    const tier = id.slice(6) as ChestTier
    return createTreasureChest(tier)
  }

  if (id === 'monster:all') {
    return createAllMonsters()
  }
  if (id.startsWith('monster:')) {
    const tier = id.slice(8) as MonsterTier
    return createMonster(tier)
  }

  if (id === 'build:room') {
    const room = createBuildPropsShowcase()
    room.userData.isBuildProps = true
    return room
  }
  if (id === 'build:yard') {
    const yard = createYardPropsShowcase()
    yard.userData.isBuildProps = true
    return yard
  }
  if (id === 'build:window') {
    const w = createWindowLv1()
    w.userData.isBuildProps = true
    return w
  }
  if (id === 'build:door') {
    const d = createDoorLv1()
    d.userData.isBuildProps = true
    return d
  }
  if (id === 'build:stove') {
    const s = createStoveLv1()
    s.userData.isBuildProps = true
    return s
  }
  if (id === 'build:craft') {
    const c = createCraftBenchLv1()
    c.userData.isBuildProps = true
    return c
  }
  if (id === 'build:lamp') {
    const lamp = createLampLv1()
    lamp.userData.isBuildProps = true
    return lamp
  }
  if (id === 'build:fence') {
    const f = createFenceLv1()
    f.userData.isBuildProps = true
    return f
  }
  if (id === 'build:wire') {
    const w = createWireFenceLv1()
    w.userData.isBuildProps = true
    return w
  }
  if (id === 'build:cobble') {
    const c = createCobbleFloorLv1()
    c.userData.isBuildProps = true
    return c
  }
  if (id === 'build:pond') {
    const p = createPondLv1()
    p.userData.isBuildProps = true
    return p
  }

  if (id === 'weapon:all') {
    const w = createWeaponsShowcase()
    return w
  }
  if (id === 'weapon:staff') return createStaff()
  if (id === 'weapon:cleaver') return createCleaver()
  if (id === 'weapon:pistol') return createPistol()
  if (id === 'weapon:rifle') return createRifle()
  if (id === 'weapon:sniper') return createSniper()
  if (id === 'weapon:fp-pistol') return createFpWeaponView('pistol')
  if (id === 'weapon:fp-rifle') return createFpWeaponView('rifle')
  if (id === 'weapon:fp-sniper') return createFpWeaponView('sniper')
  if (id === 'weapon:hit-fx') return createHitFxShowcase()
  if (id === 'weapon:fire-pit') return createFirePitDemo()

  const world = new InfiniteTerrain(424242)
  clearChunkFeatures(world)
  const group = new THREE.Group()
  const spot = findDrySpot(world)

  if (id.startsWith('block:')) {
    const bid = id.slice(6) as Exclude<BlockId, 'air'>
    placeBlockSample(world, bid, spot.x, spot.z)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  if (id === 'scene:creek') {
    // 保留程序河道，仅清掉岸上树石，与游戏同一套水面网格
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  if (id === 'scene:tree') {
    world.placePreviewTree(spot.x, spot.z)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  if (id === 'scene:rock1') {
    world.placePreviewRock(spot.x, spot.z, 1)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }
  if (id === 'scene:rock2') {
    world.placePreviewRock(spot.x, spot.z, 2)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }
  if (id === 'scene:rock3') {
    world.placePreviewRock(spot.x, spot.z, 3)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }
  if (id === 'scene:shrub') {
    world.placePreviewShrub(spot.x, spot.z)
    addMeshesToGroup(group, world)
    centerGroup(group)
    return group
  }

  if (id === 'scene:all-blocks') {
    const ids = PREVIEW_BLOCK_IDS
    ids.forEach((bid, i) => {
      const x = 2 + (i % 7) * 2
      const z = 2 + Math.floor(i / 7) * 2
      if (world.isCreek(x, z) || world.isCreekBank(x, z)) {
        const alt = findDrySpot(world, x, z)
        placeBlockSample(world, bid, alt.x, alt.z)
      } else {
        placeBlockSample(world, bid, x, z)
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
  if (root.userData.isChest) disposeChestExtras(root)
  if (root.userData.isBuildProps) disposeBuildPropsExtras(root)
  if (root.userData.isMonster) disposeMonsterExtras(root)
  if (root.userData.isCombat) disposeCombatExtras(root)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    const sprite = o as THREE.Sprite
    if (mesh.isMesh) {
      mesh.geometry?.dispose()
      if (mesh.userData.sharedMat) return
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
      return
    }
    if (sprite.isSprite) {
      if (sprite.userData.sharedMat) return
      const mat = sprite.material
      mat?.dispose()
    }
  })
}
