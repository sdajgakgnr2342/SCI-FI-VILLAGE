import * as THREE from 'three'
import { squadColor } from '@/game/squad'

export const SQUAD_MARK_TTL_MS = 90_000

export interface SquadMark {
  userId: number
  slot: number
  x: number
  y: number
  z: number
  label?: string
  /** 客户端本地过期时间戳 */
  expiresAt: number
}

export function isMarkExpired(m: SquadMark, now = Date.now()) {
  return now >= m.expiresAt
}

function softMarkHex(hex: string) {
  // 小号标记：保留小队色饱和，只略压一点避免刺眼
  const c = new THREE.Color(hex)
  c.lerp(new THREE.Color(0xffffff), 0.06)
  return `#${c.getHexString()}`
}

function makeSlotTexture(slot: number, color: string) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.92
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.stroke()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(20,24,28,0.45)'
  ctx.stroke()

  const text = String(slot)
  ctx.font = '800 72px system-ui,Segoe UI,sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = size / 2
  const cy = size / 2 + 2
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.lineWidth = 10
  ctx.strokeStyle = 'rgba(12,14,16,0.92)'
  ctx.strokeText(text, cx, cy)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, cx, cy)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

/** 透视立体标记：小号针体 + 清晰番号，depthTest=false */
export function createSquadMarkMesh(slot: number): THREE.Group {
  const soft = softMarkHex(squadColor(slot))
  const col = new THREE.Color(soft)
  const g = new THREE.Group()
  g.renderOrder = 1000

  const mat = new THREE.MeshBasicMaterial({
    color: col,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.78,
    toneMapped: false,
  })

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.55, 8), mat)
  stem.position.y = 0.28
  stem.renderOrder = 1000
  g.add(stem)

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.18, 8), mat)
  tip.rotation.x = Math.PI
  tip.position.y = 0.01
  tip.renderOrder = 1000
  g.add(tip)

  const tex = makeSlotTexture(slot, soft)
  const badge = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.94,
      sizeAttenuation: true,
      toneMapped: false,
    })
  )
  badge.scale.set(0.42, 0.42, 0.42)
  badge.position.y = 0.72
  badge.renderOrder = 1001
  g.add(badge)
  g.userData.slot = slot
  g.userData.dispose = () => {
    tex.dispose()
    mat.dispose()
    stem.geometry.dispose()
    tip.geometry.dispose()
  }
  return g
}

export class SquadMarkVisuals {
  readonly group = new THREE.Group()
  private meshes = new Map<number, THREE.Group>()

  sync(marks: SquadMark[]) {
    const keep = new Set(marks.map((m) => m.userId))
    for (const [uid, mesh] of this.meshes) {
      if (keep.has(uid)) continue
      this.group.remove(mesh)
      mesh.userData.dispose?.()
      this.meshes.delete(uid)
    }
    for (const m of marks) {
      let mesh = this.meshes.get(m.userId)
      if (!mesh || mesh.userData.slot !== m.slot) {
        if (mesh) {
          this.group.remove(mesh)
          mesh.userData.dispose?.()
        }
        mesh = createSquadMarkMesh(m.slot)
        this.meshes.set(m.userId, mesh)
        this.group.add(mesh)
      }
      mesh.position.set(m.x, m.y, m.z)
    }
  }

  clear() {
    this.sync([])
  }

  dispose() {
    this.clear()
  }
}
