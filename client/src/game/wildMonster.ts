import * as THREE from 'three'

/**
 * 野怪预览建模：非人形奇物。
 * 等级越高体型、甲壳、角刺与威胁感越强。
 */

export type MonsterTier =
  | 'scrapmite' // 1 废铁螨
  | 'miregrub' // 2 泥沼蛆
  | 'shardhound' // 3 碎晶犬
  | 'voltspire' // 4 电棘塔兽
  | 'voidmaw' // 5 虚空巨口

export const MONSTER_TIER_ORDER: MonsterTier[] = [
  'scrapmite',
  'miregrub',
  'shardhound',
  'voltspire',
  'voidmaw',
]

export const MONSTER_LABEL: Record<MonsterTier, string> = {
  scrapmite: '废铁螨 · 1级',
  miregrub: '泥沼蛆 · 2级',
  shardhound: '碎晶犬 · 3级',
  voltspire: '电棘塔兽 · 4级',
  voidmaw: '虚空巨口 · 5级',
}

export const MONSTER_HINT: Record<MonsterTier, string> = {
  scrapmite: '小体甲虫 · 弱威胁',
  miregrub: '蠕动毒囊 · 腐蚀感',
  shardhound: '四足晶兽 · 锐角扑杀',
  voltspire: '直立电棘 · 高压威压',
  voidmaw: '裂口巨兽 · 最强压迫',
}

function std(
  color: number,
  opts: { metalness?: number; roughness?: number; emissive?: number; emit?: number } = {}
) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.25,
    roughness: opts.roughness ?? 0.55,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emit ?? 0,
  })
}

function glowSprite(hex: number, size: number, opacity = 0.55) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const c = new THREE.Color(hex)
  const r = (c.r * 255) | 0
  const g = (c.g * 255) | 0
  const b = (c.b * 255) | 0
  const grad = ctx.createRadialGradient(64, 64, 3, 64, 64, 62)
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`)
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.28)`)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity,
    })
  )
  sprite.scale.set(size, size, 1)
  sprite.userData.glowTex = tex
  return sprite
}

/** 1级：废铁螨 —— 矮小甲虫 */
function createScrapmite(): THREE.Group {
  const root = new THREE.Group()
  const shell = std(0x6a7068, { metalness: 0.55, roughness: 0.4 })
  const belly = std(0x3a4038, { metalness: 0.2, roughness: 0.7 })
  const eye = std(0xc04020, { emissive: 0x801010, emit: 0.45 })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), shell)
  body.scale.set(1.25, 0.7, 1.1)
  body.position.y = 0.22
  root.add(body)

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), belly)
  abdomen.scale.set(1.1, 0.75, 1.3)
  abdomen.position.set(0, 0.16, -0.28)
  root.add(abdomen)

  // 六足
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1
    const idx = i % 3
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.28, 5), shell)
    leg.position.set(side * 0.22, 0.1, 0.12 - idx * 0.16)
    leg.rotation.z = side * 0.75
    leg.rotation.x = (idx - 1) * 0.25
    root.add(leg)
  }

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eye)
  eyeL.position.set(-0.12, 0.28, 0.22)
  root.add(eyeL)
  const eyeR = eyeL.clone()
  eyeR.position.x = 0.12
  root.add(eyeR)

  // 小触角
  for (const sx of [-1, 1]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.22, 4), shell)
    ant.position.set(sx * 0.1, 0.38, 0.18)
    ant.rotation.z = sx * 0.4
    ant.rotation.x = -0.5
    root.add(ant)
  }

  root.scale.setScalar(0.95)
  root.userData.monsterAnim = { kind: 'mite', bob: root }
  return root
}

/** 2级：泥沼蛆 —— 臃肿蠕虫 + 毒囊 */
function createMiregrub(): THREE.Group {
  const root = new THREE.Group()
  const flesh = std(0x5a6a38, { metalness: 0.08, roughness: 0.72, emissive: 0x203010, emit: 0.08 })
  const slime = std(0x80c040, { metalness: 0.05, roughness: 0.35, emissive: 0x406020, emit: 0.35 })
  const fang = std(0xd8d0c0, { metalness: 0.3, roughness: 0.4 })

  // 分节身体
  const segs = [0.38, 0.42, 0.4, 0.34, 0.26]
  segs.forEach((r, i) => {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), i === 2 ? slime : flesh)
    seg.scale.set(1.1, 0.85, 1.15)
    seg.position.set(0, 0.28 + (i % 2) * 0.04, 0.45 - i * 0.38)
    root.add(seg)
    seg.userData.segIndex = i
  })

  // 大口环齿
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 14), flesh)
  mouth.position.set(0, 0.32, 0.72)
  mouth.rotation.x = Math.PI / 2
  root.add(mouth)
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), fang)
    t.position.set(Math.cos(ang) * 0.2, 0.32 + Math.sin(ang) * 0.2, 0.78)
    t.rotation.x = Math.PI / 2
    t.rotation.z = ang
    root.add(t)
  }

  const drip = glowSprite(0x80e040, 0.7, 0.35)
  drip.position.set(0, 0.35, 0.15)
  root.add(drip)

  root.userData.monsterAnim = { kind: 'grub', segs: root.children.filter((c) => c.userData.segIndex != null), drip }
  return root
}

