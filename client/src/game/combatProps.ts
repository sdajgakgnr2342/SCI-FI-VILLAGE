import * as THREE from 'three'
import { createMonster } from '@/game/wildMonster'

/**
 * 武器 / 击打特效 / 火堆（建模页预览）。
 * 暂不接入正式战斗；火堆扣血仅在预览里演示。
 */

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

function glowDisc(hex: number, size: number, opacity = 0.55) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const c = new THREE.Color(hex)
  const r = (c.r * 255) | 0
  const g = (c.g * 255) | 0
  const b = (c.b * 255) | 0
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`)
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.25)`)
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

export type CombatWeaponKind = 'staff' | 'cleaver' | 'pistol' | 'rifle' | 'sniper'
export type HitFxKind = 'slash' | 'impact' | 'muzzle'

/** 火堆灼烧半径（格）与预览扣血节奏 */
export const FIRE_PIT_RADIUS = 4
export const FIRE_PIT_DAMAGE = 1
export const FIRE_PIT_TICK_SEC = 0.55
export const FIRE_PIT_DEMO_HP = 40

const WOOD = () => std(0x6a482c, { metalness: 0.05, roughness: 0.78 })
const WOOD_DARK = () => std(0x4a321e, { metalness: 0.04, roughness: 0.82 })
const STEEL = () => std(0x8a929a, { metalness: 0.82, roughness: 0.28 })
const STEEL_DARK = () => std(0x3a4048, { metalness: 0.85, roughness: 0.35 })
const BLADE = () => std(0xc8d0d8, { metalness: 0.9, roughness: 0.22, emissive: 0x202428, emit: 0.08 })

/** 长木棍 */
export function createStaff(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'weapon-staff'

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 1.85, 10), WOOD())
  shaft.position.y = 0.92
  root.add(shaft)

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10), WOOD_DARK())
  grip.position.y = 0.55
  root.add(grip)

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), WOOD_DARK())
  tip.position.y = 1.85
  root.add(tip)

  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 10), WOOD_DARK())
  butt.position.y = 0.04
  root.add(butt)

  tagWeapon(root, 'staff')
  return root
}

/** 大砍刀 */
export function createCleaver(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'weapon-cleaver'

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.07), WOOD())
  handle.position.set(0, 0.28, 0)
  root.add(handle)

  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.09), WOOD_DARK())
  pommel.position.set(0, 0.05, 0)
  root.add(pommel)

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.1), STEEL_DARK())
  guard.position.set(0, 0.5, 0)
  root.add(guard)

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.03), BLADE())
  blade.position.set(0.04, 0.88, 0)
  root.add(blade)

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.035), STEEL())
  spine.position.set(-0.02, 0.88, 0)
  root.add(spine)

  // 刀尖斜切感
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.028), BLADE())
  tip.position.set(0.06, 1.28, 0)
  tip.rotation.z = -0.45
  root.add(tip)

  tagWeapon(root, 'cleaver')
  return root
}

function makeGunBody(kind: 'pistol' | 'rifle' | 'sniper'): THREE.Group {
  const g = new THREE.Group()
  g.name = `gun-${kind}`

  if (kind === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.28), STEEL())
    slide.position.set(0, 0.12, -0.02)
    g.add(slide)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.18, 8), STEEL_DARK())
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.13, -0.2)
    g.add(barrel)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), WOOD_DARK())
    grip.position.set(0, 0.0, 0.06)
    grip.rotation.x = 0.25
    g.add(grip)
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.03), STEEL_DARK())
    trigger.position.set(0, 0.05, 0.02)
    g.add(trigger)
    const muzzle = new THREE.Object3D()
    muzzle.position.set(0, 0.13, -0.3)
    muzzle.name = 'muzzle'
    g.add(muzzle)
    return g
  }

  const long = kind === 'sniper'
  const stockLen = long ? 0.42 : 0.32
  const barrelLen = long ? 0.85 : 0.55

  const receiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.12, long ? 0.4 : 0.32),
    STEEL()
  )
  receiver.position.set(0, 0.12, 0)
  g.add(receiver)

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, stockLen), WOOD())
  stock.position.set(0, 0.1, stockLen * 0.45 + 0.12)
  g.add(stock)

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), WOOD_DARK())
  grip.position.set(0, 0.02, 0.08)
  grip.rotation.x = 0.35
  g.add(grip)

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.025, barrelLen, 10),
    STEEL_DARK()
  )
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.14, -barrelLen * 0.45 - 0.08)
  g.add(barrel)

  if (long) {
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.02), STEEL())
    bipod.position.set(0, 0.04, -0.35)
    g.add(bipod)
  } else {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), STEEL_DARK())
    mag.position.set(0, -0.02, -0.02)
    g.add(mag)
  }

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.14, -barrelLen * 0.9 - 0.1)
  muzzle.name = 'muzzle'
  g.add(muzzle)
  return g
}

