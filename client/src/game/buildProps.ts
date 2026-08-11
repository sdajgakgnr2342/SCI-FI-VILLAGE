import * as THREE from 'three'

/**
 * 建造用 1 级原材料 / 家具预览。
 * 后续可按 level 迭代外观；目前仅基础造型。
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

/** 装饰用普通窗户：镂空木框 + 可透视玻璃 */
export function createWindowLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'window-lv1'

  const frame = std(0x7a5535, { metalness: 0.06, roughness: 0.7 })
  const frameDark = std(0x5a3c24, { metalness: 0.05, roughness: 0.75 })
  const sill = std(0x6a482c, { metalness: 0.08, roughness: 0.68 })

  // 半透明玻璃：能看穿，略带水色与高光感
  const glass = new THREE.MeshStandardMaterial({
    color: 0xc8e4f4,
    metalness: 0.05,
    roughness: 0.08,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x88b8d0,
    emissiveIntensity: 0.06,
  })
  // 极淡高光层，用来读出“玻璃面”
  const glassSheen = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.9,
    roughness: 0.05,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const depth = 0.1
  const cx = 0
  const cy = 0.72
  const outerW = 1.05
  const outerH = 1.2
  const thick = 0.08
  const inset = 0.02

  // 镂空外框：四边木条（不再用整块实心板）
  const top = new THREE.Mesh(new THREE.BoxGeometry(outerW, thick, depth), frame)
  top.position.set(cx, cy + outerH * 0.5 - thick * 0.5, 0)
  root.add(top)
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(outerW, thick, depth), frame)
  bottom.position.set(cx, cy - outerH * 0.5 + thick * 0.5, 0)
  root.add(bottom)
  const left = new THREE.Mesh(
    new THREE.BoxGeometry(thick, outerH - thick * 2, depth),
    frame
  )
  left.position.set(cx - outerW * 0.5 + thick * 0.5, cy, 0)
  root.add(left)
  const right = left.clone()
  right.position.x = cx + outerW * 0.5 - thick * 0.5
  root.add(right)

  // 内沿（略深色，增强木框层次）
  const innerW = outerW - thick * 2
  const innerH = outerH - thick * 2
  const lip = 0.035
  const lipTop = new THREE.Mesh(new THREE.BoxGeometry(innerW, lip, depth * 0.7), frameDark)
  lipTop.position.set(cx, cy + innerH * 0.5 - lip * 0.5, inset)
  root.add(lipTop)
  const lipBot = lipTop.clone()
  lipBot.position.y = cy - innerH * 0.5 + lip * 0.5
  root.add(lipBot)

  // 十字棂（四格）
  const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.05, innerH - 0.02, depth * 0.85), frame)
  mullionV.position.set(cx, cy, inset)
  root.add(mullionV)
  const mullionH = new THREE.Mesh(new THREE.BoxGeometry(innerW - 0.02, 0.05, depth * 0.85), frame)
  mullionH.position.set(cx, cy, inset)
  root.add(mullionH)

  // 四块独立玻璃，嵌在框格里（中间完全镂空可透视）
  const paneW = (innerW - 0.05) * 0.5 - 0.02
  const paneH = (innerH - 0.05) * 0.5 - 0.02
  const paneZ = 0.01
  const offsets: [number, number][] = [
    [-paneW * 0.5 - 0.025, paneH * 0.5 + 0.025],
    [paneW * 0.5 + 0.025, paneH * 0.5 + 0.025],
    [-paneW * 0.5 - 0.025, -paneH * 0.5 - 0.025],
    [paneW * 0.5 + 0.025, -paneH * 0.5 - 0.025],
  ]
  for (const [ox, oy] of offsets) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(paneW, paneH, 0.012), glass)
    pane.position.set(cx + ox, cy + oy, paneZ)
    pane.renderOrder = 2
    root.add(pane)

    // 斜向淡高光，让玻璃能被读出来
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(paneW * 0.35, paneH * 0.7), glassSheen)
    sheen.position.set(cx + ox - paneW * 0.18, cy + oy + paneH * 0.05, paneZ + 0.008)
    sheen.rotation.z = -0.2
    sheen.renderOrder = 3
    root.add(sheen)
  }

  // 窗台
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.07, 0.24), sill)
  ledge.position.set(0, cy - outerH * 0.5 - 0.02, 0.06)
  root.add(ledge)

  // 窗台下托
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.1), frameDark)
  bracket.position.set(0, cy - outerH * 0.5 - 0.06, 0)
  root.add(bracket)

  root.userData.buildProp = 'window'
  return root
}

/**
 * 1 级门：偏厚重木门 + 铁件。
 * 双态：关闭挡路（blocksPassage）；打开可通行。
 * 后续可接开锁进入 / 关锁离开。
 */
