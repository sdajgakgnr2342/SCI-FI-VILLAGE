/** 本地画质 / 音频偏好（localStorage） */

export type QualityPreset = 'low' | 'standard' | 'high'

export interface PlaySettings {
  /** WebGL 抗锯齿；默认关（更省电，移动端更稳） */
  antialias: boolean
  quality: QualityPreset
  muted: boolean
}

const KEY = 'sv_play_settings_v1'

const DEFAULTS: PlaySettings = {
  antialias: false,
  quality: 'standard',
  muted: false,
}

export function loadPlaySettings(): PlaySettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<PlaySettings>
    return {
      antialias: Boolean(parsed.antialias),
      quality:
        parsed.quality === 'low' || parsed.quality === 'high' || parsed.quality === 'standard'
          ? parsed.quality
          : 'standard',
      muted: Boolean(parsed.muted),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePlaySettings(s: PlaySettings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function pixelRatioForQuality(quality: QualityPreset) {
  const dpr = window.devicePixelRatio || 1
  if (quality === 'low') return Math.min(1, dpr)
  if (quality === 'high') return Math.min(2, dpr)
  return Math.min(1.35, dpr)
}

export const QUALITY_LABEL: Record<QualityPreset, string> = {
  low: '流畅',
  standard: '标准',
  high: '高清',
}