/** 红点瞄具（世界模型上的小件） */
function makeRedDotSight(): THREE.Group {
  const s = new THREE.Group()
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.12), STEEL_DARK())
  s.add(rail)
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 12), STEEL())
  tube.rotation.x = Math.PI / 2
  tube.position.y = 0.04
  s.add(tube)
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.022, 16),
    new THREE.MeshStandardMaterial({
      color: 0x102018,
      metalness: 0.2,
      roughness: 0.15,
      transparent: true,
      opacity: 0.55,
      emissive: 0x20ff60,
      emissiveIntensity: 0.35,
    })
  )
  glass.position.set(0, 0.04, 0.032)
  s.add(glass)
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 8, 8),
    std(0xff2020, { emissive: 0xff0000, emit: 1.4, metalness: 0.1, roughness: 0.4 })
  )
  dot.position.set(0, 0.04, 0.034)
  s.add(dot)
  return s
}

/** 高倍镜筒 */
function makeScopeTube(): THREE.Group {
  const s = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.28, 14), STEEL())
  body.rotation.x = Math.PI / 2
  s.add(body)
  const front = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.06, 14), STEEL_DARK())
  front.rotation.x = Math.PI / 2
  front.position.z = -0.16
  s.add(front)
  const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.05, 12), STEEL_DARK())
  rear.rotation.x = Math.PI / 2
  rear.position.z = 0.15
  s.add(rear)
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.032, 20),
    new THREE.MeshStandardMaterial({
      color: 0x1a3040,
      metalness: 0.3,
      roughness: 0.1,
      transparent: true,
      opacity: 0.45,
      emissive: 0x406080,
      emissiveIntensity: 0.2,
    })
  )
  glass.position.z = 0.175
  s.add(glass)
  return s
}

export function createPistol(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'weapon-pistol'
  const gun = makeGunBody('pistol')
  const sight = makeRedDotSight()
  sight.position.set(0, 0.2, -0.02)
  gun.add(sight)
  root.add(gun)
  tagWeapon(root, 'pistol')
  root.userData.hasRedDot = true
  return root
}

export function createRifle(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'weapon-rifle'
  const gun = makeGunBody('rifle')
  const sight = makeRedDotSight()
  sight.position.set(0, 0.22, -0.05)
  gun.add(sight)
  root.add(gun)
  tagWeapon(root, 'rifle')
  root.userData.hasRedDot = true
  return root
}

export function createSniper(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'weapon-sniper'
  const gun = makeGunBody('sniper')
  const scope = makeScopeTube()
  scope.position.set(0, 0.24, -0.05)
  gun.add(scope)
  root.add(gun)
  tagWeapon(root, 'sniper')
  root.userData.hasScope = true
  root.userData.scopeZoom = 4
  root.userData.scopeZoomMin = 2
  root.userData.scopeZoomMax = 8
  return root
}

function tagWeapon(root: THREE.Group, kind: CombatWeaponKind) {
  root.userData.isCombat = true
  root.userData.weaponKind = kind
  root.userData.attackable = true
}

/**
 * 第一人称持枪预览：枪在右下，朝 -Z。
 * 建模页切换到 fpView 时固定相机。
 */
