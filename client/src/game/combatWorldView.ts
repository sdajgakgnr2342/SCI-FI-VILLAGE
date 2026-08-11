/**
 * 客户端夜怪 / 物资盒 / 家具表现（服务器权威状态驱动）
 */

import * as THREE from 'three'
import { createMonster, tickMonster, type MonsterTier } from './wildMonster'
import type { MonsterTierId } from './combatStats'
import type { FurnitureId } from './shopCatalog'
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
  tickBuildProps,
} from './buildProps'
import { createFirePit, tickCombatProps } from './combatProps'

export interface MonsterNetState {
  id: string
  kind: MonsterTierId
  x: number
  y: number
  z: number
  hp: number
  maxHp: number
  state: string
  targetId?: number | null
}

export interface CrateNetState {
  id: string
  x: number
  y: number
  z: number
  ownerId?: number
}

export interface FurnitureNetState {
  id: string
  propId: FurnitureId | string
  x: number
  y: number
  z: number
  yaw?: number
}

function createFurnitureMesh(propId: string): THREE.Group {
  switch (propId) {
    case 'window':
      return createWindowLv1()
    case 'door':
      return createDoorLv1()
    case 'stove':
      return createStoveLv1()
    case 'craft':
      return createCraftBenchLv1()
    case 'lamp':
      return createLampLv1()
    case 'fence':
      return createFenceLv1()
    case 'wire':
      return createWireFenceLv1()
    case 'cobble':
      return createCobbleFloorLv1()
    case 'pond':
      return createPondLv1()
    case 'firepit':
      return createFirePit()
    default:
      return createFenceLv1()
  }
}

export class CombatWorldView {
  readonly group = new THREE.Group()
  private monsters = new Map<string, THREE.Group>()
  private crates = new Map<string, THREE.Group>()
  private furniture = new Map<string, THREE.Group>()
  private hpBars = new Map<string, THREE.Mesh>()

  constructor(private scene: THREE.Scene) {
    this.group.name = 'combat-world-view'
    this.scene.add(this.group)
  }

  syncMonsters(list: MonsterNetState[]) {
    const seen = new Set<string>()
    for (const m of list) {
      seen.add(m.id)
      let root = this.monsters.get(m.id)
      if (!root) {
        root = createMonster(m.kind as MonsterTier)
        root.userData.monsterId = m.id
        this.monsters.set(m.id, root)
        this.group.add(root)

        const bar = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 0.08),
          new THREE.MeshBasicMaterial({ color: 0xe04040, depthTest: false })
        )
        bar.position.y = 1.35
        root.add(bar)
        this.hpBars.set(m.id, bar)
      }
      root.position.set(m.x, m.y, m.z)
      if (m.state === 'burrow') {
        root.scale.setScalar(0.55 + 0.45 * Math.min(1, (m.y + 1) / 2))
      } else {
        root.scale.setScalar(1)
      }
      root.userData.hp = m.hp
      root.userData.maxHp = m.maxHp
      const bar = this.hpBars.get(m.id)
      if (bar) {
        const ratio = Math.max(0.02, m.hp / Math.max(1, m.maxHp))
        bar.scale.x = ratio
        bar.position.x = -0.4 * (1 - ratio)
      }
    }
    for (const [id, root] of this.monsters) {
      if (seen.has(id)) continue
      this.group.remove(root)
      this.monsters.delete(id)
      this.hpBars.delete(id)
    }
  }

  syncCrates(list: CrateNetState[]) {
    const seen = new Set<string>()
    for (const c of list) {
      seen.add(c.id)
      let root = this.crates.get(c.id)
      if (!root) {
        root = new THREE.Group()
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.45, 0.55),
          new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.7 })
        )
        box.position.y = 0.25
        root.add(box)
        const lid = new THREE.Mesh(
          new THREE.BoxGeometry(0.72, 0.08, 0.57),
          new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.65 })
        )
        lid.position.y = 0.5
        root.add(lid)
        root.userData.crateId = c.id
        this.crates.set(c.id, root)
        this.group.add(root)
      }
      root.position.set(c.x, c.y, c.z)
    }
    for (const [id, root] of this.crates) {
      if (seen.has(id)) continue
      this.group.remove(root)
      this.crates.delete(id)
    }
  }

  syncFurniture(list: FurnitureNetState[]) {
    const seen = new Set<string>()
    for (const f of list) {
      seen.add(f.id)
      let root = this.furniture.get(f.id)
      if (!root) {
        root = createFurnitureMesh(f.propId)
        root.userData.furnitureId = f.id
        root.userData.propId = f.propId
        root.userData.isBuildProps = true
        this.furniture.set(f.id, root)
        this.group.add(root)
      }
      root.position.set(f.x, f.y, f.z)
      root.rotation.y = f.yaw || 0
    }
    for (const [id, root] of this.furniture) {
      if (seen.has(id)) continue
      this.group.remove(root)
      this.furniture.delete(id)
    }
  }

  addFurniture(f: FurnitureNetState) {
    if (this.furniture.has(f.id)) {
      const root = this.furniture.get(f.id)!
      root.position.set(f.x, f.y, f.z)
      root.rotation.y = f.yaw || 0
      return
    }
    const root = createFurnitureMesh(f.propId)
    root.userData.furnitureId = f.id
    root.userData.propId = f.propId
    root.userData.isBuildProps = true
    root.position.set(f.x, f.y, f.z)
    root.rotation.y = f.yaw || 0
    this.furniture.set(f.id, root)
    this.group.add(root)
  }

  removeCrate(id: string) {
    const root = this.crates.get(id)
    if (!root) return
    this.group.remove(root)
    this.crates.delete(id)
  }

  removeFurnitureIds(ids: string[]) {
    for (const id of ids) {
      const root = this.furniture.get(id)
      if (!root) continue
      this.group.remove(root)
      this.furniture.delete(id)
    }
  }

  nearestCrate(x: number, z: number, maxDist = 3.5): string | null {
    let best: string | null = null
    let bestD = maxDist
    for (const [id, root] of this.crates) {
      const d = Math.hypot(root.position.x - x, root.position.z - z)
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return best
  }

  tick(dt: number) {
    for (const root of this.monsters.values()) tickMonster(root, dt)
    for (const root of this.furniture.values()) {
      if (root.userData.isFirePit || root.userData.isCombat) tickCombatProps(root, dt)
      else if (root.userData.isBuildProps) tickBuildProps(root, dt)
    }
  }

  dispose() {
    this.scene.remove(this.group)
    this.monsters.clear()
    this.crates.clear()
    this.furniture.clear()
    this.hpBars.clear()
  }
}
