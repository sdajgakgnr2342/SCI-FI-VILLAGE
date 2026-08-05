import * as THREE from 'three'
import type { NpcPolicy } from '@/api/server'
import type { GameAudio } from './gameAudio'

type Phase = 'enter' | 'linger' | 'depart' | 'exit'

export type NpcWorldQuery = {
  standY: (x: number, z: number) => number
  walkable: (x: number, z: number) => boolean
  nearBuild: (x: number, z: number, radius?: number) => boolean
}

interface NpcAgent {
  id: string
  mesh: THREE.Group
  legL: THREE.Mesh
  legR: THREE.Mesh
  armL: THREE.Mesh
  armR: THREE.Mesh
  phase: Phase
  age: number
  lingerUntil: number
  target: THREE.Vector3
  /** 走路 1.0~1.45 / 小跑离开 1.85~2.15，绝不跳跃 */
  speed: number
  baseSpeed: number
  fading: number
  yaw: number
  walkPhase: number
  moving: boolean
  stuck: number
  fleeBuild: boolean
  steerSign: number
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export function createVillager(hue = 0.12) {
  const root = new THREE.Group()
  const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.08, 0.35, 0.72) })
  const cloth = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setHSL(hue, 0.35, 0.45),
  })
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a32 })

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin)
  head.position.y = 1.58

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.68, 0.28), cloth)
  body.position.y = 0.98

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), cloth)
  armL.position.set(-0.34, 1.12, 0)
  armL.geometry.translate(0, -0.22, 0)

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), cloth)
  armR.position.set(0.34, 1.12, 0)
  armR.geometry.translate(0, -0.22, 0)

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), dark)
  legL.position.set(-0.12, 0.55, 0)
  legL.geometry.translate(0, -0.275, 0)

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), dark)
  legR.position.set(0.12, 0.55, 0)
  legR.geometry.translate(0, -0.275, 0)

  root.add(head, body, armL, armR, legL, legR)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.frustumCulled = true
  })
  return { root, legL, legR, armL, armR }
}

/**
 * 人机村民：只走路/小跑、遇障绕行、不跳跃；靠近玩家房屋则尽快离开。
 */