export function createFpWeaponView(kind: 'pistol' | 'rifle' | 'sniper'): THREE.Group {
  const root = new THREE.Group()
  root.name = `fp-${kind}`

  const weapon =
    kind === 'pistol' ? createPistol() : kind === 'rifle' ? createRifle() : createSniper()
  // 握持位：右下前
  weapon.position.set(0.22, -0.18, -0.42)
  weapon.rotation.set(-0.08, 0.12, 0.08)
  if (kind === 'pistol') {
    weapon.position.set(0.2, -0.16, -0.38)
    weapon.scale.setScalar(1.15)
  } else if (kind === 'sniper') {
    weapon.position.set(0.18, -0.2, -0.55)
    weapon.rotation.set(-0.05, 0.06, 0.04)
  }
  root.add(weapon)

  // 简易手臂
  const skin = std(0xe8c4a2, { roughness: 0.7, metalness: 0.05 })
  const cloth = std(0x3d7a5a, { roughness: 0.65, metalness: 0.08 })
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.28), cloth)
  arm.position.set(0.18, -0.28, -0.22)
  root.add(arm)
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.09), skin)
  hand.position.set(0.2, -0.22, -0.36)
  root.add(hand)

  const flash = glowDisc(0xffe080, 0.35, 0)
  flash.visible = false
  const muzzle = weapon.getObjectByName('muzzle')
  if (muzzle) {
    muzzle.add(flash)
  } else {
    flash.position.set(0.22, -0.05, -0.7)
    root.add(flash)
  }

  root.userData.isCombat = true
  root.userData.fpView = true
  root.userData.weaponKind = kind
  root.userData.attackable = true
  root.userData.hasRedDot = kind !== 'sniper'
  root.userData.hasScope = kind === 'sniper'
  root.userData.scopeZoom = kind === 'sniper' ? 4 : 1
  root.userData.scopeZoomMin = 2
  root.userData.scopeZoomMax = 8
  root.userData.muzzleFlash = flash
  root.userData.flashT = 0
  root.userData.weaponRef = weapon
  return root
}

/** 近战挥击时的弧形斩击 + 火花 */
export function createSlashFx(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'fx-slash'

  const arcMat = new THREE.MeshBasicMaterial({
    color: 0xffe8a0,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const arc = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 24, 1, 0, Math.PI * 0.85), arcMat)
  arc.rotation.x = -0.4
  arc.rotation.y = 0.5
  g.add(arc)

  const sparks: THREE.Mesh[] = []
  const sparkMat = std(0xffc060, { emissive: 0xff8020, emit: 1.2, metalness: 0.2, roughness: 0.4 })
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), sparkMat)
    s.position.set((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.3)
    sparks.push(s)
    g.add(s)
  }

  g.userData.isCombat = true
  g.userData.hitFx = 'slash'
  g.userData.fxLife = 0.45
  g.userData.fxMax = 0.45
  g.userData.arc = arc
  g.userData.sparks = sparks
  return g
}

/** 击中火花 */
export function createImpactFx(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'fx-impact'
  const core = glowDisc(0xfff0a0, 0.7, 0.9)
  g.add(core)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.28, 20),
    new THREE.MeshBasicMaterial({
      color: 0xff9040,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  )
  ring.rotation.x = -Math.PI / 2
  g.add(ring)
  g.userData.isCombat = true
  g.userData.hitFx = 'impact'
  g.userData.fxLife = 0.35
  g.userData.fxMax = 0.35
  g.userData.core = core
  g.userData.ring = ring
  return g
}

/** 枪口火焰 */
export function createMuzzleFx(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'fx-muzzle'
  const flash = glowDisc(0xffe080, 0.55, 0.95)
  g.add(flash)
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.22, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffc040,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  )
  cone.rotation.x = Math.PI / 2
  cone.position.z = -0.08
  g.add(cone)
  g.userData.isCombat = true
  g.userData.hitFx = 'muzzle'
  g.userData.fxLife = 0.18
  g.userData.fxMax = 0.18
  g.userData.flash = flash
  g.userData.cone = cone
  return g
}

/** 击打特效总览：点击循环播放 */
export function createHitFxShowcase(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'hit-fx-showcase'

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.95, 0.06, 24),
    std(0x4a5a50, { roughness: 0.7 })
  )
  pad.position.y = 0.03
  root.add(pad)

  const dummy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.25), STEEL_DARK())
  dummy.position.set(0, 0.6, -0.4)
  root.add(dummy)

  const staff = createStaff()
  staff.position.set(-1.2, 0, 0.3)
  staff.rotation.z = 0.2
  root.add(staff)

  const cleaver = createCleaver()
  cleaver.position.set(1.2, 0, 0.3)
  cleaver.rotation.z = -0.15
  root.add(cleaver)

  root.userData.isCombat = true
  root.userData.hitFxShowcase = true
  root.userData.attackable = true
  root.userData.fxCycle = 0
  root.userData.liveFx = null as THREE.Group | null
  return root
}

/**
 * 火堆：怪物进入半径持续扣少量血（预览逻辑）。
 */