/** 3级：碎晶犬 —— 四足晶体猎手 */
function createShardhound(): THREE.Group {
  const root = new THREE.Group()
  const crystal = std(0x6090c8, { metalness: 0.45, roughness: 0.28, emissive: 0x204080, emit: 0.25 })
  const core = std(0xc0e0ff, { metalness: 0.2, roughness: 0.2, emissive: 0x60a0ff, emit: 0.55 })
  const dark = std(0x2a3040, { metalness: 0.5, roughness: 0.45 })

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.9), crystal)
  torso.position.set(0, 0.65, 0)
  root.add(torso)

  // 背部背刺
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35 + i * 0.05, 5), crystal)
    spike.position.set((i % 2 === 0 ? -0.12 : 0.12), 0.9, 0.25 - i * 0.18)
    spike.rotation.x = -0.35
    root.add(spike)
  }

  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), crystal)
  head.position.set(0, 0.72, 0.55)
  head.scale.set(0.9, 0.75, 1.2)
  root.add(head)

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), core)
  eye.position.set(0, 0.78, 0.72)
  root.add(eye)

  // 颚
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 4), dark)
  jaw.position.set(0, 0.55, 0.7)
  jaw.rotation.x = Math.PI / 2
  root.add(jaw)

  // 四足：髋关节组，脚挂在腿末端一起摆动
  const legs: THREE.Group[] = []
  for (const [x, z, phase] of [
    [-0.28, 0.28, 0],
    [0.28, 0.28, Math.PI],
    [-0.28, -0.32, Math.PI],
    [0.28, -0.32, 0],
  ] as const) {
    const hip = new THREE.Group()
    hip.position.set(x, 0.52, z)
    hip.userData.gaitPhase = phase

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), crystal)
    upper.position.set(0, -0.18, 0)
    hip.add(upper)

    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), dark)
    paw.scale.set(1.25, 0.5, 1.35)
    paw.position.set(0, -0.4, 0.02)
    hip.add(paw)

    root.add(hip)
    legs.push(hip)
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 5), crystal)
  tail.position.set(0, 0.55, -0.65)
  tail.rotation.x = Math.PI / 2.4
  root.add(tail)

  const aura = glowSprite(0x60a0ff, 1.2, 0.28)
  aura.position.set(0, 0.7, 0.2)
  root.add(aura)

  root.scale.setScalar(1.05)
  root.userData.monsterAnim = { kind: 'hound', legs, eye, aura }
  return root
}

/** 4级：电棘塔兽 —— 直立塔身 + 电弧 */
function createVoltspire(): THREE.Group {
  const root = new THREE.Group()
  const armor = std(0x3a4a58, { metalness: 0.7, roughness: 0.32, emissive: 0x102028, emit: 0.12 })
  const volt = std(0x40e0ff, { metalness: 0.3, roughness: 0.25, emissive: 0x20a0ff, emit: 0.7 })
  const hot = std(0xffe080, { metalness: 0.4, roughness: 0.2, emissive: 0xffc040, emit: 0.85 })

  // 底座三足
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.22), armor)
    leg.position.set(Math.cos(ang) * 0.45, 0.28, Math.sin(ang) * 0.45)
    leg.rotation.y = -ang
    leg.rotation.z = Math.cos(ang) * 0.25
    root.add(leg)
  }

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.1, 8), armor)
  pillar.position.y = 0.95
  root.add(pillar)

  // 环状电棘：锥尖朝外（四周）
  const up = new THREE.Vector3(0, 1, 0)
  for (let ring = 0; ring < 3; ring++) {
    const y = 0.7 + ring * 0.35
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + ring * 0.2
      // 略向上扬的外法线
      const dir = new THREE.Vector3(Math.cos(ang), 0.25, Math.sin(ang)).normalize()
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 4), volt)
      // 根部贴塔身，尖端向外伸出
      const baseR = 0.3
      spike.position.set(dir.x * (baseR + 0.2), y + dir.y * 0.2, dir.z * (baseR + 0.2))
      spike.quaternion.setFromUnitVectors(up, dir)
      root.add(spike)
    }
  }

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), hot)
  core.position.y = 1.65
  root.add(core)

  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 5), volt)
  crown.position.y = 2.05
  root.add(crown)

  const fx = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 5),
      new THREE.MeshBasicMaterial({
        color: 0x80f0ff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
    spark.userData.phase = Math.random() * Math.PI * 2
    fx.add(spark)
  }
  root.add(fx)

  const aura = glowSprite(0x40d0ff, 2.0, 0.4)
  aura.position.y = 1.2
  root.add(aura)

  root.scale.setScalar(1.15)
  root.userData.monsterAnim = { kind: 'volt', core, fx, aura }
  return root
}