export class NpcManager {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private policy: NpcPolicy
  private world: NpcWorldQuery
  private agents: NpcAgent[] = []
  private cooldown = 0
  private nearbyHumans = 0
  private tmp = new THREE.Vector3()
  private look = new THREE.Vector3()
  private frustum = new THREE.Frustum()
  private mat = new THREE.Matrix4()
  private tick = 0
  audio: GameAudio | null = null

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    policy: NpcPolicy,
    world: NpcWorldQuery
  ) {
    this.scene = scene
    this.camera = camera
    this.policy = policy
    this.world = world
  }

  setNearbyHumanCount(n: number) {
    this.nearbyHumans = n
  }

  update(dt: number) {
    this.tick++
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.maybeSpawn()
    this.updateAgents(dt)
  }

  private maybeSpawn() {
    if (this.cooldown > 0) return
    if (this.nearbyHumans >= this.policy.suppressWhenPlayersNearby) return
    if (this.agents.length >= this.policy.maxNearPlayer) return
    if (Math.random() > 0.012) return

    this.spawnBehindPlayer()
    this.cooldown = rand(10, 22)
  }

  private findWalkableNear(
    ox: number,
    oz: number,
    radius: number,
    tries = 28
  ): THREE.Vector3 | null {
    // 优先稍远一点，减少贴树再选树边的目标
    for (let i = 0; i < tries; i++) {
      const ang = (i / tries) * Math.PI * 2 + Math.random() * 0.4
      const d = rand(Math.min(1.2, radius * 0.35), radius)
      const x = ox + Math.cos(ang) * d
      const z = oz + Math.sin(ang) * d
      if (!this.world.walkable(x, z)) continue
      if (this.world.nearBuild(x, z, 4)) continue
      return new THREE.Vector3(x, this.world.standY(x, z), z)
    }
    return null
  }

  private spawnBehindPlayer() {
    const cam = this.camera.position
    this.camera.getWorldDirection(this.look)
    this.look.y = 0
    if (this.look.lengthSq() < 1e-4) this.look.set(0, 0, -1)
    this.look.normalize()

    const side = Math.random() > 0.5 ? 1 : -1
    const back = this.look.clone().multiplyScalar(-1)
    const right = new THREE.Vector3().crossVectors(back, new THREE.Vector3(0, 1, 0)).normalize()
    const dist = rand(this.policy.spawnDistance[0], this.policy.spawnDistance[1])

    let pos: THREE.Vector3 | null = null
    for (let attempt = 0; attempt < 12; attempt++) {
      const p = cam
        .clone()
        .addScaledVector(back, dist * (0.65 + Math.random() * 0.25))
        .addScaledVector(right, side * dist * (0.4 + Math.random() * 0.3))
      if (this.world.walkable(p.x, p.z) && !this.world.nearBuild(p.x, p.z, 5)) {
        p.y = this.world.standY(p.x, p.z)
        pos = p
        break
      }
    }
    if (!pos) {
      pos = this.findWalkableNear(cam.x, cam.z, dist + 4)
    }
    if (!pos) return

    const { root, legL, legR, armL, armR } = createVillager(0.05 + Math.random() * 0.55)
    root.position.copy(pos)
    root.scale.setScalar(0.01)
    this.scene.add(root)

    const wander =
      this.findWalkableNear(pos.x, pos.z, 3.5) ||
      new THREE.Vector3(pos.x, this.world.standY(pos.x, pos.z), pos.z)

    const yaw = Math.atan2(-(wander.x - pos.x), -(wander.z - pos.z))
    const baseSpeed = rand(1.05, 1.4)

    this.agents.push({
      id: `npc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mesh: root,
      legL,
      legR,
      armL,
      armR,
      phase: 'enter',
      age: 0,
      lingerUntil: rand(this.policy.lingerSec[0], this.policy.lingerSec[1]),
      target: wander,
      speed: baseSpeed,
      baseSpeed,
      fading: 1,
      yaw,
      walkPhase: Math.random() * Math.PI * 2,
      moving: false,
      stuck: 0,
      fleeBuild: false,
      steerSign: Math.random() > 0.5 ? 1 : -1,
    })
  }

  private beginFleeFromBuild(a: NpcAgent) {
    if (a.fleeBuild && (a.phase === 'depart' || a.phase === 'exit')) return
    a.fleeBuild = true
    a.phase = 'depart'
    a.speed = rand(1.85, 2.15)
    a.target = this.pickAwayFromBuilds(a)
  }

  private pickAwayFromBuilds(a: NpcAgent): THREE.Vector3 {
    const p = a.mesh.position
    const cam = this.camera.position
    // 远离玩家与房屋方向
    const away = p.clone().sub(cam)
    away.y = 0
    if (away.lengthSq() < 1e-4) {
      this.camera.getWorldDirection(away)
      away.y = 0
      away.multiplyScalar(-1)
    }
    away.normalize()
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2
      const dir = new THREE.Vector3(
        away.x * Math.cos(ang) - away.z * Math.sin(ang),
        0,
        away.x * Math.sin(ang) + away.z * Math.cos(ang)
      )
      const dist = rand(10, 22)
      const tx = p.x + dir.x * dist
      const tz = p.z + dir.z * dist
      if (this.world.walkable(tx, tz) && !this.world.nearBuild(tx, tz, 5)) {
        return new THREE.Vector3(tx, this.world.standY(tx, tz), tz)
      }
    }
    return this.pickBlindSpotTarget(a, true)
  }

  private updateAgents(dt: number) {
    this.camera.updateMatrixWorld()
    this.mat.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.mat)
    this.camera.getWorldDirection(this.look)
    this.look.y = 0
    this.look.normalize()

    const alive: NpcAgent[] = []
    const camX = this.camera.position.x
    const camZ = this.camera.position.z
    for (const a of this.agents) {
      const adx = a.mesh.position.x - camX
      const adz = a.mesh.position.z - camZ
      const d2 = adx * adx + adz * adz
      // 远处 NPC 降频更新，近处保持流畅
      if (d2 > 72 * 72 && this.tick % 3 !== 0) {
        a.age += dt
        alive.push(a)
        continue
      }
      if (d2 > 42 * 42 && (this.tick & 1) === 1) {
        a.age += dt
        alive.push(a)
        continue
      }

      a.age += dt

      // 误入玩家房屋附近：立刻小跑离开
      if (this.world.nearBuild(a.mesh.position.x, a.mesh.position.z, 5)) {
        this.beginFleeFromBuild(a)
      }

      if (a.phase === 'enter') {
        const s = Math.min(1, a.mesh.scale.x + dt * 2.0)
        a.mesh.scale.setScalar(s)
        this.walkToward(a, dt)
        if (s >= 1) a.phase = 'linger'
      } else if (a.phase === 'linger') {
        this.walkToward(a, dt)
        if (a.age >= a.lingerUntil) {
          a.phase = 'depart'
          a.speed = Math.min(a.speed + 0.25, 1.75)
          a.target = this.pickBlindSpotTarget(a)
        } else if (a.mesh.position.distanceToSquared(a.target) < 0.8) {
          if (Math.random() < 0.4) {
            a.target.copy(a.mesh.position)
          } else {
            const next = this.findWalkableNear(a.mesh.position.x, a.mesh.position.z, 4)
            if (next) a.target.copy(next)
          }
        }
      } else if (a.phase === 'depart') {
        this.walkToward(a, dt)
        const dist = a.mesh.position.distanceTo(this.camera.position)
        if (a.mesh.position.distanceToSquared(a.target) < 2.5) {
          a.target = a.fleeBuild ? this.pickAwayFromBuilds(a) : this.pickBlindSpotTarget(a, true)
        }
        if (dist >= this.policy.despawnMinDistance && !this.world.nearBuild(a.mesh.position.x, a.mesh.position.z, 4)) {
          a.phase = 'exit'
        }
      } else if (a.phase === 'exit') {
        this.walkToward(a, dt)
        a.fading = Math.max(0, a.fading - dt * 0.3)
        a.mesh.scale.setScalar(Math.max(0.05, a.fading))
        const inView = this.isInView(a.mesh.position)
        const far = a.mesh.position.distanceTo(this.camera.position) >= this.policy.despawnMinDistance
        if (far && (!inView || a.fading <= 0.05)) {
          this.disposeAgent(a)
          continue
        }
        if (inView && a.mesh.position.distanceToSquared(a.target) < 9) {
          a.target = a.fleeBuild ? this.pickAwayFromBuilds(a) : this.pickBlindSpotTarget(a, true)
        }
      }

      this.animateWalk(a, dt)
      alive.push(a)
    }
    this.agents = alive
  }

  private pickBlindSpotTarget(a: NpcAgent, farther = false): THREE.Vector3 {
    const cam = this.camera.position
    const back = this.look.clone().multiplyScalar(-1)
    const right = new THREE.Vector3().crossVectors(back, new THREE.Vector3(0, 1, 0)).normalize()
    const side = Math.random() > 0.5 ? 1 : -1
    const base = farther
      ? rand(this.policy.departDistance[1], this.policy.departDistance[1] + 16)
      : rand(this.policy.departDistance[0], this.policy.departDistance[1])

    for (let i = 0; i < 10; i++) {
      const t = cam
        .clone()
        .addScaledVector(back, base + rand(-2, 4))
        .addScaledVector(right, side * rand(4, 12) * (i % 2 === 0 ? 1 : -1))
      const away = a.mesh.position.clone().sub(cam)
      if (away.lengthSq() > 1e-4) {
        away.normalize()
        t.addScaledVector(away, farther ? 10 : 4)
      }
      if (this.world.walkable(t.x, t.z) && !this.world.nearBuild(t.x, t.z, 4)) {
        t.y = this.world.standY(t.x, t.z)
        return t
      }
    }
    const fallback = cam.clone().addScaledVector(back, base + 8)
    fallback.y = this.world.standY(fallback.x, fallback.z)
    return fallback
  }

  /** 平滑走路：转向 + 绕障，贴平地，绝不爬石/跳跃 */
  private walkToward(a: NpcAgent, dt: number) {
    const pos = a.mesh.position
    pos.y = this.world.standY(pos.x, pos.z)

    // 已站在不可走格（偶发嵌进树干）：立刻脱出
    if (!this.world.walkable(pos.x, pos.z)) {
      this.unstuckAgent(a)
      return
    }

    this.tmp.copy(a.target).sub(pos)
    this.tmp.y = 0
    const dist = this.tmp.length()

    if (dist < 0.12) {
      a.moving = false
      a.stuck = 0
      return
    }

    const desiredYaw = Math.atan2(-this.tmp.x, -this.tmp.z)
    let dy = desiredYaw - a.yaw
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2

    const turnSpeed = a.fleeBuild ? 5.5 : 4.2
    const maxTurn = turnSpeed * dt
    const turn = Math.max(-maxTurn, Math.min(maxTurn, dy))
    a.yaw += turn
    a.mesh.rotation.y = a.yaw

    if (Math.abs(dy) >= 0.7) {
      a.moving = false
      // 目标方向被树挡住时仍累计 stuck，避免一直转圈不走
      const fx = -Math.sin(desiredYaw)
      const fz = -Math.cos(desiredYaw)
      const lx = pos.x + fx * 0.55
      const lz = pos.z + fz * 0.55
      if (!this.world.walkable(lx, lz)) {
        a.stuck += dt
        if (a.stuck > 0.45) this.unstuckAgent(a)
      }
      return
    }

    const step = Math.min(a.speed * dt, dist)
    const moved = this.tryStep(a, step)
    if (moved) {
      a.moving = true
      a.stuck = Math.max(0, a.stuck - dt * 2)
      return
    }

    // 前方受阻：左右试探绕行（不跳）
    a.stuck += dt
    const sidestep = this.trySteerAround(a, step)
    if (sidestep) {
      a.moving = true
      a.stuck = Math.max(0, a.stuck - dt)
      return
    }

    a.moving = false
    if (a.stuck > 0.45) this.unstuckAgent(a)
  }

  /** 卡树/灌木旁：换向、侧移脱出、重选目标 */
  private unstuckAgent(a: NpcAgent) {
    a.stuck = 0
    a.steerSign *= -1
    const pos = a.mesh.position

    const escapes: [number, number][] = [
      [0.85, 0],
      [-0.85, 0],
      [0, 0.85],
      [0, -0.85],
      [0.7, 0.7],
      [0.7, -0.7],
      [-0.7, 0.7],
      [-0.7, -0.7],
      [1.4, 0],
      [-1.4, 0],
      [0, 1.4],
      [0, -1.4],
    ]
    // 打乱，避免总朝同一方向挤
    for (let i = escapes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[escapes[i], escapes[j]] = [escapes[j], escapes[i]]
    }
    for (const [dx, dz] of escapes) {
      const nx = pos.x + dx
      const nz = pos.z + dz
      if (!this.world.walkable(nx, nz)) continue
      if (this.world.nearBuild(nx, nz, 3)) continue
      pos.x = nx
      pos.z = nz
      pos.y = this.world.standY(nx, nz)
      a.yaw = Math.atan2(-dx, -dz)
      a.mesh.rotation.y = a.yaw
      break
    }

    if (a.fleeBuild || a.phase === 'depart' || a.phase === 'exit') {
      a.target = a.fleeBuild ? this.pickAwayFromBuilds(a) : this.pickBlindSpotTarget(a, true)
    } else {
      const next = this.findWalkableNear(pos.x, pos.z, 8)
      if (next) a.target.copy(next)
      else a.target = this.pickBlindSpotTarget(a, true)
    }
  }

  private tryStep(a: NpcAgent, step: number): boolean {
    const fx = -Math.sin(a.yaw)
    const fz = -Math.cos(a.yaw)
    const nx = a.mesh.position.x + fx * step
    const nz = a.mesh.position.z + fz * step
    // 前瞻半步，避免贴进障碍
    const lx = a.mesh.position.x + fx * Math.max(step, 0.4)
    const lz = a.mesh.position.z + fz * Math.max(step, 0.4)
    if (!this.world.walkable(nx, nz) || !this.world.walkable(lx, lz)) return false
    // 逃离房屋时不要朝建筑更近的方向硬闯
    if (
      a.fleeBuild &&
      this.world.nearBuild(nx, nz, 3) &&
      !this.world.nearBuild(a.mesh.position.x, a.mesh.position.z, 3)
    ) {
      return false
    }
    a.mesh.position.x = nx
    a.mesh.position.z = nz
    a.mesh.position.y = this.world.standY(nx, nz)
    return true
  }

  private trySteerAround(a: NpcAgent, step: number): boolean {
    // 更大角度侧绕，必要时倒退离开树旁
    const s = a.steerSign
    const offsets = [
      0.55 * s,
      0.95 * s,
      1.35 * s,
      1.85 * s,
      -0.55 * s,
      -0.95 * s,
      -1.35 * s,
      -1.85 * s,
      Math.PI * 0.85,
      -Math.PI * 0.85,
    ]
    for (const off of offsets) {
      const yaw = a.yaw + off
      const fx = -Math.sin(yaw)
      const fz = -Math.cos(yaw)
      const stride = Math.abs(off) > 2 ? step * 0.9 : step
      const nx = a.mesh.position.x + fx * stride
      const nz = a.mesh.position.z + fz * stride
      const lx = a.mesh.position.x + fx * 0.5
      const lz = a.mesh.position.z + fz * 0.5
      if (!this.world.walkable(nx, nz) || !this.world.walkable(lx, lz)) continue
      a.yaw = yaw
      a.mesh.rotation.y = a.yaw
      a.mesh.position.x = nx
      a.mesh.position.z = nz
      a.mesh.position.y = this.world.standY(nx, nz)
      a.stuck = 0
      return true
    }
    return false
  }

  private animateWalk(a: NpcAgent, dt: number) {
    if (a.moving) {
      a.walkPhase += dt * a.speed * 5.2
      const swing = Math.sin(a.walkPhase) * 0.55
      a.legL.rotation.x = swing
      a.legR.rotation.x = -swing
      a.armL.rotation.x = -swing * 0.7
      a.armR.rotation.x = swing * 0.7
      // 轻微上下颠簸（不是跳跃）
      a.mesh.position.y = this.world.standY(a.mesh.position.x, a.mesh.position.z)
      a.mesh.position.y += Math.abs(Math.sin(a.walkPhase * 2)) * 0.02
      if (this.audio) {
        const id = Number.parseInt(String(a.id).replace(/\D/g, ''), 10) || a.id.length
        this.audio.tickPeerFoot(
          10_000 + (id % 9000),
          dt,
          true,
          a.speed > 1.7,
          { x: a.mesh.position.x, z: a.mesh.position.z },
          { x: this.camera.position.x, z: this.camera.position.z }
        )
      }
    } else {
      const k = 1 - Math.exp(-8 * dt)
      a.legL.rotation.x += (0 - a.legL.rotation.x) * k
      a.legR.rotation.x += (0 - a.legR.rotation.x) * k
      a.armL.rotation.x += (0 - a.armL.rotation.x) * k
      a.armR.rotation.x += (0 - a.armR.rotation.x) * k
      a.mesh.position.y = this.world.standY(a.mesh.position.x, a.mesh.position.z)
    }
  }

  private isInView(worldPos: THREE.Vector3) {
    const to = this.tmp.copy(worldPos).sub(this.camera.position)
    to.y = 0
    if (to.lengthSq() < 1e-4) return true
    to.normalize()
    const cos = this.look.dot(to)
    const half = (this.policy.fovHalfDeg * Math.PI) / 180
    if (cos < Math.cos(half)) return false
    return this.frustum.containsPoint(worldPos)
  }

  private disposeAgent(a: NpcAgent) {
    this.scene.remove(a.mesh)
    a.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else (mat as THREE.Material).dispose()
      }
    })
  }

  dispose() {
    for (const a of this.agents) this.disposeAgent(a)
    this.agents = []
  }
}