export function createFirePit(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fire-pit'

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.6, 0.08, 16),
    std(0x3a3228, { roughness: 0.9, metalness: 0.05 })
  )
  ground.position.y = 0.04
  root.add(ground)

  const rockMat = std(0x6a6870, { roughness: 0.85, metalness: 0.1 })
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), rockMat)
    rock.position.set(Math.cos(a) * 0.42, 0.1, Math.sin(a) * 0.42)
    rock.rotation.set(Math.random(), Math.random(), Math.random())
    root.add(rock)
  }

  const logMat = WOOD_DARK()
  for (const [x, z, ry] of [
    [0.05, 0.08, 0.4],
    [-0.08, -0.05, -0.5],
    [0.02, -0.1, 1.1],
  ] as const) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.55, 8), logMat)
    log.rotation.z = Math.PI / 2
    log.rotation.y = ry
    log.position.set(x, 0.16, z)
    root.add(log)
  }

  const flameGroup = new THREE.Group()
  flameGroup.name = 'flames'
  const flameColors = [0xff6020, 0xff9020, 0xffc040]
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.08 - i * 0.008, 0.35 + i * 0.05, 6),
      std(flameColors[i % 3], {
        metalness: 0.05,
        roughness: 0.4,
        emissive: flameColors[i % 3],
        emit: 1.2,
      })
    )
    f.position.set((i - 2) * 0.04, 0.35 + i * 0.02, (i % 2) * 0.03)
    flameGroup.add(f)
  }
  root.add(flameGroup)

  const glow = glowDisc(0xff7030, 1.6, 0.55)
  glow.position.y = 0.4
  root.add(glow)

  const light = new THREE.PointLight(0xff8020, 1.4, FIRE_PIT_RADIUS * 1.6, 2)
  light.position.y = 0.5
  root.add(light)

  // 灼烧范围圈
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(FIRE_PIT_RADIUS - 0.06, FIRE_PIT_RADIUS, 48),
    new THREE.MeshBasicMaterial({
      color: 0xff6020,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  root.add(ring)

  root.userData.isCombat = true
  root.userData.isFirePit = true
  root.userData.fireRadius = FIRE_PIT_RADIUS
  root.userData.fireDamage = FIRE_PIT_DAMAGE
  root.userData.fireTick = FIRE_PIT_TICK_SEC
  root.userData.fireAcc = 0
  root.userData.flameGroup = flameGroup
  root.userData.fireGlow = glow
  root.userData.fireLight = light
  root.userData.rangeRing = ring
  return root
}

/** 火堆 + 野怪演示：圈内持续扣血 */
export function createFirePitDemo(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fire-pit-demo'

  const pit = createFirePit()
  root.add(pit)

  const mon = createMonster('mite')
  mon.position.set(FIRE_PIT_RADIUS * 0.55, 0, 0.2)
  mon.userData.hp = FIRE_PIT_DEMO_HP
  mon.userData.maxHp = FIRE_PIT_DEMO_HP
  root.add(mon)

  // 血条
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x202028, depthTest: false })
  )
  barBg.position.set(0, 1.15, 0)
  mon.add(barBg)
  const barFill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xe04040, depthTest: false })
  )
  barFill.position.set(0, 1.15, 0.01)
  mon.add(barFill)

  root.userData.isCombat = true
  root.userData.isFirePitDemo = true
  root.userData.firePit = pit
  root.userData.demoMonster = mon
  root.userData.hpBar = barFill
  root.userData.isMonster = true
  return root
}

/** 武器总览 */
export function createWeaponsShowcase(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'weapons-showcase'

  const items: { w: THREE.Group; x: number }[] = [
    { w: createStaff(), x: -2.4 },
    { w: createCleaver(), x: -1.2 },
    { w: createPistol(), x: 0 },
    { w: createRifle(), x: 1.3 },
    { w: createSniper(), x: 2.8 },
  ]
  for (const { w, x } of items) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 0.04, 20),
      std(0x4a5a50, { roughness: 0.7 })
    )
    pad.position.set(x, 0.02, 0)
    root.add(pad)
    w.position.set(x, 0, 0)
    if (w.userData.weaponKind === 'pistol' || w.userData.weaponKind === 'rifle') {
      w.rotation.y = -0.4
      w.position.y = 0.35
    } else if (w.userData.weaponKind === 'sniper') {
      w.rotation.y = -0.35
      w.position.y = 0.25
    } else if (w.userData.weaponKind === 'cleaver') {
      w.rotation.z = -0.3
    }
    root.add(w)
  }

  root.userData.isCombat = true
  root.userData.weaponsShowcase = true
  return root
}

