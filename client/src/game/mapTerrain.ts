import type { MinimapKind } from '@/game/engine'

export type { MinimapKind }

/** 与三维方块色接近，略压饱和方便读标记 */
export const MINIMAP_RGB: Record<MinimapKind, [number, number, number]> = {
  grass: [98, 158, 72],
  dirt: [148, 108, 68],
  water: [72, 148, 198],
  sand: [206, 188, 128],
  stone: [132, 136, 142],
  tree: [42, 102, 48],
  wood: [118, 82, 48],
  shrub: [62, 118, 52],
  build: [176, 148, 108],
}

export type MinimapSampleFn = (x: number, z: number) => MinimapKind

function tint(kind: MinimapKind, ix: number, iz: number): [number, number, number] {
  const [r, g, b] = MINIMAP_RGB[kind]
  if (kind !== 'grass' && kind !== 'dirt') return [r, g, b]
  const n = ((ix * 374761393) ^ (iz * 668265263)) >>> 0
  const d = ((n & 7) - 3) * 3
  return [
    Math.max(0, Math.min(255, r + d)),
    Math.max(0, Math.min(255, g + d)),
    Math.max(0, Math.min(255, b + (d >> 1))),
  ]
}

/** 复用离屏画布与 ImageData，减轻移动端 GC */
let offscreen: HTMLCanvasElement | null = null
let cachedImg: ImageData | null = null
let cachedSamples = 0
const cellCache = new Map<number, MinimapKind>()

/**
 * 将世界矩形画到 canvas（中心 + 边长 range 的俯视图）。
 * 格缓存 + 大步长时补探水，缩放拖动更跟手。
 */
export function paintMinimapTerrain(
  canvas: HTMLCanvasElement,
  opts: {
    centerX: number
    centerZ: number
    range: number
    sample: MinimapSampleFn
    /** 最大采样边长（像素），默认 96 */
    maxSamples?: number
    /** low：移动端少探水、低 dpr */
    quality?: 'low' | 'high'
  }
) {
  const cssW = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 1))
  const cssH = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || 1))
  const maxS = opts.maxSamples ?? 96
  const samples = Math.max(24, Math.min(maxS, Math.max(cssW, cssH)))
  const low = opts.quality === 'low'
  const dpr = Math.min(
    low ? 1 : 1.25,
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  )
  const outW = Math.round(cssW * dpr)
  const outH = Math.round(cssH * dpr)
  if (canvas.width !== outW || canvas.height !== outH) {
    canvas.width = outW
    canvas.height = outH
  }

  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return

  const half = opts.range / 2
  const step = opts.range / samples
  if (!cachedImg || cachedSamples !== samples) {
    cachedImg = ctx.createImageData(samples, samples)
    cachedSamples = samples
  }
  const img = cachedImg
  const data = img.data
  const x0 = opts.centerX - half
  const z0 = opts.centerZ - half

  cellCache.clear()
  const keyOf = (ix: number, iz: number) => ((ix + 0x20000) << 16) ^ (iz + 0x20000)
  const sampleCell = (wx: number, wz: number): MinimapKind => {
    const ix = Math.floor(wx)
    const iz = Math.floor(wz)
    const k = keyOf(ix, iz)
    let kind = cellCache.get(k)
    if (kind === undefined) {
      kind = opts.sample(ix + 0.5, iz + 0.5)
      cellCache.set(k, kind)
    }
    return kind
  }

  // 移动端只做十字探一次，避免 4 倍采样
  const preferWater = !low && step > 0.85
  const preferWaterLite = low && step > 1.1
  const probe = step * 0.42

  for (let py = 0; py < samples; py++) {
    const wz = z0 + (py + 0.5) * step
    for (let px = 0; px < samples; px++) {
      const wx = x0 + (px + 0.5) * step
      const ix = Math.floor(wx)
      const iz = Math.floor(wz)
      let kind = sampleCell(wx, wz)
      if (preferWater && kind !== 'water') {
        if (
          sampleCell(wx + probe, wz) === 'water' ||
          sampleCell(wx - probe, wz) === 'water' ||
          sampleCell(wx, wz + probe) === 'water' ||
          sampleCell(wx, wz - probe) === 'water'
        ) {
          kind = 'water'
        }
      } else if (preferWaterLite && kind !== 'water') {
        if (
          sampleCell(wx + probe, wz) === 'water' ||
          sampleCell(wx, wz + probe) === 'water'
        ) {
          kind = 'water'
        }
      }
      const [r, g, b] = tint(kind, ix, iz)
      const i = (py * samples + px) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }

  if (!offscreen) offscreen = document.createElement('canvas')
  if (offscreen.width !== samples || offscreen.height !== samples) {
    offscreen.width = samples
    offscreen.height = samples
  }
  const octx = offscreen.getContext('2d')
  if (!octx) return
  octx.putImageData(img, 0, 0)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  ctx.drawImage(offscreen, 0, 0, outW, outH)
}
