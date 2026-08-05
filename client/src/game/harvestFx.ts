import * as THREE from 'three'

export type HarvestKind = 'dig' | 'chop' | 'mine' | 'build' | 'clear'

export const ACTION_DURATION: Record<HarvestKind, number> = {
  dig: 0.3,
  build: 0.3,
  chop: 3,
  /** 单块石头（与整棵树不同，需逐块开采） */
  mine: 1.2,
  clear: 0.3,
}

export function actionLabel(kind: HarvestKind | null): string {
  switch (kind) {
    case 'dig':
      return '挖'
    case 'chop':
      return '砍'
    case 'mine':
      return '开采'
    case 'build':
      return '建'
    case 'clear':
      return '清'
    default:
      return '挖'
  }
}

/** 木屑 / 石屑粒子 */
export class DebrisParticles {
  readonly group = new THREE.Group()
  private items: {
    mesh: THREE.Mesh
    vx: number
    vy: number
    vz: number
    life: number
  }[] = []

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group)
  }

  burst(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    outward?: THREE.Vector3
  ) {
    for (let i = 0; i < count; i++) {
      const size = 0.04 + Math.random() * 0.07
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.6, size * 0.8),
        new THREE.MeshLambertMaterial({ color })
      )
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.4,
        y + Math.random() * 0.3,
        z + (Math.random() - 0.5) * 0.4
      )
      const dir = outward
        ? outward.clone().normalize()
        : new THREE.Vector3(Math.random() - 0.5, 0.6, Math.random() - 0.5).normalize()
      const sp = 1.2 + Math.random() * 2.2
      this.group.add(mesh)
      this.items.push({
        mesh,
        vx: dir.x * sp + (Math.random() - 0.5),
        vy: 1.5 + Math.random() * 2.5,
        vz: dir.z * sp + (Math.random() - 0.5),
        life: 0.6 + Math.random() * 0.5,
      })
    }
  }

  update(dt: number) {
    const alive = []
    for (const p of this.items) {
      p.life -= dt
      p.vy -= 14 * dt
      p.mesh.position.x += p.vx * dt
      p.mesh.position.y += p.vy * dt
      p.mesh.position.z += p.vz * dt
      p.mesh.rotation.x += dt * 8
      p.mesh.rotation.z += dt * 6
      if (p.life > 0 && p.mesh.position.y > -2) {
        alive.push(p)
      } else {
        this.group.remove(p.mesh)
        p.mesh.geometry.dispose()
        ;(p.mesh.material as THREE.Material).dispose()
      }
    }
    this.items = alive
  }

  dispose() {
    for (const p of this.items) {
      this.group.remove(p.mesh)
      p.mesh.geometry.dispose()
      ;(p.mesh.material as THREE.Material).dispose()
    }
    this.items = []
    this.scene.remove(this.group)
  }
}

/** 树干缺口（每砍一下加深 1/3） */
export class NotchOverlay {
  readonly mesh: THREE.Mesh
  private depth = 0

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1.02, 0.28, 0.22)
    const mat = new THREE.MeshLambertMaterial({
      color: 0x2a1810,
      transparent: true,
      opacity: 0.92,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.visible = false
    this.scene.add(this.mesh)
  }

  /** stage 1..3 */
  showAt(x: number, y: number, z: number, face: { x: number; y: number; z: number }, stage: number) {
    this.depth = Math.min(3, Math.max(1, stage))
    const inset = 0.15 + this.depth * 0.22
    const h = 0.22 + this.depth * 0.06
    this.mesh.scale.set(1, h / 0.28, inset / 0.22)
    const nx = face.x || 0
    const nz = face.z || (face.y !== 0 ? 1 : 0)
    // 缺口嵌在朝向玩家的一侧
    this.mesh.position.set(
      x + 0.5 - nx * (0.5 - inset * 0.35),
      y + 0.35,
      z + 0.5 - nz * (0.5 - inset * 0.35)
    )
    this.mesh.rotation.set(0, Math.atan2(nx, nz), 0)
    this.mesh.visible = true
  }

  hide() {
    this.mesh.visible = false
    this.depth = 0
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}

/** 石头裂纹加深 */
export class CrackOverlay {
  readonly mesh: THREE.Mesh

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(0.95, 0.95)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.visible = false
    this.scene.add(this.mesh)
  }

  showAt(x: number, y: number, z: number, face: { x: number; y: number; z: number }, stage: number) {
    const op = 0.25 + Math.min(3, stage) * 0.2
    ;(this.mesh.material as THREE.MeshBasicMaterial).opacity = op
    this.mesh.position.set(
      x + 0.5 + face.x * 0.51,
      y + 0.5 + face.y * 0.51,
      z + 0.5 + face.z * 0.51
    )
    this.mesh.lookAt(
      x + 0.5 + face.x * 2,
      y + 0.5 + face.y * 2,
      z + 0.5 + face.z * 2
    )
    this.mesh.visible = true
  }

  hide() {
    this.mesh.visible = false
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