export function playCombatAttack(root: THREE.Object3D): string {
  const kind = root.userData.weaponKind as CombatWeaponKind | undefined

  if (root.userData.hitFxShowcase) {
    const cycle = (Number(root.userData.fxCycle) || 0) % 3
    root.userData.fxCycle = cycle + 1
    const prev = root.userData.liveFx as THREE.Group | null
    if (prev) {
      root.remove(prev)
      disposeCombatExtras(prev)
    }
    const fx =
      cycle === 0 ? createSlashFx() : cycle === 1 ? createImpactFx() : createMuzzleFx()
    fx.position.set(0, 0.7, 0.1)
    root.add(fx)
    root.userData.liveFx = fx
    return cycle === 0 ? '斩击特效' : cycle === 1 ? '击中火花' : '枪口火焰'
  }

  if (root.userData.fpView || kind === 'pistol' || kind === 'rifle' || kind === 'sniper') {
    const flash = root.userData.muzzleFlash as THREE.Sprite | undefined
    if (flash) {
      flash.visible = true
      flash.material.opacity = 0.95
      root.userData.flashT = 0.12
    }
    // 世界枪械：临时挂枪口特效
    if (!root.userData.fpView) {
      const fx = createMuzzleFx()
      fx.position.set(0, 0.15, -0.45)
      root.add(fx)
      root.userData.liveFx = fx
    }
    return kind === 'pistol' ? '手枪开火' : kind === 'sniper' ? '狙击开火' : '步枪开火'
  }

  if (kind === 'staff' || kind === 'cleaver') {
    root.userData.swingT = 0
    root.userData.swinging = true
    const fx = createSlashFx()
    fx.position.set(0.2, 1.0, 0.3)
    root.add(fx)
    root.userData.liveFx = fx
    return kind === 'staff' ? '木棍挥击' : '砍刀挥击'
  }

  // 点到武器总览里的子武器
  let found: THREE.Object3D | null = null
  root.traverse((o) => {
    if (!found && o.userData.attackable && o.userData.weaponKind) found = o
  })
  if (found && found !== root) return playCombatAttack(found)

  return ''
}

export function findCombatTarget(hit: THREE.Object3D): THREE.Object3D | null {
  let o: THREE.Object3D | null = hit
  let weapon: THREE.Object3D | null = null
  while (o) {
    if (o.userData.weaponKind && o.userData.attackable) weapon = o
    if (o.userData.hitFxShowcase || o.userData.fpView || o.userData.isFirePitDemo) return o
    if (o.userData.weaponsShowcase) return weapon || o
    if (o.userData.attackable && !o.userData.weaponsShowcase) return o
    o = o.parent
  }
  return weapon
}

export function setSniperZoom(root: THREE.Object3D, zoom: number) {
  const min = Number(root.userData.scopeZoomMin) || 2
  const max = Number(root.userData.scopeZoomMax) || 8
  const z = Math.max(min, Math.min(max, Math.round(zoom)))
  root.userData.scopeZoom = z
  return z
}

export function nudgeSniperZoom(root: THREE.Object3D, delta: number) {
  return setSniperZoom(root, (Number(root.userData.scopeZoom) || 4) + delta)
}

export function getCombatStateText(root: THREE.Object3D): string {
  if (root.userData.isFirePitDemo) {
    const mon = root.userData.demoMonster as THREE.Object3D | undefined
    const hp = Math.max(0, Math.ceil(Number(mon?.userData.hp) || 0))
    const max = Number(mon?.userData.maxHp) || FIRE_PIT_DEMO_HP
    return `火堆灼烧 · 怪 ${hp}/${max}`
  }
  if (root.userData.hasScope) {
    return `高倍镜 · ${root.userData.scopeZoom}x`
  }
  if (root.userData.hasRedDot) return '红点倍镜'
  if (root.userData.hitFxShowcase) return '点击播放击打特效'
  const k = root.userData.weaponKind as string
  if (k === 'staff') return '长木棍'
  if (k === 'cleaver') return '大砍刀'
  return ''
}