/** 5级：虚空巨口 —— 裂隙巨兽，最强压迫 */
function createVoidmaw(): THREE.Group {
  const root = new THREE.Group()
  const voidMat = std(0x1a0a28, { metalness: 0.35, roughness: 0.45, emissive: 0x2a0840, emit: 0.35 })
  const rim = std(0xc060ff, { metalness: 0.4, roughness: 0.3, emissive: 0x8020c0, emit: 0.55 })
  const abyss = std(0x080410, { metalness: 0.1, roughness: 0.8, emissive: 0x400860, emit: 0.25 })
  const bone = std(0xe8d0f0, { metalness: 0.15, roughness: 0.5 })

  // 巨大裂口躯干
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), voidMat)
  hull.scale.set(1.15, 0.85, 1.0)
  hull.position.y = 0.9
  root.add(hull)

  // 口器空洞
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 10), abyss)
  maw.position.set(0, 0.95, 0.55)
  maw.scale.set(1.1, 0.9, 0.55)
  root.add(maw)

  // 外圈利齿：尖端朝外（周围），不要朝向口心
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.35, 0.55).normalize()
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 4), bone)
    const base = new THREE.Vector3(Math.cos(ang) * 0.4, 0.95 + Math.sin(ang) * 0.32, 0.72)
    tooth.position.copy(base).addScaledVector(dir, 0.14)
    tooth.quaternion.setFromUnitVectors(up, dir)
    root.add(tooth)
  }

  // 悬浮碎环
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 32), rim)
  ring.position.y = 1.0
  ring.rotation.x = Math.PI / 2.5
  root.add(ring)

  // 肩棘：左右外撇，尖端朝外上方
  for (const sx of [-1, 1]) {
    const dir = new THREE.Vector3(sx * 0.85, 0.55, -0.15).normalize()
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.95, 5), voidMat)
    horn.position.set(sx * 0.55, 1.35, -0.05)
    horn.position.addScaledVector(dir, 0.35)
    horn.quaternion.setFromUnitVectors(up, dir)
    root.add(horn)
  }

  // 触须腿
  for (let i = 0; i < 5; i++) {
    const ang = -0.6 + (i / 4) * 1.2
    const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.9, 6), voidMat)
    tent.position.set(Math.sin(ang) * 0.7, 0.35, -0.35 + Math.cos(ang) * 0.2)
    tent.rotation.z = ang * 0.8
    tent.rotation.x = 0.4
    root.add(tent)
    tent.userData.tentacle = true
  }

  // 虚空核心
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), rim)
  core.position.set(0, 0.95, 0.35)
  root.add(core)

  const aura = glowSprite(0xa040ff, 3.2, 0.5)
  aura.position.set(0, 1.0, 0.2)
  root.add(aura)

  const pillar = glowSprite(0x6020a0, 1.4, 0.35)
  pillar.position.set(0, 2.2, 0)
  pillar.scale.set(0.8, 2.4, 1)
  root.add(pillar)

  root.scale.setScalar(1.25)
  root.userData.monsterAnim = {
    kind: 'void',
    ring,
    core,
    aura,
    tentacles: root.children.filter((c) => c.userData.tentacle),
  }
  return root
}

export function createMonster(tier: MonsterTier): THREE.Group {
  let g: THREE.Group
  switch (tier) {
    case 'scrapmite':
      g = createScrapmite()
      break
    case 'miregrub':
      g = createMiregrub()
      break
    case 'shardhound':
      g = createShardhound()
      break
    case 'voltspire':
      g = createVoltspire()
      break
    case 'voidmaw':
      g = createVoidmaw()
      break
    default:
      g = createScrapmite()
  }
  g.name = `monster-${tier}`
  g.userData.isMonster = true
  g.userData.monsterTier = tier
  return g
}