export function createDoorLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'door-lv1'

  const wood = std(0x5c3a22, { metalness: 0.06, roughness: 0.75 })
  const woodDark = std(0x3e2818, { metalness: 0.05, roughness: 0.8 })
  const iron = std(0x5a6068, { metalness: 0.7, roughness: 0.35, emissive: 0x1a2028, emit: 0.05 })
  const brass = std(0xb8923a, { metalness: 0.75, roughness: 0.3, emissive: 0x403010, emit: 0.12 })

  // 固定门框（不随门扇转动）
  const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.15, 0.18), woodDark)
  jambL.position.set(-0.58, 1.08, 0)
  root.add(jambL)
  const jambR = jambL.clone()
  jambR.position.x = 0.58
  root.add(jambR)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.12, 0.18), woodDark)
  lintel.position.set(0, 2.18, 0)
  root.add(lintel)
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.28), iron)
  threshold.position.set(0, 0.04, 0.02)
  root.add(threshold)

  // 铰链轴：门扇绕左侧开合
  const hinge = new THREE.Group()
  hinge.position.set(-0.5, 0, 0)
  root.add(hinge)

  const leaf = new THREE.Group()
  // 门扇几何以铰链为原点，向右展开
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.05, 0.12), wood)
  slab.position.set(0.5, 1.05, 0)
  leaf.add(slab)

  for (const x of [-0.28, 0, 0.28]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 0.04), woodDark)
    plank.position.set(0.5 + x, 1.05, 0.08)
    leaf.add(plank)
  }

  for (const y of [0.35, 1.05, 1.75]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.06), iron)
    band.position.set(0.5, y, 0.1)
    leaf.add(band)
  }

  for (const y of [0.45, 1.55]) {
    const hingePlate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.08), iron)
    hingePlate.position.set(0.02, y, 0.12)
    leaf.add(hingePlate)
  }

  // 门闩：关闭时横插，打开时收回
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.1), iron)
  latch.position.set(0.72, 1.05, 0.14)
  leaf.add(latch)

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), brass)
  knob.position.set(0.88, 1.05, 0.16)
  leaf.add(knob)

  // 锁扣座（装在右门框上，关闭时与门闩对齐）
  const strike = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), iron)
  strike.position.set(0.54, 1.05, 0.08)
  root.add(strike)

  hinge.add(leaf)

  // 打开约 95°：朝开门者另一侧（门外 / -Z），不朝人脸上甩
  const openAngle = Math.PI * 0.52

  root.userData.buildProp = 'door'
  root.userData.dualState = true
  root.userData.active = false
  root.userData.stateLabelIdle = '关闭'
  root.userData.stateLabelActive = '打开'
  /** 关闭时阻挡通行；打开后可进出（给后续碰撞用） */
  root.userData.blocksPassage = true
  root.userData.passageWidth = 1.05
  root.userData.passageHeight = 2.1
  root.userData.buildAnim = {
    kind: 'door',
    hinge,
    leaf,
    latch,
    openAngle,
    targetYaw: 0,
  }
  applyBuildPropState(root, false)
  return root
}

/**
 * 1 级火炉厨具：做饭 + 供暖。
 * 双态：idle 无火；active 炉火与暖光。
 */
export function createStoveLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'stove-lv1'

  const brick = std(0x7a5a48, { metalness: 0.05, roughness: 0.78 })
  const brickDark = std(0x5a4034, { metalness: 0.05, roughness: 0.82 })
  const iron = std(0x3a3e44, { metalness: 0.75, roughness: 0.4 })
  const ironBright = std(0x5a6068, { metalness: 0.7, roughness: 0.35 })
  const ashMat = std(0x2a2a2c, { metalness: 0.15, roughness: 0.85 })
  const fireMat = std(0xff6020, {
    metalness: 0.05,
    roughness: 0.55,
    emissive: 0xff4010,
    emit: 1.1,
  })

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 0.85), brick)
  body.position.y = 0.4
  root.add(body)

  const belt = new THREE.Mesh(new THREE.BoxGeometry(1.17, 0.08, 0.87), brickDark)
  belt.position.y = 0.55
  root.add(belt)

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 0.92), iron)
  top.position.y = 0.8
  root.add(top)

  for (const x of [-0.28, 0.28]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20), ironBright)
    ring.rotation.x = Math.PI / 2
    ring.position.set(x, 0.85, 0.05)
    root.add(ring)
    const grate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 12), iron)
    grate.position.set(x, 0.83, 0.05)
    root.add(grate)
  }

  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.06), iron)
  doorFrame.position.set(0, 0.35, 0.44)
  root.add(doorFrame)

  // 炉口：idle 看炭灰，active 换火光（两层叠放切换可见）
  const ash = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.04), ashMat)
  ash.position.set(0, 0.35, 0.48)
  root.add(ash)
  const fire = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.04), fireMat)
  fire.position.set(0, 0.35, 0.48)
  fire.visible = false
  root.add(fire)

  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.55, 10), brickDark)
  chimney.position.set(0.35, 1.15, -0.2)
  root.add(chimney)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 10), iron)
  cap.position.set(0.35, 1.42, -0.2)
  root.add(cap)

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.14, 12), ironBright)
  pot.position.set(-0.55, 0.95, 0.1)
  root.add(pot)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12, Math.PI), iron)
  handle.position.set(-0.55, 1.05, 0.1)
  handle.rotation.z = Math.PI
  root.add(handle)

  const glow = glowDisc(0xff7030, 1.35, 0.45)
  glow.position.set(0, 0.4, 0.55)
  glow.visible = false
  root.add(glow)

  const topGlow = glowDisc(0xff9040, 0.7, 0.3)
  topGlow.position.set(0, 0.9, 0.05)
  topGlow.visible = false
  root.add(topGlow)

  root.userData.buildProp = 'stove'
  root.userData.dualState = true
  root.userData.active = false
  root.userData.stateLabelIdle = '未点火'
  root.userData.stateLabelActive = '燃烧中'
  root.userData.buildAnim = { kind: 'stove', ash, fire, glow, topGlow }
  applyBuildPropState(root, false)
  return root
}

/**
 * 1 级台灯：三态关闭 / 暖光 / 亮光。
 * 点击循环切换；暖光偏橙、亮光偏白且更强。
 */
export function createLampLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'lamp-lv1'

  const wood = std(0x6a482c, { metalness: 0.06, roughness: 0.72 })
  const woodDark = std(0x4a321e, { metalness: 0.05, roughness: 0.78 })
  const metal = std(0x6a7078, { metalness: 0.78, roughness: 0.32 })
  const metalDark = std(0x3a4048, { metalness: 0.82, roughness: 0.38 })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 20), wood)
  base.position.y = 0.04
  root.add(base)
  const baseRim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 24), woodDark)
  baseRim.rotation.x = Math.PI / 2
  baseRim.position.y = 0.08
  root.add(baseRim)

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.72, 10), metal)
  stem.position.y = 0.44
  root.add(stem)
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), metalDark)
  knuckle.position.y = 0.8
  root.add(knuckle)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.18, 8), metal)
  neck.position.y = 0.9
  root.add(neck)

  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xe8dcc8,
    metalness: 0.05,
    roughness: 0.55,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    emissive: 0x000000,
    emissiveIntensity: 0,
  })
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.22, 0.32, 20, 1, true), shadeMat)
  shade.position.y = 1.08
  root.add(shade)

  const shadeTop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 20), metalDark)
  shadeTop.rotation.x = Math.PI / 2
  shadeTop.position.y = 1.24
  root.add(shadeTop)
  const shadeBot = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.016, 8, 20), metal)
  shadeBot.rotation.x = Math.PI / 2
  shadeBot.position.y = 0.92
  root.add(shadeBot)

  const bulbMat = std(0xd8d8d0, { metalness: 0.1, roughness: 0.35, emissive: 0x000000, emit: 0 })
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), bulbMat)
  bulb.position.y = 1.02
  root.add(bulb)

  const warmGlow = glowDisc(0xffa040, 1.1, 0.4)
  warmGlow.position.y = 1.05
  warmGlow.visible = false
  root.add(warmGlow)

  const brightGlow = glowDisc(0xfff2c8, 1.55, 0.5)
  brightGlow.position.y = 1.05
  brightGlow.visible = false
  root.add(brightGlow)

  const light = new THREE.PointLight(0xffb060, 0, 5, 2)
  light.position.y = 1.02
  root.add(light)

  root.userData.buildProp = 'lamp'
  root.userData.multiState = true
  root.userData.stateIndex = 0
  root.userData.stateCount = 3
  root.userData.stateLabels = ['关闭', '暖光灯', '亮光灯']
  root.userData.active = false
  root.userData.buildAnim = {
    kind: 'lamp',
    shade,
    bulb,
    warmGlow,
    brightGlow,
    light,
  }
  applyLampMode(root, 0)
  return root
}

