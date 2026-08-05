import * as THREE from 'three'
import type { PeerPresence, PresenceAction } from './presence'
import type { GameAudio } from './gameAudio'
import { squadColor } from './squad'

function makeSlotBadgeTexture(slot: number, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 128, 128)

  ctx.beginPath()
  ctx.arc(64, 64, 48, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()

  ctx.font = 'bold 64px sans-serif'
  ctx.fillStyle = '#111111'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(slot), 64, 68)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function createAvatar(hue: number) {
  const root = new THREE.Group()
  const skin = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setHSL(0.08, 0.35, 0.72),
  })
  const cloth = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setHSL(hue, 0.45, 0.42),
  })
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin)
  head.position.y = 1.55
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), cloth)
  body.position.y = 0.95
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), cloth)
  legL.position.set(-0.12, 0.28, 0)
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), cloth)
  legR.position.set(0.12, 0.28, 0)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), cloth)
  armL.position.set(-0.34, 1.05, 0)
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), cloth)
  armR.position.set(0.34, 1.05, 0)
  root.add(head, body, legL, legR, armL, armR)

  const spriteMat = new THREE.SpriteMaterial({
    map: makeSlotBadgeTexture(1, squadColor(1)),
    transparent: true,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(spriteMat)
  sprite.position.y = 2.15
  sprite.scale.set(0.42, 0.42, 1)
  sprite.visible = false
  root.add(sprite)

  return { root, armR, armL, legL, legR, sprite, spriteMat }
}

interface RemoteAgent {
  userId: number
  displayName: string
  mesh: THREE.Group
  armR: THREE.Mesh
  armL: THREE.Mesh
  legL: THREE.Mesh
  legR: THREE.Mesh
  sprite: THREE.Sprite
  spriteMat: THREE.SpriteMaterial
  target: THREE.Vector3
  yaw: number
  action: PresenceAction
  crouching: boolean
  phase: number
  lastTs: number
  slot: number | null
}

/**
 * 渲染同服其他真人玩家
 */
export class RemotePlayerManager {
  private scene: THREE.Scene
  private agents = new Map<number, RemoteAgent>()
  private tmp = new THREE.Vector3()
  /** userId → 小队号码 1..4；非队友不显示头顶标记 */
  private squadSlots = new Map<number, number>()
  audio: GameAudio | null = null
  listener: (() => { x: number; z: number }) | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /** 同步小队席位（只给队友头顶画号码圆圈） */
  setSquadSlots(members: { userId: number; slot: number }[]) {
    this.squadSlots.clear()
    for (const m of members) {
      if (m.userId && m.slot) this.squadSlots.set(m.userId, m.slot)
    }
    for (const a of this.agents.values()) this.refreshBadge(a)
  }

  private refreshBadge(a: RemoteAgent) {
    const slot = this.squadSlots.get(a.userId) ?? null
    if (slot === a.slot && a.sprite.visible === Boolean(slot)) return
    a.slot = slot
    if (!slot) {
      a.sprite.visible = false
      return
    }
    const old = a.spriteMat.map
    a.spriteMat.map = makeSlotBadgeTexture(slot, squadColor(slot))
    a.spriteMat.needsUpdate = true
    a.sprite.visible = true
    old?.dispose()
  }

  upsert(peer: PeerPresence) {
    let a = this.agents.get(peer.userId)
    if (!a) {
      const hue = (peer.userId * 0.17) % 1
      const av = createAvatar(hue)
      this.scene.add(av.root)
      a = {
        userId: peer.userId,
        displayName: peer.displayName || peer.username || `玩家${peer.userId}`,
        mesh: av.root,
        armR: av.armR,
        armL: av.armL,
        legL: av.legL,
        legR: av.legR,
        sprite: av.sprite,
        spriteMat: av.spriteMat,
        target: new THREE.Vector3(peer.x, peer.y - 1.62, peer.z),
        yaw: peer.yaw,
        action: peer.action || null,
        crouching: Boolean(peer.crouching),
        phase: 0,
        lastTs: peer.ts || Date.now(),
        slot: null,
      }
      a.mesh.position.copy(a.target)
      this.agents.set(peer.userId, a)
      this.refreshBadge(a)
    }

    a.target.set(peer.x, peer.y - 1.62, peer.z)
    a.yaw = peer.yaw
    a.action = peer.action || null
    a.crouching = Boolean(peer.crouching)
    a.lastTs = peer.ts || Date.now()
    a.displayName = peer.displayName || peer.username || `玩家${peer.userId}`
  }

  remove(userId: number) {
    const a = this.agents.get(userId)
    if (!a) return
    this.scene.remove(a.mesh)
    a.spriteMat.map?.dispose()
    a.spriteMat.dispose()
    a.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else (mat as THREE.Material).dispose()
      }
    })
    this.agents.delete(userId)
  }

  syncList(peers: PeerPresence[]) {
    const keep = new Set(peers.map((p) => p.userId))
    for (const id of [...this.agents.keys()]) {
      if (!keep.has(id)) this.remove(id)
    }
    for (const p of peers) this.upsert(p)
  }

  update(dt: number) {
    const now = Date.now()
    for (const a of this.agents.values()) {
      if (now - a.lastTs > 12000) {
        this.remove(a.userId)
        continue
      }

      a.mesh.position.lerp(a.target, 1 - Math.exp(-10 * dt))
      let dy = a.yaw - (a.mesh.userData.smoothYaw ?? a.yaw)
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      const smooth = (a.mesh.userData.smoothYaw ?? a.yaw) + dy * Math.min(1, dt * 8)
      a.mesh.userData.smoothYaw = smooth
      a.mesh.rotation.y = smooth + Math.PI

      const moving = a.mesh.position.distanceToSquared(a.target) > 0.002
      if (moving) a.phase += dt * 8
      const swing = moving ? Math.sin(a.phase) * 0.45 : 0

      const listener = this.listener?.()
      if (this.audio && listener) {
        const at = { x: a.mesh.position.x, z: a.mesh.position.z }
        const speed = Math.hypot(a.target.x - a.mesh.position.x, a.target.z - a.mesh.position.z)
        this.audio.tickPeerFoot(a.userId, dt, moving, speed > 0.35, at, listener)
        this.audio.peerAction(a.userId, a.action, at, listener)
      }

      if (a.action === 'chop' || a.action === 'mine') {
        const t = (performance.now() / 180) % (Math.PI * 2)
        a.armR.rotation.x = -0.8 + Math.sin(t) * 1.1
        a.armL.rotation.x = 0.2
      } else if (a.action === 'dig' || a.action === 'build') {
        const t = (performance.now() / 140) % (Math.PI * 2)
        a.armR.rotation.x = -0.4 + Math.sin(t) * 0.7
        a.armL.rotation.x = 0.1
      } else {
        a.armR.rotation.x = -swing
        a.armL.rotation.x = swing
      }
      a.legL.rotation.x = swing
      a.legR.rotation.x = -swing

      a.mesh.scale.y = a.crouching ? 0.82 : 1
      a.sprite.position.y = a.crouching ? 1.85 : 2.15
    }
  }

  count() {
    return this.agents.size
  }

  listMapPeers() {
    return [...this.agents.values()].map((a) => ({
      userId: a.userId,
      name: a.displayName,
      x: a.mesh.position.x,
      z: a.mesh.position.z,
      yaw: a.yaw,
    }))
  }

  dispose() {
    for (const id of [...this.agents.keys()]) this.remove(id)
  }
}
