import * as THREE from 'three'

/** 宝箱等级：字面稀有度由高到低 */
export type ChestTier = 'legendary' | 'supreme' | 'exquisite' | 'fine' | 'common'

export const CHEST_TIER_LABEL: Record<ChestTier, string> = {
  legendary: '传奇宝箱',
  supreme: '至尊宝箱',
  exquisite: '极品宝箱',
  fine: '精品宝箱',
  common: '普通宝箱',
}

export const CHEST_TIER_HINT: Record<ChestTier, string> = {
  legendary: '赤金朱砂 · 烈焰晶 · 柔光漫射',
  supreme: '紫檀鎏金 · 紫晶 · 华贵柔辉',
  exquisite: '青碧珐琅 · 海晶 · 冷调柔光',
  fine: '暖栗铜饰 · 碧玉 · 淡金辉',
  common: '暗褐铁箍 · 灰琥珀 · 微尘光',
}

interface ChestPalette {
  body: number
  bodyDark: number
  bodyAccent: number
  trim: number
  trimBright: number
  lock: number
  /** 本档特色宝石主色 */
  gem: number
  gemAlt: number
  inner: number
  ray: number
  aura: number
  metalness: number
  roughness: number
  bodyEmissive: number
  bodyEmit: number
  scale: number
  lidOpen: number
  rayCount: number
  rayLen: number
  rayOpacity: number
  sparkCount: number
  /** 盖顶镶嵌数量（规律排列） */
  lidGemCount: number
  hasPillar: boolean
  hasHalo: boolean
  hasRunes: boolean
}

/**
 * 箱体：低阶偏暗沉 → 高阶饱和艳丽。
 * 宝石：每档专属色相。
 */
const PALETTES: Record<ChestTier, ChestPalette> = {
  common: {
    body: 0x3a2a1c,
    bodyDark: 0x241810,
    bodyAccent: 0x4a3828,
    trim: 0x4a4a4a,
    trimBright: 0x6e6e6e,
    lock: 0x5a5a5a,
    gem: 0x8a7a55,
    gemAlt: 0x6a5a40,
    inner: 0xa88850,
    ray: 0xc4a878,
    aura: 0xb09870,
    metalness: 0.12,
    roughness: 0.82,
    bodyEmissive: 0x000000,
    bodyEmit: 0,
    scale: 0.92,
    lidOpen: 0.1,
    rayCount: 10,
    rayLen: 1.55,
    rayOpacity: 0.07,
    sparkCount: 3,
    lidGemCount: 3,
    hasPillar: false,
    hasHalo: false,
    hasRunes: false,
  },
  fine: {
    body: 0x6e3d1e,
    bodyDark: 0x4a2812,
    bodyAccent: 0x8a5230,
    trim: 0xc49a3a,
    trimBright: 0xe8c868,
    lock: 0xd4a848,
    gem: 0x2ec87a,
    gemAlt: 0x1a9a58,
    inner: 0xffc860,
    ray: 0xf0d090,
    aura: 0x70d0a0,
    metalness: 0.32,
    roughness: 0.52,
    bodyEmissive: 0x3a1808,
    bodyEmit: 0.08,
    scale: 0.98,
    lidOpen: 0.18,
    rayCount: 12,
    rayLen: 1.85,
    rayOpacity: 0.09,
    sparkCount: 6,
    lidGemCount: 5,
    hasPillar: false,
    hasHalo: false,
    hasRunes: false,
  },
  exquisite: {
    body: 0x1a5a68,
    bodyDark: 0x0e3844,
    bodyAccent: 0x2a8898,
    trim: 0xb8d0e0,
    trimBright: 0xe8f4ff,
    lock: 0xc8e0f0,
    gem: 0x30f0ff,
    gemAlt: 0x18b8e0,
    inner: 0x70f8ff,
    ray: 0xb0f0ff,
    aura: 0x50e0ff,
    metalness: 0.48,
    roughness: 0.36,
    bodyEmissive: 0x0a3040,
    bodyEmit: 0.22,
    scale: 1.05,
    lidOpen: 0.26,
    rayCount: 14,
    rayLen: 2.15,
    rayOpacity: 0.11,
    sparkCount: 10,
    lidGemCount: 5,
    hasPillar: false,
    hasHalo: true,
    hasRunes: false,
  },
  supreme: {
    body: 0x5a1a78,
    bodyDark: 0x320e4a,
    bodyAccent: 0x7a30a0,
    trim: 0xf0c028,
    trimBright: 0xffe888,
    lock: 0xffd050,
    gem: 0xd060ff,
    gemAlt: 0x9030e0,
    inner: 0xffc070,
    ray: 0xffe0a0,
    aura: 0xc070ff,
    metalness: 0.55,
    roughness: 0.3,
    bodyEmissive: 0x2a0840,
    bodyEmit: 0.32,
    scale: 1.12,
    lidOpen: 0.34,
    rayCount: 16,
    rayLen: 2.4,
    rayOpacity: 0.13,
    sparkCount: 14,
    lidGemCount: 7,
    hasPillar: false,
    hasHalo: true,
    hasRunes: true,
  },
  legendary: {
    body: 0xa82018,
    bodyDark: 0x6a100c,
    bodyAccent: 0xe04028,
    trim: 0xffd040,
    trimBright: 0xfff0a8,
    lock: 0xffe060,
    gem: 0xff2858,
    gemAlt: 0xff8040,
    inner: 0xff9040,
    ray: 0xffe8b0,
    aura: 0xff6070,
    metalness: 0.62,
    roughness: 0.26,
    bodyEmissive: 0x501008,
    bodyEmit: 0.42,
    scale: 1.2,
    lidOpen: 0.4,
    rayCount: 18,
    rayLen: 2.75,
    rayOpacity: 0.15,
    sparkCount: 18,
    lidGemCount: 9,
    hasPillar: true,
    hasHalo: true,
    hasRunes: true,
  },
}