/** 灯：0 关闭 / 1 暖光 / 2 亮光 */
export function applyLampMode(root: THREE.Object3D, mode: number) {
  const m = ((mode % 3) + 3) % 3
  root.userData.stateIndex = m
  root.userData.active = m > 0
  const a = root.userData.buildAnim as {
    kind?: string
    shade?: THREE.Mesh
    bulb?: THREE.Mesh
    warmGlow?: THREE.Sprite
    brightGlow?: THREE.Sprite
    light?: THREE.PointLight
  }
  if (a.kind !== 'lamp') return

  const shadeM = a.shade?.material as THREE.MeshStandardMaterial | undefined
  const bulbM = a.bulb?.material as THREE.MeshStandardMaterial | undefined

  if (m === 0) {
    if (shadeM) {
      shadeM.color.setHex(0xc8c0b0)
      shadeM.emissive.setHex(0x000000)
      shadeM.emissiveIntensity = 0
      shadeM.opacity = 0.82
    }
    if (bulbM) {
      bulbM.color.setHex(0xb0b0a8)
      bulbM.emissive.setHex(0x000000)
      bulbM.emissiveIntensity = 0
    }
    if (a.warmGlow) a.warmGlow.visible = false
    if (a.brightGlow) a.brightGlow.visible = false
    if (a.light) {
      a.light.intensity = 0
      a.light.color.setHex(0xffb060)
      a.light.distance = 5
    }
    return
  }

  if (m === 1) {
    if (shadeM) {
      shadeM.color.setHex(0xffe0b0)
      shadeM.emissive.setHex(0xff8020)
      shadeM.emissiveIntensity = 0.55
      shadeM.opacity = 0.92
    }
    if (bulbM) {
      bulbM.color.setHex(0xfff0d0)
      bulbM.emissive.setHex(0xff9030)
      bulbM.emissiveIntensity = 1.15
    }
    if (a.warmGlow) a.warmGlow.visible = true
    if (a.brightGlow) a.brightGlow.visible = false
    if (a.light) {
      a.light.color.setHex(0xffa040)
      a.light.intensity = 1.05
      a.light.distance = 4.5
    }
    return
  }

  // 亮光
  if (shadeM) {
    shadeM.color.setHex(0xfff8e8)
    shadeM.emissive.setHex(0xffe8a0)
    shadeM.emissiveIntensity = 0.85
    shadeM.opacity = 0.95
  }
  if (bulbM) {
    bulbM.color.setHex(0xffffff)
    bulbM.emissive.setHex(0xfff5d0)
    bulbM.emissiveIntensity = 1.6
  }
  if (a.warmGlow) a.warmGlow.visible = false
  if (a.brightGlow) a.brightGlow.visible = true
  if (a.light) {
    a.light.color.setHex(0xfff2d8)
    a.light.intensity = 1.85
    a.light.distance = 6.5
  }
}

/** 简易扳手（发明元素） */
function createWrench(): THREE.Group {
  const g = new THREE.Group()
  const metal = std(0x8a929a, { metalness: 0.85, roughness: 0.28, emissive: 0x202830, emit: 0.08 })
  const grip = std(0x3a4a58, { metalness: 0.4, roughness: 0.45 })

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.05), metal)
  shaft.position.y = 0.2
  g.add(shaft)

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 8), grip)
  handle.position.y = -0.05
  g.add(handle)

  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 8, 14, Math.PI * 1.3), metal)
  jaw.position.set(0, 0.52, 0)
  jaw.rotation.z = Math.PI / 2
  g.add(jaw)

  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), metal)
  tip.position.set(0.02, 0.58, 0)
  g.add(tip)

  return g
}

