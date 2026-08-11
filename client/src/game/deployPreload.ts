/**
 * 准备舱期间预热：投送后立刻会用到的模型 / 音效 / 表数据。
 * 分任务执行，避免单帧卡死读秒。
 */

import type * as THREE from 'three'
import { createMonster, MONSTER_TIER_ORDER } from './wildMonster'
import {
  createStaff,
  createCleaver,
  createPistol,
  createRifle,
  createSniper,
  createFpWeaponView,
  createSlashFx,
  createImpactFx,
  createMuzzleFx,
  createFirePit,
} from './combatProps'
import {
  createWindowLv1,
  createDoorLv1,
  createStoveLv1,
  createLampLv1,
  createCraftBenchLv1,
  createFenceLv1,
  createWireFenceLv1,
  createCobbleFloorLv1,
  createPondLv1,
} from './buildProps'
import { SHOP_ITEMS, FURNITURE_IDS, SAFE_VAULT_MAX } from './shopCatalog'
import { sampleDayNightHud } from './dayNight'
import { WEAPON_DEFS, MONSTER_DEFS } from './combatStats'
import type { GameAudio } from './gameAudio'

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if ((m as THREE.Mesh).isMesh) {
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        if (!mat) continue
        const anyMat = mat as THREE.MeshBasicMaterial & {
          map?: THREE.Texture | null
          dispose?: () => void
        }
        anyMat.map?.dispose?.()
        anyMat.dispose?.()
      }
    }
    const spr = o as THREE.Sprite
    if (spr.isSprite) {
      const mat = spr.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
      const tex = spr.userData.glowTex as THREE.Texture | undefined
      tex?.dispose()
    }
  })
}

function warm(factory: () => THREE.Object3D) {
  const root = factory()
  disposeObject(root)
}

export type DeployWarmTask = {
  label: string
  run: () => void
}

/** 生成舱内预热任务队列（地图流式加载仍由引擎负责） */
export function buildDeployWarmTasks(audio: GameAudio | null): DeployWarmTask[] {
  const tasks: DeployWarmTask[] = []

  // 触达静态表，避免投送后首帧才解析大对象
  tasks.push({
    label: '战斗数值',
    run: () => {
      void WEAPON_DEFS.fist
      void MONSTER_DEFS.scrapmite
      void SHOP_ITEMS.length
      void FURNITURE_IDS.length
      void SAFE_VAULT_MAX
      sampleDayNightHud()
    },
  })

  if (audio) {
    tasks.push({
      label: '音效系统',
      run: () => {
        audio.ensure()
      },
    })
  }

  for (const tier of MONSTER_TIER_ORDER) {
    tasks.push({
      label: `野怪·${tier}`,
      run: () => warm(() => createMonster(tier)),
    })
  }

  const weapons: { label: string; fn: () => THREE.Object3D }[] = [
    { label: '武器·木棍', fn: createStaff },
    { label: '武器·砍刀', fn: createCleaver },
    { label: '武器·手枪', fn: createPistol },
    { label: '武器·步枪', fn: createRifle },
    { label: '武器·狙击', fn: createSniper },
    { label: '武器·第一人称', fn: () => createFpWeaponView('rifle') },
    { label: '特效·挥砍', fn: createSlashFx },
    { label: '特效·命中', fn: createImpactFx },
    { label: '特效·枪口', fn: createMuzzleFx },
    { label: '火堆', fn: createFirePit },
  ]
  for (const w of weapons) {
    tasks.push({ label: w.label, run: () => warm(w.fn) })
  }

  const furniture: { label: string; fn: () => THREE.Object3D }[] = [
    { label: '家具·窗', fn: createWindowLv1 },
    { label: '家具·门', fn: createDoorLv1 },
    { label: '家具·炉', fn: createStoveLv1 },
    { label: '家具·灯', fn: createLampLv1 },
    { label: '家具·制作台', fn: createCraftBenchLv1 },
    { label: '家具·栅栏', fn: createFenceLv1 },
    { label: '家具·铁丝网', fn: createWireFenceLv1 },
    { label: '家具·鹅卵石', fn: createCobbleFloorLv1 },
    { label: '家具·池塘', fn: createPondLv1 },
  ]
  for (const f of furniture) {
    tasks.push({ label: f.label, run: () => warm(f.fn) })
  }

  return tasks
}