function mat(
  color: number,
  opts: { metalness?: number; roughness?: number; emissive?: number; emissiveIntensity?: number } = {}
) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.3,
    roughness: opts.roughness ?? 0.5,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  })
}

function glowSprite(hex: number, size: number, opacity = 0.75) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64)
  const c = new THREE.Color(hex)
  const r = (c.r * 255) | 0
  const gch = (c.g * 255) | 0
  const b = (c.b * 255) | 0
  g.addColorStop(0, `rgba(${r},${gch},${b},0.9)`)
  g.addColorStop(0.4, `rgba(${r},${gch},${b},0.28)`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
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

/** 柔光射线贴图：沿长度与宽度双侧渐隐，避免硬边“立体光刃” */
function makeSoftRayTexture(hex: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 64, 256)
  const c = new THREE.Color(hex)
  const r = (c.r * 255) | 0
  const g = (c.g * 255) | 0
  const b = (c.b * 255) | 0

  for (let y = 0; y < 256; y++) {
    const along = y / 255
    // 根部稍亮，远端几乎消失；中段连续
    const fall = Math.pow(1 - along, 1.35)
    for (let x = 0; x < 64; x++) {
      const across = Math.abs(x - 32) / 32
      const edge = Math.pow(1 - across, 2.4)
      const a = fall * edge
      if (a < 0.01) continue
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  tex.premultiplyAlpha = true
  return tex
}

/** 淡、连续、扁平的柔光带（非实体光刃） */
function makeSoftRay(tex: THREE.Texture, len: number, width: number, opacity: number) {
  const geo = new THREE.PlaneGeometry(width, len, 1, 1)
  geo.translate(0, len * 0.5, 0)
  const m = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  })
  const mesh = new THREE.Mesh(geo, m)
  mesh.renderOrder = 2
  mesh.userData.softRay = true
  return mesh
}

function makeHaloRing(hex: number, rInner: number, rOuter: number, opacity = 0.22) {
  const geo = new THREE.RingGeometry(rInner, rOuter, 64)
  const m = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, m)
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

function makeSoftPillar(hex: number) {
  // 用竖向渐隐精灵代替硬圆柱，更像光柱
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const c = new THREE.Color(hex)
  const r = (c.r * 255) | 0
  const g = (c.g * 255) | 0
  const b = (c.b * 255) | 0
  for (let y = 0; y < 256; y++) {
    const along = y / 255
    const fall = Math.sin(along * Math.PI) * (1 - along * 0.35)
    for (let x = 0; x < 64; x++) {
      const across = Math.abs(x - 32) / 32
      const edge = Math.pow(1 - across, 2.2)
      const a = fall * edge * 0.55
      if (a < 0.01) continue
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.55,
    })
  )
  sprite.scale.set(1.1, 3.4, 1)
  sprite.position.y = 2.0
  sprite.userData.glowTex = tex
  return sprite
}

