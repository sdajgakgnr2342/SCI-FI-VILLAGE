import * as THREE from 'three'

export type HarvestKind = 'dig' | 'chop' | 'mine' | 'build' | 'clear'

export const ACTION_DURATION: Record<HarvestKind, number> = {
  dig: 0.3,
  build: 0.3,
  chop: 3,
  /** 小石默认；中/大石在 beginHarvest 里按 size 加长 */
  mine: 1.2,
  clear: 0.3,
}

/** 按石堆大小决定开采时长（一次采完整堆） */
export function mineDurationForSize(size: number) {
  if (size <= 1) return 0.9
  if (size === 2) return 1.2
  return 1.8
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

/** 木屑 / 石屑粒子（共享几何 + 材质缓存，减少 GC） */
export class DebrisParticles {
  readonly group = new THREE.Group()
  private items: {
    mesh: THREE.Mesh
    vx: number
    vy: number
    vz: number
    life: number
  }[] = []
  private pool: {
    mesh: THREE.Mesh
    vx: number
    vy: number
    vz: number
    life: number
  }[] = []
  private readonly sharedGeo = new THREE.BoxGeometry(1, 0.35, 0.55)
  private readonly matCache = new Map<number, THREE.MeshLambertMaterial>()

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group)
  }

  private matFor(color: number) {
    let m = this.matCache.get(color)
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color })
      this.matCache.set(color, m)
    }
    return m
  }

  burst(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    outward?: THREE.Vector3
  ) {
    const n = Math.min(count, 10)
    for (let i = 0; i < n; i++) {
      const size = 0.03 + Math.random() * 0.05
      const p = this.pool.pop() || {
        mesh: new THREE.Mesh(this.sharedGeo, this.matFor(color)),
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
      }
      p.mesh.material = this.matFor(color)
      p.mesh.scale.set(size, size, size)
      p.mesh.position.set(
        x + (Math.random() - 0.5) * 0.22,
        y + Math.random() * 0.18,
        z + (Math.random() - 0.5) * 0.22
      )
      const dir = outward
        ? outward.clone().normalize()
        : new THREE.Vector3(Math.random() - 0.5, 0.55, Math.random() - 0.5).normalize()
      const sp = 0.9 + Math.random() * 1.6
      p.vx = dir.x * sp + (Math.random() - 0.5) * 0.6
      p.vy = 1.1 + Math.random() * 1.8
      p.vz = dir.z * sp + (Math.random() - 0.5) * 0.6
      p.life = 0.45 + Math.random() * 0.4
      this.group.add(p.mesh)
      this.items.push(p)
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
        this.pool.push(p)
      }
    }
    this.items = alive
  }

  dispose() {
    for (const p of this.items) this.group.remove(p.mesh)
    this.items = []
    this.pool = []
    this.sharedGeo.dispose()
    for (const m of this.matCache.values()) m.dispose()
    this.matCache.clear()
    this.scene.remove(this.group)
  }
}

/** 水平面朝向（砍面）；顶/底击中时退回默认前向 */
function horizontalOutward(
  face: { x: number; y: number; z: number },
  fallback: { x: number; z: number } = { x: 0, z: 1 }
) {
  let nx = face.x
  let nz = face.z
  if (Math.abs(nx) + Math.abs(nz) < 0.01) {
    nx = fallback.x
    nz = fallback.z
  }
  const len = Math.hypot(nx, nz) || 1
  return { x: nx / len, z: nz / len }
}

/**
 * 树干斧口：贴合圆柱表面的 V 形缺口（两片斜面），不再用整格宽砖块。
 */
export class NotchOverlay {
  readonly group = new THREE.Group()
  private blades: THREE.Mesh[] = []
  private depth = 0