/** 制作中柔光特效（仅 active 可见） */
function createCraftFx(): THREE.Group {
  const fx = new THREE.Group()
  fx.name = 'craft-fx'

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  for (let y = 0; y < 256; y++) {
    const along = y / 255
    const fall = Math.pow(1 - along, 1.4)
    for (let x = 0; x < 64; x++) {
      const across = Math.abs(x - 32) / 32
      const edge = Math.pow(1 - across, 2.2)
      const a = fall * edge * 0.7
      if (a < 0.02) continue
      ctx.fillStyle = `rgba(120,220,255,${a})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  fx.userData.glowTex = tex

  for (let i = 0; i < 8; i++) {
    const geo = new THREE.PlaneGeometry(0.28, 1.1)
    geo.translate(0, 0.55, 0)
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const blade = new THREE.Mesh(geo, mat)
    const yaw = (i / 8) * Math.PI * 2
    blade.rotation.order = 'YXZ'
    blade.rotation.y = yaw
    blade.rotation.x = Math.PI / 2 - 0.15
    blade.position.y = 0.68
    fx.add(blade)
  }

  const halo = glowDisc(0x70e8ff, 1.35, 0.4)
  halo.position.y = 0.7
  fx.add(halo)

  const pillar = glowDisc(0xa0f0ff, 0.7, 0.35)
  pillar.position.y = 1.15
  pillar.scale.set(0.55, 1.8, 1)
  fx.add(pillar)

  fx.visible = false
  return fx
}

/**
 * 1 级制作台：科技风发明台。
 * 双态：idle 圆环内膛不发光；active 制作中特效光芒。
 */
export function createCraftBenchLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'craft-bench-lv1'

  const chassis = std(0x2a3844, { metalness: 0.55, roughness: 0.4, emissive: 0x102028, emit: 0.12 })
  const panel = std(0x3a5060, { metalness: 0.5, roughness: 0.38, emissive: 0x183040, emit: 0.1 })
  const accent = std(0x4ec8e0, { metalness: 0.4, roughness: 0.3, emissive: 0x2080a0, emit: 0.45 })
  const alloy = std(0x8a98a4, { metalness: 0.7, roughness: 0.32 })
  const hearthMat = std(0x2a4050, {
    metalness: 0.35,
    roughness: 0.55,
    emissive: 0x102030,
    emit: 0.05,
  })

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.55, 0.95), chassis)
  base.position.y = 0.3
  root.add(base)

  for (const [x, z] of [
    [-0.58, -0.35],
    [0.58, -0.35],
    [-0.58, 0.35],
    [0.58, 0.35],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), alloy)
    leg.position.set(x, 0.14, z)
    root.add(leg)
  }

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.0), panel)
  top.position.y = 0.6
  root.add(top)

  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.03, 1.02), accent)
  trim.position.y = 0.57
  root.add(trim)

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 10, 32), alloy)
  ring.rotation.x = Math.PI / 2
  ring.position.set(0, 0.68, 0)
  root.add(ring)

  const ringInner = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 28), accent)
  ringInner.rotation.x = Math.PI / 2
  ringInner.position.set(0, 0.685, 0)
  root.add(ringInner)

  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 - Math.PI / 2
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.22), alloy)
    claw.position.set(Math.cos(ang) * 0.2, 0.66, Math.sin(ang) * 0.2)
    claw.rotation.y = -ang
    root.add(claw)
  }

  const well = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.12, 20), chassis)
  well.position.set(0, 0.58, 0)
  root.add(well)

  const hearth = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16), hearthMat)
  hearth.position.set(0, 0.64, 0)
  root.add(hearth)

  const coreGlow = glowDisc(0x60e0ff, 0.95, 0.55)
  coreGlow.position.set(0, 0.72, 0)
  coreGlow.visible = false
  root.add(coreGlow)

  const fx = createCraftFx()
  root.add(fx)

  const console = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.08), panel)
  console.position.set(0.5, 0.78, 0.35)
  console.rotation.x = -0.35
  root.add(console)

  const leds: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      std(0x3a4a55, {
        metalness: 0.2,
        roughness: 0.4,
        emissive: 0x102028,
        emit: 0.1,
      })
    )
    led.position.set(0.42 + i * 0.08, 0.82, 0.38)
    root.add(led)
    leds.push(led)
  }

  const wrench = createWrench()
  wrench.position.set(-0.48, 0.72, 0.2)
  wrench.rotation.set(0.4, 0.6, -0.9)
  wrench.scale.setScalar(0.85)
  root.add(wrench)

  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10), alloy)
  gear.position.set(-0.45, 0.66, -0.25)
  gear.rotation.x = Math.PI / 2
  root.add(gear)

  const scroll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8),
    std(0xd8c8a0, { roughness: 0.7 })
  )
  scroll.rotation.z = Math.PI / 2
  scroll.position.set(0.35, 0.66, -0.3)
  root.add(scroll)

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.45, 6), accent)
  antenna.position.set(0.6, 0.9, -0.35)
  root.add(antenna)
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    std(0x3a6070, { emissive: 0x102028, emit: 0.15 })
  )
  tip.position.set(0.6, 1.12, -0.35)
  root.add(tip)

  root.userData.buildProp = 'craft'
  root.userData.dualState = true
  root.userData.active = false
  root.userData.stateLabelIdle = '待机'
  root.userData.stateLabelActive = '制作中'
  root.userData.buildAnim = {
    kind: 'craft',
    hearth,
    coreGlow,
    ringInner,
    tip,
    fx,
    leds,
  }
  applyBuildPropState(root, false)
  return root
}

/** 应用双态：idle / active */
export function applyBuildPropState(root: THREE.Object3D, active: boolean) {
  if (!root.userData.dualState) return
  root.userData.active = active
  const a = root.userData.buildAnim as {
    kind?: string
    ash?: THREE.Mesh
    fire?: THREE.Mesh
    glow?: THREE.Sprite
    topGlow?: THREE.Sprite
    hearth?: THREE.Mesh
    coreGlow?: THREE.Sprite
    ringInner?: THREE.Mesh
    tip?: THREE.Mesh
    fx?: THREE.Group
    leds?: THREE.Mesh[]
    hinge?: THREE.Group
    latch?: THREE.Mesh
    openAngle?: number
    targetYaw?: number
  }

  if (a.kind === 'door') {
    const openAng = a.openAngle ?? Math.PI * 0.52
    a.targetYaw = active ? openAng : 0
    // 关闭挡路；打开可通行（后续碰撞读这个）
    root.userData.blocksPassage = !active
    if (a.latch) {
      // 打开时门闩略收回
      a.latch.position.x = active ? 0.62 : 0.72
    }
    // 立即贴一点角度，避免首帧仍关死
    if (a.hinge && Math.abs(a.hinge.rotation.y - a.targetYaw) > 1.5) {
      a.hinge.rotation.y = a.targetYaw
    }
    return
  }

  if (a.kind === 'wireFence') {
    const anim = root.userData.buildAnim as {
      wires?: THREE.Mesh[]
      fx?: THREE.Group
      warn?: THREE.Mesh
    }
    if (anim.fx) anim.fx.visible = active
    anim.wires?.forEach((w) => {
      const m = w.material as THREE.MeshStandardMaterial
      if (active) {
        m.color.setHex(0xa0e8ff)
        m.emissive.setHex(0x40c0e0)
        m.emissiveIntensity = 0.55
      } else {
        m.color.setHex(0x7a8088)
        m.emissive.setHex(0x000000)
        m.emissiveIntensity = 0
      }
    })
    if (anim.warn) {
      const m = anim.warn.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = active ? 0.9 : 0.05
    }
    return
  }

  if (a.kind === 'pond') {
    const anim = root.userData.buildAnim as {
      fishGroup?: THREE.Group
      ripples?: THREE.Group
      water?: THREE.Mesh
      waterGlow?: THREE.Sprite
    }
    if (anim.fishGroup) anim.fishGroup.visible = active
    if (anim.ripples) anim.ripples.visible = active
    if (anim.water) {
      const m = anim.water.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = active ? 0.22 : 0.1
      m.opacity = active ? 0.62 : 0.5
    }
    if (anim.waterGlow) anim.waterGlow.material.opacity = active ? 0.32 : 0.18
    return
  }

  if (a.kind === 'stove') {
    if (a.ash) a.ash.visible = !active
    if (a.fire) a.fire.visible = active
    if (a.glow) a.glow.visible = active
    if (a.topGlow) a.topGlow.visible = active
    return
  }

  if (a.kind === 'craft') {
    if (a.fx) a.fx.visible = active
    if (a.coreGlow) a.coreGlow.visible = active
    if (a.hearth) {
      const m = a.hearth.material as THREE.MeshStandardMaterial
      if (active) {
        m.color.setHex(0x40c8ff)
        m.emissive.setHex(0x2080ff)
        m.emissiveIntensity = 0.85
      } else {
        m.color.setHex(0x2a4050)
        m.emissive.setHex(0x102030)
        m.emissiveIntensity = 0.05
      }
    }
    if (a.ringInner) {
      const m = a.ringInner.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = active ? 0.55 : 0.08
    }
    if (a.tip) {
      const m = a.tip.material as THREE.MeshStandardMaterial
      if (active) {
        m.color.setHex(0x60e0ff)
        m.emissive.setHex(0x40c0ff)
        m.emissiveIntensity = 0.8
      } else {
        m.color.setHex(0x3a6070)
        m.emissive.setHex(0x102028)
        m.emissiveIntensity = 0.15
      }
    }
    a.leds?.forEach((led, i) => {
      const m = led.material as THREE.MeshStandardMaterial
      if (active) {
        const on = i === 1 ? 0x40ff90 : 0x40c8ff
        const em = i === 1 ? 0x20ff70 : 0x2080ff
        m.color.setHex(on)
        m.emissive.setHex(em)
        m.emissiveIntensity = 0.9
      } else {
        m.color.setHex(0x3a4a55)
        m.emissive.setHex(0x102028)
        m.emissiveIntensity = 0.1
      }
    })
  }
}

export function toggleBuildPropActive(root: THREE.Object3D): boolean {
  if (root.userData.multiState) {
    const n = Number(root.userData.stateCount) || 3
    const next = (Number(root.userData.stateIndex) + 1) % n
    if (root.userData.buildProp === 'lamp') applyLampMode(root, next)
    else root.userData.stateIndex = next
    return true
  }
  if (!root.userData.dualState) return false
  const next = !root.userData.active
  applyBuildPropState(root, next)
  return next
}

/** 从点击到的物体向上找可切换状态的建造物 */
export function findDualStateProp(hit: THREE.Object3D): THREE.Object3D | null {
  let o: THREE.Object3D | null = hit
  while (o) {
    if (o.userData.dualState || o.userData.multiState) return o
    o = o.parent
  }
  return null
}

export function getBuildPropStateText(root: THREE.Object3D): string {
  if (root.userData.multiState) {
    const labels = root.userData.stateLabels as string[] | undefined
    const i = Number(root.userData.stateIndex) || 0
    return labels?.[i] || ''
  }
  if (!root.userData.dualState) return ''
  return root.userData.active
    ? String(root.userData.stateLabelActive || '使用中')
    : String(root.userData.stateLabelIdle || '未使用')
}

/** 1 级木栅栏：一段围栏（可拼） */
export function createFenceLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fence-lv1'

  const wood = std(0x6a4a2e, { metalness: 0.05, roughness: 0.78 })
  const woodDark = std(0x4a321e, { metalness: 0.04, roughness: 0.82 })

  // 两根立柱
  for (const x of [-0.85, 0.85]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), woodDark)
    post.position.set(x, 0.58, 0)
    root.add(post)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), wood)
    cap.position.set(x, 1.18, 0)
    root.add(cap)
  }

  // 横栏
  for (const y of [0.35, 0.7, 1.0]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.06), wood)
    rail.position.set(0, y, 0)
    root.add(rail)
  }

  // 斜撑（稳固感）
  const brace = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.04), woodDark)
  brace.position.set(0, 0.55, 0.02)
  brace.rotation.z = 0.22
  root.add(brace)

  root.userData.buildProp = 'fence'
  root.userData.blocksPassage = true
  return root
}

/** 1 级通电铁丝网：防御；双态断电 / 通电 */
export function createWireFenceLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'wire-fence-lv1'

  const steel = std(0x5a6068, { metalness: 0.85, roughness: 0.32 })
  const steelDark = std(0x3a3e44, { metalness: 0.8, roughness: 0.4 })
  const insulator = std(0x2a8a4a, { metalness: 0.1, roughness: 0.55 })

  // 金属立柱
  for (const x of [-0.9, 0.9]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.35, 8), steelDark)
    post.position.set(x, 0.68, 0)
    root.add(post)
    // 斜撑脚
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.08), steel)
    foot.position.set(x, 0.04, 0.12)
    foot.rotation.y = x > 0 ? -0.3 : 0.3
    root.add(foot)
  }

  // 绝缘子 + 铁丝
  const wires: THREE.Mesh[] = []
  const wireYs = [0.35, 0.6, 0.85, 1.1]
  for (const y of wireYs) {
    for (const x of [-0.9, 0.9]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), insulator)
      ins.rotation.z = Math.PI / 2
      ins.position.set(x, y, 0.06)
      root.add(ins)
    }
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1.78, 6),
      std(0x7a8088, { metalness: 0.9, roughness: 0.25 })
    )
    wire.rotation.z = Math.PI / 2
    wire.position.set(0, y, 0.06)
    root.add(wire)
    wires.push(wire)
  }

  // 菱形网面暗示（细斜线）
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.01, 0.01),
      std(0x6a7078, { metalness: 0.85, roughness: 0.3 })
    )
    mesh.position.set(0, 0.4 + i * 0.15, 0.02)
    mesh.rotation.z = i % 2 === 0 ? 0.35 : -0.35
    root.add(mesh)
  }

  // 通电特效层
  const fx = new THREE.Group()
  fx.name = 'wire-fx'
  const sparkMats: THREE.MeshBasicMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0x80f0ff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
    spark.userData.phase = Math.random() * Math.PI * 2
    spark.position.set((Math.random() - 0.5) * 1.5, 0.4 + Math.random() * 0.7, 0.08)
    fx.add(spark)
    sparkMats.push(spark.material as THREE.MeshBasicMaterial)
  }
  const aura = glowDisc(0x60e8ff, 2.2, 0.28)
  aura.position.set(0, 0.7, 0.15)
  fx.add(aura)
  // 警示灯
  const warn = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    std(0xff4030, { emissive: 0xff2010, emit: 0.9 })
  )
  warn.position.set(0.9, 1.4, 0)
  fx.add(warn)
  root.add(fx)

  root.userData.buildProp = 'wireFence'
  root.userData.dualState = true
  root.userData.active = false
  root.userData.stateLabelIdle = '断电'
  root.userData.stateLabelActive = '通电'
  root.userData.blocksPassage = true
  root.userData.buildAnim = { kind: 'wireFence', wires, fx, aura, warn }
  applyBuildPropState(root, false)
  return root
}

/** 1 级鹅卵石：每 1×1 方块内 2～3 颗不重叠的微凸圆卵石 */
export function createCobbleFloorLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'cobble-floor-lv1'

  const grass = std(0x5a9a48, { metalness: 0.02, roughness: 0.88 })
  // 展示约 3×3 格草坪
  const lawn = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.04, 3.05), grass)
  lawn.position.y = 0.02
  root.add(lawn)

  const stoneColors = [0x9a968c, 0x8a8680, 0x7a7872, 0xa8a298, 0x6e6c66]

  /** 在单格内放 2～3 颗不重叠卵石 */
  const placeCell = (cx: number, cz: number, seed: number) => {
    const count = 2 + (seed % 2) // 2 或 3
    // 候选落点（格内偏置，避开边界）
    const slots: [number, number][] = [
      [-0.28, -0.25],
      [0.26, -0.22],
      [-0.22, 0.28],
      [0.24, 0.26],
      [0.02, 0.02],
      [-0.08, -0.32],
      [0.32, 0.08],
    ]
    // 按种子打乱取前 count 个，并保证圆心距离够开
    const order = slots
      .map((s, i) => ({ s, k: (seed * 17 + i * 31) % 97 }))
      .sort((a, b) => a.k - b.k)

    const placed: { x: number; z: number; r: number }[] = []
    for (const { s } of order) {
      if (placed.length >= count) break
      const r = 0.14 + ((seed + placed.length * 11) % 5) * 0.012
      const x = cx + s[0]
      const z = cz + s[1]
      const ok = placed.every((p) => Math.hypot(p.x - x, p.z - z) >= p.r + r + 0.04)
      if (!ok) continue
      placed.push({ x, z, r })

      const mat = std(stoneColors[(seed + placed.length) % stoneColors.length], {
        metalness: 0.06,
        roughness: 0.68,
      })
      const stone = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat)
      // 压扁成微凸圆块
      const sy = 0.32 + ((seed + placed.length) % 3) * 0.03
      stone.scale.set(1.05, sy, 0.95 + ((seed * 3) % 4) * 0.03)
      stone.position.set(x, 0.035 + r * sy * 0.4, z)
      stone.rotation.y = ((seed + placed.length) * 0.8) % Math.PI
      root.add(stone)
    }
  }

  let cell = 0
  for (let gz = -1; gz <= 1; gz++) {
    for (let gx = -1; gx <= 1; gx++) {
      placeCell(gx, gz, cell * 13 + 7)
      cell++
    }
  }

  root.userData.buildProp = 'cobble'
  return root
}

/** 1 级小池塘：养鱼；双态空塘 / 养鱼中 */
export function createPondLv1(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'pond-lv1'

  const mud = std(0x5a4838, { metalness: 0.05, roughness: 0.85 })
  const stone = std(0x7a7870, { metalness: 0.1, roughness: 0.7 })
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x3a8aaa,
    metalness: 0.15,
    roughness: 0.15,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    emissive: 0x104060,
    emissiveIntensity: 0.12,
  })

  // 坑底
  const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.95, 0.22, 24), mud)
  bed.position.y = 0.05
  root.add(bed)

  // 水面
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 24), waterMat)
  water.position.y = 0.18
  water.renderOrder = 2
  root.add(water)

  // 一圈鹅卵石岸
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2
    const r = 1.12 + (i % 3) * 0.04
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 + (i % 4) * 0.02, 8, 6),
      stone
    )
    s.scale.set(1.2, 0.55, 1)
    s.position.set(Math.cos(ang) * r, 0.08, Math.sin(ang) * r)
    root.add(s)
  }

  // 水面柔光
  const waterGlow = glowDisc(0x50b0c8, 2.0, 0.22)
  waterGlow.position.y = 0.22
  root.add(waterGlow)

  // 鱼（养鱼中才显示）
  const fishGroup = new THREE.Group()
  fishGroup.name = 'fish'
  const fishColors = [0xe07040, 0xd0a030, 0x5080c0]
  for (let i = 0; i < 3; i++) {
    const fish = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      std(fishColors[i], { metalness: 0.2, roughness: 0.4, emissive: fishColors[i], emit: 0.15 })
    )
    body.scale.set(1.6, 0.7, 0.9)
    fish.add(body)
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.08, 4),
      std(fishColors[i], { roughness: 0.45 })
    )
    tail.rotation.z = Math.PI / 2
    tail.position.x = -0.1
    fish.add(tail)
    fish.userData.phase = (i / 3) * Math.PI * 2
    fish.userData.radius = 0.35 + i * 0.12
    fish.position.y = 0.14
    fishGroup.add(fish)
  }
  fishGroup.visible = false
  root.add(fishGroup)

  // 涟漪环（养鱼时淡淡出现）
  const ripples = new THREE.Group()
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.35 + i * 0.2, 0.012, 6, 24),
      new THREE.MeshBasicMaterial({
        color: 0xa0d8e8,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.2
    ripples.add(ring)
  }
  ripples.visible = false
  root.add(ripples)

  root.userData.buildProp = 'pond'
  root.userData.dualState = true
  root.userData.active = false
  root.userData.stateLabelIdle = '空塘'
  root.userData.stateLabelActive = '养鱼中'
  root.userData.buildAnim = { kind: 'pond', water, waterGlow, fishGroup, ripples }
  applyBuildPropState(root, false)
  return root
}

/** 室外院子：栅栏 / 铁丝网 / 鹅卵石 / 池塘 */
export function createYardPropsShowcase(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'yard-props-showcase'

  const grass = std(0x5a8a48, { metalness: 0.02, roughness: 0.9 })
  const dirt = std(0x6a5a40, { roughness: 0.92 })

  const ground = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.08, 40), grass)
  ground.position.y = -0.04
  root.add(ground)

  // 小径
  const path = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 4.5), dirt)
  path.position.set(0, 0.01, 0.2)
  root.add(path)

  const cobble = createCobbleFloorLv1()
  cobble.position.set(0, 0, -0.2)
  root.add(cobble)

  const fence = createFenceLv1()
  fence.position.set(-2.6, 0, 1.2)
  fence.rotation.y = Math.PI * 0.15
  root.add(fence)

  const fence2 = createFenceLv1()
  fence2.position.set(-2.4, 0, -0.6)
  fence2.rotation.y = -Math.PI * 0.08
  root.add(fence2)

  const wire = createWireFenceLv1()
  wire.position.set(2.5, 0, 0.4)
  wire.rotation.y = -Math.PI * 0.12
  root.add(wire)

  const pond = createPondLv1()
  pond.position.set(1.6, 0, -2.2)
  root.add(pond)

  root.userData.isBuildProps = true
  root.userData.yardShowcase = true
  return root
}

/** 同一室内空间：墙面挂窗、门、火炉、制作台 */
export function createBuildPropsShowcase(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'build-props-showcase'

  const floorMat = std(0x6a7a6a, { metalness: 0.05, roughness: 0.85 })
  const wallMat = std(0xc8bca8, { metalness: 0.02, roughness: 0.9 })
  const plank = std(0x8a7050, { metalness: 0.05, roughness: 0.8 })

  // 地面
  const floor = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 5.2), floorMat)
  floor.position.y = -0.04
  root.add(floor)

  // 后墙：窗洞 + 门洞，打开门后可看出去
  const wallZ = -2.4
  const wallH = 2.6
  const wallY = 1.25
  const winCx = -2.1
  const winHalfW = 0.58
  const winY0 = 0.42
  const winY1 = 1.72
  const doorCx = 1.8
  const doorHalfW = 0.64
  const doorY1 = 2.22
  const totalW = 7.5
  const leftEdge = -totalW * 0.5
  const rightEdge = totalW * 0.5

  const addWall = (x0: number, x1: number, y0: number, y1: number) => {
    const w = x1 - x0
    const h = y1 - y0
    if (w < 0.04 || h < 0.04) return
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), wallMat)
    m.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, wallZ)
    root.add(m)
  }

  // 窗左
  addWall(leftEdge, winCx - winHalfW, 0, wallH)
  // 窗上 / 窗下
  addWall(winCx - winHalfW, winCx + winHalfW, winY1, wallH)
  addWall(winCx - winHalfW, winCx + winHalfW, 0, winY0)
  // 窗与门之间
  addWall(winCx + winHalfW, doorCx - doorHalfW, 0, wallH)
  // 门上
  addWall(doorCx - doorHalfW, doorCx + doorHalfW, doorY1, wallH)
  // 门右
  addWall(doorCx + doorHalfW, rightEdge, 0, wallH)

  // 左墙一段
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 3.2), wallMat)
  leftWall.position.set(-3.7, 1.25, -0.9)
  root.add(leftWall)

  // 踢脚线（门洞处断开）
  const baseL = new THREE.Mesh(
    new THREE.BoxGeometry(doorCx - doorHalfW - leftEdge, 0.1, 0.08),
    plank
  )
  baseL.position.set((leftEdge + doorCx - doorHalfW) * 0.5, 0.05, -2.33)
  root.add(baseL)
  const baseR = new THREE.Mesh(
    new THREE.BoxGeometry(rightEdge - (doorCx + doorHalfW), 0.1, 0.08),
    plank
  )
  baseR.position.set((doorCx + doorHalfW + rightEdge) * 0.5, 0.05, -2.33)
  root.add(baseR)

  // —— 布置 ——
  const win = createWindowLv1()
  win.position.set(winCx, 0.35, -2.33)
  root.add(win)

  const door = createDoorLv1()
  door.position.set(doorCx, 0, -2.28)
  root.add(door)

  const stove = createStoveLv1()
  stove.position.set(-2.4, 0, 0.35)
  stove.rotation.y = Math.PI * 0.15
  root.add(stove)

  const craft = createCraftBenchLv1()
  craft.position.set(1.1, 0, 0.55)
  craft.rotation.y = -Math.PI * 0.2
  root.add(craft)

  // 小标签台座（视觉分区）
  const padMat = std(0x4a5a50, { roughness: 0.7 })
  for (const x of [-2.4, 1.1]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.04, 24), padMat)
    pad.position.set(x, 0.01, 0.45)
    root.add(pad)
  }

  root.userData.isBuildProps = true
  root.userData.buildShowcase = true
  return root
}

export function tickBuildProps(root: THREE.Object3D, dt: number) {
  const t = (root.userData._buildT = (root.userData._buildT || 0) + dt)

  root.traverse((o) => {
    if (!o.userData.dualState && !o.userData.multiState) return
    const a = o.userData.buildAnim as
      | {
          kind?: string
          fire?: THREE.Mesh
          glow?: THREE.Sprite
          topGlow?: THREE.Sprite
          warmGlow?: THREE.Sprite
          brightGlow?: THREE.Sprite
          light?: THREE.PointLight
          bulb?: THREE.Mesh
          shade?: THREE.Mesh
          hearth?: THREE.Mesh
          coreGlow?: THREE.Sprite
          ringInner?: THREE.Mesh
          tip?: THREE.Mesh
          fx?: THREE.Group
          hinge?: THREE.Group
          latch?: THREE.Mesh
          targetYaw?: number
        }
      | undefined
    if (!a) return

    if (a.kind === 'lamp' && o.userData.active) {
      const mode = Number(o.userData.stateIndex) || 0
      const pulse = 0.5 + 0.5 * Math.sin(t * (mode === 1 ? 2.2 : 3.4))
      if (mode === 1 && a.warmGlow) {
        a.warmGlow.material.opacity = 0.32 + 0.12 * pulse
      }
      if (mode === 2 && a.brightGlow) {
        a.brightGlow.material.opacity = 0.4 + 0.14 * pulse
      }
      if (a.bulb) {
        const bm = a.bulb.material as THREE.MeshStandardMaterial
        bm.emissiveIntensity = (mode === 1 ? 1.05 : 1.45) + 0.2 * pulse
      }
      if (a.light) {
        a.light.intensity = (mode === 1 ? 0.95 : 1.7) + 0.15 * pulse
      }
      return
    }

    // 门：始终朝目标角度缓动（开/关都要动）
    if (a.kind === 'door' && a.hinge) {
      const target = a.targetYaw ?? 0
      const cur = a.hinge.rotation.y
      const k = Math.min(1, dt * 6)
      a.hinge.rotation.y = cur + (target - cur) * k
      if (a.latch) {
        const latchX = o.userData.active ? 0.62 : 0.72
        a.latch.position.x += (latchX - a.latch.position.x) * k
      }
      return
    }

    if (!o.userData.active) return

    if (a.kind === 'wireFence') {
      const anim = a as {
        fx?: THREE.Group
        warn?: THREE.Mesh
        wires?: THREE.Mesh[]
      }
      anim.wires?.forEach((w) => {
        const m = w.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.4 + 0.35 * Math.sin(t * 8 + w.position.y * 4)
      })
      if (anim.warn) {
        const m = anim.warn.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.5 + 0.5 * Math.sin(t * 6)
      }
      anim.fx?.children.forEach((c) => {
        const mesh = c as THREE.Mesh
        if (!mesh.isMesh || !mesh.userData.phase) return
        const ph = mesh.userData.phase as number
        mesh.position.x = Math.sin(t * 3 + ph) * 0.7
        mesh.position.y = 0.4 + ((Math.sin(t * 5 + ph * 2) + 1) * 0.5) * 0.7
        mesh.scale.setScalar(0.5 + 0.8 * Math.abs(Math.sin(t * 10 + ph)))
        const m = mesh.material as THREE.MeshBasicMaterial
        m.opacity = 0.4 + 0.5 * Math.abs(Math.sin(t * 9 + ph))
      })
      return
    }

    if (a.kind === 'pond') {
      const anim = a as { fishGroup?: THREE.Group; ripples?: THREE.Group; waterGlow?: THREE.Sprite }
      anim.fishGroup?.children.forEach((fish) => {
        const ph = fish.userData.phase as number
        const rad = fish.userData.radius as number
        const ang = t * (0.55 + ph * 0.1) + ph
        fish.position.x = Math.cos(ang) * rad
        fish.position.z = Math.sin(ang) * rad
        fish.position.y = 0.13 + Math.sin(t * 2.5 + ph) * 0.02
        fish.rotation.y = -ang + Math.PI / 2
      })
      anim.ripples?.children.forEach((ring, i) => {
        const m = (ring as THREE.Mesh).material as THREE.MeshBasicMaterial
        const pulse = (Math.sin(t * 1.8 + i) + 1) * 0.5
        m.opacity = 0.12 + pulse * 0.2
        ring.scale.setScalar(0.85 + pulse * 0.35)
      })
      if (anim.waterGlow) {
        anim.waterGlow.material.opacity = 0.22 + 0.12 * Math.sin(t * 1.5)
      }
      return
    }

    if (a.kind === 'stove') {
      if (a.fire) {
        const m = a.fire.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.85 + 0.35 * Math.sin(t * 5.5)
        a.fire.scale.y = 0.9 + 0.12 * Math.sin(t * 7)
      }
      if (a.glow) a.glow.material.opacity = 0.35 + 0.15 * Math.sin(t * 3.2)
      if (a.topGlow) a.topGlow.material.opacity = 0.22 + 0.1 * Math.sin(t * 2.4)
      return
    }

    if (a.kind === 'craft') {
      if (a.hearth) {
        const hm = a.hearth.material as THREE.MeshStandardMaterial
        hm.emissiveIntensity = 0.65 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.8))
      }
      if (a.coreGlow) {
        a.coreGlow.material.opacity = 0.35 + 0.3 * Math.sin(t * 2.8)
        const s = 0.85 + 0.2 * Math.sin(t * 2.2)
        a.coreGlow.scale.set(s, s, 1)
      }
      if (a.ringInner) {
        a.ringInner.rotation.z = t * 0.8
        const rm = a.ringInner.material as THREE.MeshStandardMaterial
        rm.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 2.5)
      }
      if (a.tip) {
        const tm = a.tip.material as THREE.MeshStandardMaterial
        tm.emissiveIntensity = 0.5 + 0.4 * Math.sin(t * 3.5)
      }
      if (a.fx) {
        a.fx.rotation.y = t * 0.55
        a.fx.children.forEach((child, i) => {
          const mesh = child as THREE.Mesh
          if (mesh.isMesh && mesh.material) {
            const m = mesh.material as THREE.MeshBasicMaterial
            if (m.opacity != null && m.map) {
              m.opacity = 0.22 + 0.18 * Math.sin(t * 2.4 + i * 0.5)
            }
          }
          const sp = child as THREE.Sprite
          if (sp.isSprite) {
            sp.material.opacity = 0.3 + 0.2 * Math.sin(t * 2.6 + i)
          }
        })
      }
    }
  })
}

export function disposeBuildPropsExtras(root: THREE.Object3D) {
  root.traverse((o) => {
    const s = o as THREE.Sprite
    if (s.isSprite && s.userData.glowTex) {
      ;(s.userData.glowTex as THREE.Texture).dispose()
    }
    if (o.userData.glowTex) {
      ;(o.userData.glowTex as THREE.Texture).dispose()
    }
  })
}