function makeRunePlate(hex: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 64, 64)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.5
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.moveTo(32, 10)
  ctx.lineTo(50, 48)
  ctx.lineTo(14, 48)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(32, 34, 7, 0, Math.PI * 2)
  ctx.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: hex,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const s = new THREE.Sprite(mat)
  s.scale.set(0.26, 0.26, 1)
  s.userData.glowTex = tex
  return s
}

/** 本档特色宝石几何 */
function makeTierGemGeo(tier: ChestTier, size: number): THREE.BufferGeometry {
  switch (tier) {
    case 'common':
      // 圆润灰琥珀
      return new THREE.SphereGeometry(size * 0.9, 10, 8)
    case 'fine':
      // 椭圆碧玉感
      return new THREE.SphereGeometry(size, 12, 10)
    case 'exquisite':
      // 海晶八面
      return new THREE.OctahedronGeometry(size, 0)
    case 'supreme':
      // 紫晶切面
      return new THREE.IcosahedronGeometry(size, 0)
    case 'legendary':
      // 烈焰尖晶
      return new THREE.OctahedronGeometry(size * 1.05, 0)
    default:
      return new THREE.SphereGeometry(size, 10, 8)
  }
}

/**
 * 盖顶规律镶嵌：数量与排列随品阶变化。
 */
function placeLidGems(
  lidPivot: THREE.Group,
  tier: ChestTier,
  count: number,
  gemMat: THREE.Material,
  gemAltMat: THREE.Material
) {
  const gems: THREE.Mesh[] = []
  const y = 0.28
  const z = 0.36

  if (count === 3) {
    // 普通：一横排三颗
    ;[-0.28, 0, 0.28].forEach((x, i) => {
      const geo = makeTierGemGeo(tier, 0.055)
      const m = new THREE.Mesh(geo, i === 1 ? gemMat : gemAltMat)
      m.position.set(x, y, z)
      m.scale.set(1, 0.72, 1)
      lidPivot.add(m)
      gems.push(m)
    })
  } else if (count === 5) {
    // 精品 / 极品：中心一颗 + 两侧对称
    const xs = [-0.38, -0.19, 0, 0.19, 0.38]
    xs.forEach((x, i) => {
      const sz = i === 2 ? 0.07 : 0.05
      const geo = makeTierGemGeo(tier, sz)
      const m = new THREE.Mesh(geo, i === 2 ? gemMat : gemAltMat)
      m.position.set(x, y + (i === 2 ? 0.02 : 0), z)
      if (tier === 'fine') m.scale.set(1.15, 0.65, 0.9)
      if (tier === 'exquisite') {
        m.rotation.y = Math.PI / 4
        m.rotation.z = i % 2 === 0 ? 0.15 : -0.15
      }
      lidPivot.add(m)
      gems.push(m)
    })
  } else if (count === 7) {
    // 至尊：弧形七颗
    for (let i = 0; i < 7; i++) {
      const t = i / 6
      const x = (t - 0.5) * 0.92
      const zz = z - Math.sin(t * Math.PI) * 0.1
      const sz = i === 3 ? 0.075 : 0.048
      const geo = makeTierGemGeo(tier, sz)
      const m = new THREE.Mesh(geo, i === 3 || i % 2 === 0 ? gemMat : gemAltMat)
      m.position.set(x, y + (i === 3 ? 0.03 : 0.01), zz)
      m.rotation.y = (i - 3) * 0.12
      lidPivot.add(m)
      gems.push(m)
    }
  } else {
    // 传奇：3×3 菱形阵，中心最大
    const coords: [number, number, number][] = [
      [0, 0.04, 0],
      [-0.22, 0.01, 0.12],
      [0.22, 0.01, 0.12],
      [-0.22, 0.01, -0.12],
      [0.22, 0.01, -0.12],
      [-0.4, 0, 0],
      [0.4, 0, 0],
      [0, 0, 0.22],
      [0, 0, -0.2],
    ]
    coords.forEach(([ox, oy, oz], i) => {
      const sz = i === 0 ? 0.085 : 0.048
      const geo = makeTierGemGeo(tier, sz)
      const m = new THREE.Mesh(geo, i === 0 || i < 5 ? gemMat : gemAltMat)
      m.position.set(ox, y + oy, z + oz)
      m.rotation.y = Math.PI / 5
      if (i === 0) m.rotation.z = Math.PI / 4
      lidPivot.add(m)
      gems.push(m)
    })
  }
  return gems
}

/**
 * 构建一只可动画的宝箱（根节点带 userData.chestAnim）。
 */