/** 五档并排总览 */
export function createAllMonsters(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'monsters-all'
  MONSTER_TIER_ORDER.forEach((tier, i) => {
    const m = createMonster(tier)
    m.position.x = (i - 2) * 2.35
    root.add(m)
  })
  root.userData.isMonster = true
  root.userData.monsterGroup = true
  return root
}

export function tickMonster(root: THREE.Object3D, dt: number) {
  const t = (root.userData._monT = (root.userData._monT || 0) + dt)

  const tickOne = (node: THREE.Object3D) => {
    const a = node.userData.monsterAnim as
      | {
          kind?: string
          bob?: THREE.Object3D
          segs?: THREE.Object3D[]
          drip?: THREE.Sprite
          legs?: THREE.Object3D[]
          eye?: THREE.Mesh
          aura?: THREE.Sprite
          core?: THREE.Mesh
          fx?: THREE.Group
          ring?: THREE.Mesh
          tentacles?: THREE.Object3D[]
        }
      | undefined
    if (!a) return

    if (a.kind === 'mite' && a.bob) {
      a.bob.position.y = Math.sin(t * 6) * 0.03
      a.bob.rotation.y = Math.sin(t * 1.5) * 0.15
    }

    if (a.kind === 'grub') {
      a.segs?.forEach((seg, i) => {
        seg.position.y = 0.28 + Math.sin(t * 3 + i * 0.8) * 0.05
        seg.scale.x = 1.1 + Math.sin(t * 2.5 + i) * 0.06
      })
      if (a.drip) a.drip.material.opacity = 0.25 + 0.2 * Math.sin(t * 4)
    }

    if (a.kind === 'hound') {
      a.legs?.forEach((leg, i) => {
        const phase = (leg.userData.gaitPhase as number) || i * 1.5
        // 整条腿（含脚）绕髋摆动
        leg.rotation.x = Math.sin(t * 5 + phase) * 0.4
      })
      if (a.eye) {
        const m = a.eye.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.4 + 0.35 * Math.sin(t * 5)
      }
      if (a.aura) a.aura.material.opacity = 0.2 + 0.12 * Math.sin(t * 2)
    }

    if (a.kind === 'volt') {
      if (a.core) {
        a.core.rotation.y = t * 1.5
        a.core.rotation.x = t * 0.8
        const m = a.core.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 7)
      }
      a.fx?.children.forEach((s) => {
        const ph = s.userData.phase as number
        s.position.set(
          Math.sin(t * 4 + ph) * 0.5,
          0.8 + Math.abs(Math.sin(t * 5 + ph)) * 1.0,
          Math.cos(t * 3 + ph) * 0.5
        )
        s.scale.setScalar(0.5 + Math.abs(Math.sin(t * 10 + ph)))
      })
      if (a.aura) a.aura.material.opacity = 0.3 + 0.2 * Math.sin(t * 4)
    }

    if (a.kind === 'void') {
      if (a.ring) {
        a.ring.rotation.z = t * 0.6
        a.ring.rotation.x = Math.PI / 2.5 + Math.sin(t * 0.8) * 0.15
      }
      if (a.core) {
        a.core.rotation.y = t * 2
        const m = a.core.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.45 + 0.4 * Math.sin(t * 3)
        a.core.scale.setScalar(0.9 + 0.2 * Math.sin(t * 2.5))
      }
      a.tentacles?.forEach((tent, i) => {
        tent.rotation.z = Math.sin(t * 2 + i) * 0.35 + (i - 2) * 0.15
        tent.rotation.x = 0.4 + Math.sin(t * 1.8 + i * 0.7) * 0.25
      })
      if (a.aura) {
        a.aura.material.opacity = 0.35 + 0.2 * Math.sin(t * 1.6)
        const s = 3.0 + Math.sin(t * 1.2) * 0.3
        a.aura.scale.set(s, s, 1)
      }
    }
  }

  if (root.userData.monsterAnim) tickOne(root)
  root.children.forEach((c) => {
    if (c.userData.monsterAnim) tickOne(c)
  })
}

export function disposeMonsterExtras(root: THREE.Object3D) {
  root.traverse((o) => {
    const s = o as THREE.Sprite
    if (s.isSprite && s.userData.glowTex) {
      ;(s.userData.glowTex as THREE.Texture).dispose()
    }
  })
}
