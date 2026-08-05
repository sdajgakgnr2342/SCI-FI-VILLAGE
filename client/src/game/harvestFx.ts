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

/** 石头裂纹加深（细线裂纹，不用整面黑遮罩挡视线） */
const _crackFrom = new THREE.Vector3(1, 0, 0)
const _crackDir = new THREE.Vector3()

export class CrackOverlay {
  readonly group = new THREE.Group()
  private lines: THREE.Mesh[] = []
  private mat: THREE.MeshBasicMaterial

  constructor(private scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x0c0c0c,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    // 3 条细裂纹，避免整脸平面遮挡
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.mat)
      mesh.visible = false
      mesh.renderOrder = 12
      this.group.add(mesh)
      this.lines.push(mesh)
    }
    this.group.visible = false
    this.scene.add(this.group)
  }

  showAt(
    x: number,
    y: number,
    z: number,
    face: { x: number; y: number; z: number },
    stage: number,
    /** 风格化石中心；缺省则用方块中心 */
    pivot?: { x: number; y: number; z: number }
  ) {
    const s = Math.min(3, Math.max(1, stage))
    this.mat.opacity = 0.35 + s * 0.18

    const cx = pivot?.x ?? x + 0.5
    const cy = pivot?.y ?? y + 0.5
    const cz = pivot?.z ?? z + 0.5
    const nx = face.x || 0
    const ny = face.y || 0
    const nz = face.z || 0
    // 略浮出表面，贴合准星面
    const ox = cx + nx * 0.28
    const oy = cy + ny * 0.28
    const oz = cz + nz * 0.28

    // 面上的切向基
    let tx = 0
    let ty = 1
    let tz = 0
    if (Math.abs(ny) > 0.7) {
      tx = 1
      ty = 0
      tz = 0
    } else {
      tx = -nz
      ty = 0
      tz = nx
      const len = Math.hypot(tx, tz) || 1
      tx /= len
      tz /= len
    }
    const bx = ny * tz - nz * ty
    const by = nz * tx - nx * tz
    const bz = nx * ty - ny * tx

    const specs = [
      { u: 0, v: 0.02, len: 0.42 + s * 0.06, thick: 0.028, ang: 0.15 },
      { u: 0.08, v: -0.1, len: 0.28 + s * 0.05, thick: 0.022, ang: -0.55 },
      { u: -0.1, v: 0.12, len: 0.22 + s * 0.04, thick: 0.02, ang: 0.9 },
    ]

    for (let i = 0; i < this.lines.length; i++) {
      const mesh = this.lines[i]
      const sp = specs[i]
      const ca = Math.cos(sp.ang)
      const sa = Math.sin(sp.ang)
      _crackDir.set(tx * ca + bx * sa, ty * ca + by * sa, tz * ca + bz * sa).normalize()
      mesh.position.set(ox + tx * sp.u + bx * sp.v, oy + ty * sp.u + by * sp.v, oz + tz * sp.u + bz * sp.v)
      mesh.scale.set(sp.len, sp.thick, sp.thick)
      mesh.quaternion.setFromUnitVectors(_crackFrom, _crackDir)
      mesh.visible = true
    }
    this.group.visible = true
  }

  hide() {
    this.group.visible = false
    for (const m of this.lines) m.visible = false
  }

  dispose() {
    this.hide()
    this.scene.remove(this.group)
    for (const m of this.lines) m.geometry.dispose()
    this.mat.dispose()
    this.lines = []
  }
}