export function createTreasureChest(tier: ChestTier): THREE.Group {
  const p = PALETTES[tier]
  const root = new THREE.Group()
  root.name = `chest-${tier}`

  const bodyMat = mat(p.body, {
    metalness: p.metalness * 0.35,
    roughness: p.roughness,
    emissive: p.bodyEmissive,
    emissiveIntensity: p.bodyEmit,
  })
  const darkMat = mat(p.bodyDark, {
    metalness: p.metalness * 0.3,
    roughness: p.roughness + 0.05,
    emissive: p.bodyEmissive,
    emissiveIntensity: p.bodyEmit * 0.6,
  })
  const accentMat = mat(p.bodyAccent, {
    metalness: p.metalness * 0.4,
    roughness: p.roughness - 0.05,
    emissive: p.bodyEmissive,
    emissiveIntensity: p.bodyEmit * 0.8,
  })
  const trimMat = mat(p.trim, {
    metalness: Math.min(0.95, p.metalness + 0.25),
    roughness: Math.max(0.18, p.roughness - 0.2),
    emissive: p.trimBright,
    emissiveIntensity: tier === 'common' ? 0.04 : 0.2,
  })
  const brightMat = mat(p.trimBright, {
    metalness: 0.85,
    roughness: 0.2,
    emissive: p.trimBright,
    emissiveIntensity: 0.3,
  })
  const gemMat = mat(p.gem, {
    metalness: 0.15,
    roughness: 0.12,
    emissive: p.gem,
    emissiveIntensity: 0.95,
  })
  const gemAltMat = mat(p.gemAlt, {
    metalness: 0.18,
    roughness: 0.16,
    emissive: p.gemAlt,
    emissiveIntensity: 0.7,
  })
  const lockMat = mat(p.lock, {
    metalness: 0.8,
    roughness: 0.25,
    emissive: p.lock,
    emissiveIntensity: 0.18,
  })
  const innerMat = new THREE.MeshStandardMaterial({
    color: p.inner,
    emissive: p.inner,
    emissiveIntensity: 0.9,
    metalness: 0.1,
    roughness: 0.45,
  })

  // —— 箱体 ——
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 0.78), bodyMat)
  base.position.y = 0.28
  root.add(base)

  // 腰线色带：高阶更艳
  if (tier !== 'common') {
    const sash = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.1, 0.79), accentMat)
    sash.position.y = 0.3
    root.add(sash)
  }

  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 0.84), darkMat)
  foot.position.y = 0.04
  root.add(foot)

  const bandGeo = new THREE.BoxGeometry(1.18, 0.06, 0.82)
  for (const y of [0.12, 0.42]) {
    const band = new THREE.Mesh(bandGeo, trimMat)
    band.position.y = y
    root.add(band)
  }
  const vertGeo = new THREE.BoxGeometry(0.07, 0.52, 0.82)
  for (const x of [-0.52, 0.52]) {
    const v = new THREE.Mesh(vertGeo, trimMat)
    v.position.set(x, 0.28, 0)
    root.add(v)
  }

  // 锁扣 + 主宝石
  const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.08), lockMat)
  lockPlate.position.set(0, 0.38, 0.42)
  root.add(lockPlate)
  const gem = new THREE.Mesh(makeTierGemGeo(tier, 0.09), gemMat)
  gem.position.set(0, 0.4, 0.48)
  if (tier === 'fine') gem.scale.set(1.2, 0.7, 1)
  if (tier === 'legendary' || tier === 'exquisite') gem.rotation.z = Math.PI / 4
  root.add(gem)

  // —— 盖子 ——
  const lidPivot = new THREE.Group()
  lidPivot.position.set(0, 0.55, -0.36)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 0.78), bodyMat)
  lid.position.set(0, 0.08, 0.36)
  lidPivot.add(lid)
  const lidRidge = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 0.16), trimMat)
  lidRidge.position.set(0, 0.2, 0.36)
  lidPivot.add(lidRidge)
  const lidPeak = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.55), accentMat)
  lidPeak.position.set(0, 0.22, 0.36)
  lidPivot.add(lidPeak)

  // 盖顶规律镶嵌本档宝石
  const lidGems = placeLidGems(lidPivot, tier, p.lidGemCount, gemMat, gemAltMat)

  lidPivot.rotation.x = -p.lidOpen
  root.add(lidPivot)

  const glowBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.55), innerMat)
  glowBox.position.set(0, 0.52, 0.02)
  root.add(glowBox)

  const aura = glowSprite(p.aura, 2.0 + p.scale * 0.35, 0.55)
  aura.position.y = 0.55
  root.add(aura)

  const innerGlow = glowSprite(p.inner, 1.15, 0.65)
  innerGlow.position.set(0, 0.62, 0.05)
  root.add(innerGlow)

  // —— 柔连续光芒：密排宽光带 + 共享渐隐贴图 ——
  const rayTex = makeSoftRayTexture(p.ray)
  const rayTexAlt = makeSoftRayTexture(p.aura)
  const rays = new THREE.Group()
  rays.position.y = 0.52
  const rayWidth = 0.42 + p.scale * 0.08
  for (let i = 0; i < p.rayCount; i++) {
    const blade = makeSoftRay(rayTex, p.rayLen, rayWidth, p.rayOpacity)
    const yaw = (i / p.rayCount) * Math.PI * 2
    blade.rotation.order = 'YXZ'
    blade.rotation.y = yaw
    blade.rotation.x = Math.PI / 2 - 0.08
    blade.position.set(Math.sin(yaw) * 0.08, 0.02, Math.cos(yaw) * 0.08)
    rays.add(blade)
  }
  // 交错第二层：略仰角，填补间隙，让光芒更连续
  const layer2 = Math.floor(p.rayCount * 0.65)
  for (let i = 0; i < layer2; i++) {
    const blade = makeSoftRay(rayTexAlt, p.rayLen * 0.82, rayWidth * 1.15, p.rayOpacity * 0.75)
    const yaw = ((i + 0.5) / layer2) * Math.PI * 2
    blade.rotation.order = 'YXZ'
    blade.rotation.y = yaw
    blade.rotation.x = Math.PI / 2 + 0.22
    blade.position.y = 0.12
    rays.add(blade)
  }
  root.add(rays)

  let halo: THREE.Mesh | null = null
  if (p.hasHalo) {
    halo = makeHaloRing(p.aura, 0.9, 1.2, 0.18)
    halo.position.y = 0.06
    root.add(halo)
    const halo2 = makeHaloRing(p.ray, 1.28, 1.5, 0.12)
    halo2.position.y = 0.05
    root.add(halo2)
  }

  let pillar: THREE.Sprite | null = null
  if (p.hasPillar) {
    pillar = makeSoftPillar(p.ray)
    root.add(pillar)
    const pillar2 = makeSoftPillar(p.aura)
    pillar2.scale.set(0.7, 3.1, 1)
    pillar2.material.opacity = 0.35
    root.add(pillar2)
  }

  const runes: THREE.Sprite[] = []
  if (p.hasRunes) {
    for (let i = 0; i < 5; i++) {
      const r = makeRunePlate(i % 2 === 0 ? p.trimBright : p.aura)
      runes.push(r)
      root.add(r)
    }
  }

  const sparks = new THREE.Group()
  const sparkGeo = new THREE.SphereGeometry(0.025, 6, 6)
  const sparkMat = new THREE.MeshBasicMaterial({
    color: p.ray,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  for (let i = 0; i < p.sparkCount; i++) {
    const s = new THREE.Mesh(sparkGeo, sparkMat)
    s.userData.sharedMat = true
    s.userData.phase = Math.random() * Math.PI * 2
    s.userData.radius = 0.5 + Math.random() * 0.85
    s.userData.speed = 0.25 + Math.random() * 0.45
    s.userData.yBase = 0.4 + Math.random() * 0.55
    sparks.add(s)
  }
  root.add(sparks)
  root.userData.chestShared = { sparkGeo, sparkMat, rayTex, rayTexAlt }

  for (const [x, z] of [
    [-0.48, -0.32],
    [0.48, -0.32],
    [-0.48, 0.32],
    [0.48, 0.32],
  ] as const) {
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), brightMat)
    stud.position.set(x, 0.1, z)
    root.add(stud)
  }

  root.scale.setScalar(p.scale)

  root.userData.chestAnim = {
    tier,
    t: 0,
    lidPivot,
    lidBase: -p.lidOpen,
    rays,
    aura,
    innerGlow,
    gem,
    lidGems,
    halo,
    pillar,
    runes,
    sparks,
    rayOpacity: p.rayOpacity,
  }
  root.userData.isChest = true

  return root
}