  constructor(private scene: THREE.Scene) {
    const mat = new THREE.MeshLambertMaterial({
      color: 0x1a0e08,
      transparent: true,
      opacity: 0.94,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
      mesh.visible = false
      mesh.renderOrder = 11
      this.group.add(mesh)
      this.blades.push(mesh)
    }
    this.group.visible = false
    this.scene.add(this.group)
  }

  /**
   * stage 1..3；trunkR 与木柱半径一致。
   * 缺口开在朝向玩家一侧的树皮上。
   */
  showAt(
    x: number,
    y: number,
    z: number,
    face: { x: number; y: number; z: number },
    stage: number,
    trunkR = 0.3
  ) {
    this.depth = Math.min(3, Math.max(1, stage))
    const { x: nx, z: nz } = horizontalOutward(face)
    const yaw = Math.atan2(nx, nz)

    const cut = 0.05 + this.depth * 0.055
    const span = 0.2 + this.depth * 0.03
    const tall = 0.1 + this.depth * 0.035
    const cx = x + 0.5 - nx * (trunkR - cut * 0.35)
    const cy = y + 0.36
    const cz = z + 0.5 - nz * (trunkR - cut * 0.35)

    this.group.position.set(cx, cy, cz)
    this.group.rotation.set(0, yaw, 0)

    // 两片斜面组成 V：本地 -Z 为嵌入树干方向
    const tilt = 0.38 + this.depth * 0.04
    for (let i = 0; i < this.blades.length; i++) {
      const mesh = this.blades[i]
      const sign = i === 0 ? 1 : -1
      mesh.scale.set(span, tall * 0.55, cut)
      mesh.position.set(0, sign * tall * 0.22, cut * 0.15)
      mesh.rotation.set(sign * tilt, 0, 0)
      mesh.visible = true
    }
    this.group.visible = true
  }

  hide() {
    this.group.visible = false
    this.depth = 0
    for (const m of this.blades) m.visible = false
  }

  dispose() {
    this.hide()
    this.scene.remove(this.group)
    for (const m of this.blades) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.blades = []
  }
}

/** 石头表面裂纹：贴面细缝，避免粗棒穿出像树杈 */
const _crackX = new THREE.Vector3()
const _crackY = new THREE.Vector3()
const _crackZ = new THREE.Vector3()
const _crackDir = new THREE.Vector3()
const _crackBitangent = new THREE.Vector3()
const _crackBasis = new THREE.Matrix4()

export class CrackOverlay {
  readonly group = new THREE.Group()
  private lines: THREE.Mesh[] = []
  private mat: THREE.MeshBasicMaterial

  constructor(private scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x121212,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
    for (let i = 0; i < 4; i++) {
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
    /** 风格化石视觉中心 */
    pivot?: { x: number; y: number; z: number },
    /** 表面外推距离（贴合石头外形） */
    surfaceR = 0.4
  ) {
    const s = Math.min(3, Math.max(1, stage))
    this.mat.opacity = 0.45 + s * 0.16

    const cx = pivot?.x ?? x + 0.5
    const cy = pivot?.y ?? y + 0.45
    const cz = pivot?.z ?? z + 0.5

    let nx = face.x
    let ny = face.y
    let nz = face.z
    if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) < 0.01) {
      nx = 0
      ny = 0.35
      nz = 1
    }
    // 开采时常见顶视/斜视：把法线抬一点，裂纹落在石头朝向玩家的鼓面
    if (Math.abs(ny) > 0.85) {
      const h = horizontalOutward(face, { x: 0, z: 1 })
      nx = h.x * 0.75
      ny = 0.45
      nz = h.z * 0.75
    }
    const nlen = Math.hypot(nx, ny, nz) || 1
    nx /= nlen
    ny /= nlen
    nz /= nlen

    const lift = Math.max(0.12, surfaceR * 0.92)
    const ox = cx + nx * lift
    const oy = cy + ny * lift
    const oz = cz + nz * lift

    _crackZ.set(nx, ny, nz)
    if (Math.abs(ny) < 0.9) _crackY.set(0, 1, 0)
    else _crackY.set(1, 0, 0)
    _crackX.crossVectors(_crackY, _crackZ).normalize()
    _crackY.crossVectors(_crackZ, _crackX).normalize()

    const specs = [
      { u: 0, v: 0, len: 0.34 + s * 0.08, thick: 0.016, ang: 0.12 },
      { u: 0.06, v: -0.08, len: 0.22 + s * 0.05, thick: 0.013, ang: -0.7 },
      { u: -0.08, v: 0.07, len: 0.18 + s * 0.04, thick: 0.012, ang: 0.95 },
      { u: 0.02, v: 0.11, len: 0.14 + s * 0.03, thick: 0.01, ang: -1.15 },
    ]

    for (let i = 0; i < this.lines.length; i++) {
      const mesh = this.lines[i]
      if (i >= specs.length) {
        mesh.visible = false
        continue
      }
      const sp = specs[i]
      const ca = Math.cos(sp.ang)
      const sa = Math.sin(sp.ang)
      _crackDir
        .set(
          _crackX.x * ca + _crackY.x * sa,
          _crackX.y * ca + _crackY.y * sa,
          _crackX.z * ca + _crackY.z * sa
        )
        .normalize()
      _crackBitangent.crossVectors(_crackZ, _crackDir).normalize()

      mesh.position.set(
        ox + _crackX.x * sp.u + _crackY.x * sp.v,
        oy + _crackX.y * sp.u + _crackY.y * sp.v,
        oz + _crackX.z * sp.u + _crackY.z * sp.v
      )
      _crackBasis.makeBasis(_crackDir, _crackBitangent, _crackZ)
      mesh.quaternion.setFromRotationMatrix(_crackBasis)
      mesh.scale.set(sp.len, sp.thick, 0.012)
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