export function tickCombatProps(root: THREE.Object3D, dt: number) {
  const t = (root.userData._combatT = (root.userData._combatT || 0) + dt)

  // 火堆演示扣血
  if (root.userData.isFirePitDemo) {
    const pit = root.userData.firePit as THREE.Object3D
    const mon = root.userData.demoMonster as THREE.Object3D
    tickFirePitVisual(pit, t)
    const dx = mon.position.x - pit.position.x
    const dz = mon.position.z - pit.position.z
    const dist = Math.hypot(dx, dz)
    const radius = Number(pit.userData.fireRadius) || FIRE_PIT_RADIUS
    if (dist <= radius) {
      pit.userData.fireAcc = (Number(pit.userData.fireAcc) || 0) + dt
      const tick = Number(pit.userData.fireTick) || FIRE_PIT_TICK_SEC
      while (pit.userData.fireAcc >= tick) {
        pit.userData.fireAcc -= tick
        mon.userData.hp = Math.max(0, Number(mon.userData.hp) - (Number(pit.userData.fireDamage) || 1))
        if (mon.userData.hp <= 0) {
          mon.userData.hp = FIRE_PIT_DEMO_HP
        }
      }
    }
    const bar = root.userData.hpBar as THREE.Mesh | undefined
    if (bar) {
      const ratio = Math.max(0, Number(mon.userData.hp) / (Number(mon.userData.maxHp) || 1))
      bar.scale.x = Math.max(0.02, ratio)
      bar.position.x = -0.33 * (1 - ratio)
    }
  }

  // 单火堆动画
  if (root.userData.isFirePit) tickFirePitVisual(root, t)

  root.traverse((o) => {
    if (o.userData.hitFx) {
      o.userData.fxLife = Number(o.userData.fxLife) - dt
      const life = Number(o.userData.fxLife)
      const max = Number(o.userData.fxMax) || 0.4
      const k = Math.max(0, life / max)
      if (o.userData.hitFx === 'slash') {
        const arc = o.userData.arc as THREE.Mesh
        if (arc) {
          ;(arc.material as THREE.MeshBasicMaterial).opacity = 0.85 * k
          arc.rotation.z += dt * 4
        }
        ;(o.userData.sparks as THREE.Mesh[] | undefined)?.forEach((s, i) => {
          s.position.y += dt * (1.2 + i * 0.05)
          s.scale.setScalar(k)
        })
      }
      if (o.userData.hitFx === 'impact') {
        const core = o.userData.core as THREE.Sprite
        const ring = o.userData.ring as THREE.Mesh
        if (core) core.material.opacity = 0.9 * k
        if (ring) {
          ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * k
          ring.scale.setScalar(1 + (1 - k) * 1.5)
        }
      }
      if (o.userData.hitFx === 'muzzle') {
        const flash = o.userData.flash as THREE.Sprite
        const cone = o.userData.cone as THREE.Mesh
        if (flash) flash.material.opacity = 0.95 * k
        if (cone) (cone.material as THREE.MeshBasicMaterial).opacity = 0.8 * k
      }
      if (life <= 0) {
        o.parent?.remove(o)
        disposeCombatExtras(o)
      }
    }

    if (o.userData.swinging) {
      o.userData.swingT = (Number(o.userData.swingT) || 0) + dt
      const st = Number(o.userData.swingT)
      const ang = Math.sin(Math.min(1, st / 0.35) * Math.PI) * 0.9
      o.rotation.z = (o.userData.weaponKind === 'cleaver' ? -1 : 1) * ang * 0.5
      if (st >= 0.4) {
        o.userData.swinging = false
        o.rotation.z = 0
      }
    }

    if (o.userData.fpView && o.userData.flashT > 0) {
      o.userData.flashT = Number(o.userData.flashT) - dt
      const flash = o.userData.muzzleFlash as THREE.Sprite
      if (flash) {
        flash.material.opacity = Math.max(0, Number(o.userData.flashT) * 8)
        if (o.userData.flashT <= 0) flash.visible = false
      }
    }
  })
}

function tickFirePitVisual(pit: THREE.Object3D, t: number) {
  const flames = pit.userData.flameGroup as THREE.Group | undefined
  flames?.children.forEach((f, i) => {
    f.scale.y = 0.85 + 0.25 * Math.sin(t * 8 + i)
    f.position.y = 0.32 + i * 0.02 + 0.04 * Math.sin(t * 6 + i * 1.3)
  })
  const glow = pit.userData.fireGlow as THREE.Sprite | undefined
  if (glow) glow.material.opacity = 0.4 + 0.2 * Math.sin(t * 5)
  const light = pit.userData.fireLight as THREE.PointLight | undefined
  if (light) light.intensity = 1.15 + 0.35 * Math.sin(t * 4.5)
  const ring = pit.userData.rangeRing as THREE.Mesh | undefined
  if (ring) {
    ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.12 * Math.sin(t * 2)
  }
}

export function disposeCombatExtras(root: THREE.Object3D) {
  root.traverse((o) => {
    const s = o as THREE.Sprite
    if (s.isSprite && s.userData.glowTex) {
      ;(s.userData.glowTex as THREE.Texture).dispose()
    }
  })
}