/** 五档并排总览 */
export function createAllTreasureChests(): THREE.Group {
  const g = new THREE.Group()
  const tiers: ChestTier[] = ['legendary', 'supreme', 'exquisite', 'fine', 'common']
  tiers.forEach((tier, i) => {
    const c = createTreasureChest(tier)
    c.position.x = (i - 2) * 2.25
    g.add(c)
  })
  g.userData.isChest = true
  g.userData.chestGroup = true
  return g
}

export function tickTreasureChest(root: THREE.Object3D, dt: number) {
  const tickOne = (node: THREE.Object3D) => {
    const a = node.userData.chestAnim as
      | {
          t: number
          lidPivot: THREE.Group
          lidBase: number
          rays: THREE.Group
          aura: THREE.Sprite
          innerGlow: THREE.Sprite
          gem: THREE.Mesh
          lidGems: THREE.Mesh[]
          halo: THREE.Mesh | null
          pillar: THREE.Sprite | null
          runes: THREE.Sprite[]
          sparks: THREE.Group
          rayOpacity: number
        }
      | undefined
    if (!a) return
    a.t += dt
    const t = a.t

    a.lidPivot.rotation.x = a.lidBase + Math.sin(t * 0.9) * 0.03
    // 缓慢旋转，避免“风扇感”
    a.rays.rotation.y = t * 0.12
    a.gem.rotation.y = t * 0.8

    a.lidGems.forEach((g, i) => {
      g.rotation.y = t * 0.6 + i * 0.4
      const pulse = 0.92 + 0.08 * Math.sin(t * 2.2 + i)
      g.scale.setScalar(pulse)
    })

    const pulse = 0.82 + 0.18 * Math.sin(t * 1.6)
    a.aura.material.opacity = 0.42 * pulse
    a.innerGlow.material.opacity = 0.5 + 0.15 * Math.sin(t * 2.0)
    a.aura.scale.setScalar(1.85 + 0.12 * Math.sin(t * 1.2))
    a.innerGlow.scale.setScalar(1.0 + 0.08 * Math.sin(t * 1.8))

    // 整体同步淡入淡出，减少单条闪烁的假立体感
    const rayPulse = 0.85 + 0.15 * Math.sin(t * 1.3)
    a.rays.children.forEach((child) => {
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
      if (!m) return
      m.opacity = a.rayOpacity * rayPulse
    })

    if (a.halo) {
      a.halo.rotation.z = t * 0.25
      const hm = a.halo.material as THREE.MeshBasicMaterial
      hm.opacity = 0.14 + 0.06 * Math.sin(t * 1.4)
    }

    if (a.pillar) {
      a.pillar.material.opacity = 0.4 + 0.12 * Math.sin(t * 1.8)
      a.pillar.scale.x = 1.05 + 0.08 * Math.sin(t * 1.5)
    }

    a.runes.forEach((r, i) => {
      const ang = t * 0.4 + (i / a.runes.length) * Math.PI * 2
      const rad = 0.95 + 0.06 * Math.sin(t * 1.5 + i)
      r.position.set(Math.cos(ang) * rad, 0.95 + 0.1 * Math.sin(t * 1.1 + i), Math.sin(ang) * rad)
      r.material.opacity = 0.28 + 0.15 * Math.sin(t * 2 + i)
    })

    a.sparks.children.forEach((s) => {
      const u = s.userData
      const ang = t * u.speed + u.phase
      s.position.set(
        Math.cos(ang) * u.radius,
        u.yBase + Math.sin(t * 1.2 + u.phase) * 0.18,
        Math.sin(ang) * u.radius
      )
      s.scale.setScalar(0.55 + 0.35 * Math.sin(t * 2.5 + u.phase))
    })
  }

  if (root.userData.chestAnim) tickOne(root)
  root.children.forEach((c) => {
    if (c.userData.chestAnim) tickOne(c)
  })
}

export function disposeChestExtras(root: THREE.Object3D) {
  const disposeNode = (node: THREE.Object3D) => {
    const shared = node.userData.chestShared as
      | {
          sparkGeo: THREE.BufferGeometry
          sparkMat: THREE.Material
          rayTex?: THREE.Texture
          rayTexAlt?: THREE.Texture
        }
      | undefined
    if (shared) {
      shared.sparkGeo.dispose()
      shared.sparkMat.dispose()
      shared.rayTex?.dispose()
      shared.rayTexAlt?.dispose()
    }
    node.traverse((o) => {
      const s = o as THREE.Sprite
      if (s.isSprite && s.userData.glowTex) {
        ;(s.userData.glowTex as THREE.Texture).dispose()
      }
    })
  }
  disposeNode(root)
  root.children.forEach((c) => {
    if (c.userData.chestAnim) disposeNode(c)
  })
}
