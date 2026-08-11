/**
 * 昼夜循环（墙上时钟对齐，各端同一时刻）。
 * 白天 50 分钟（含黎明/黄昏各 1 分钟过渡）+ 黑夜 10 分钟 = 60 分钟一轮。
 */

export const DAY_SEC = 50 * 60
export const NIGHT_SEC = 10 * 60
export const TRANSITION_SEC = 60
export const CYCLE_SEC = DAY_SEC + NIGHT_SEC

export type DayNightPhase = 'dawn' | 'day' | 'dusk' | 'night'

export interface DayNightState {
  /** 0 = 深夜，1 = 正午白天 */
  dayness: number
  phase: DayNightPhase
  /** 本轮已过去秒数 [0, CYCLE_SEC) */
  cycleT: number
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * 时间轴（秒）：
 * 0..60 黎明（夜→昼）
 * 60..2940 白天（48 分钟）
 * 2940..3000 黄昏（昼→夜）
 * 3000..3600 黑夜（10 分钟）
 * 黎明+白天+黄昏 = 50 分钟；黑夜 = 10 分钟。
 */
export function sampleDayNight(nowMs: number = Date.now()): DayNightState {
  const cycleT = ((nowMs / 1000) % CYCLE_SEC + CYCLE_SEC) % CYCLE_SEC
  const dawnEnd = TRANSITION_SEC
  const dayEnd = DAY_SEC - TRANSITION_SEC
  const duskEnd = DAY_SEC

  if (cycleT < dawnEnd) {
    return {
      cycleT,
      phase: 'dawn',
      dayness: smoothstep(0, dawnEnd, cycleT),
    }
  }
  if (cycleT < dayEnd) {
    return { cycleT, phase: 'day', dayness: 1 }
  }
  if (cycleT < duskEnd) {
    return {
      cycleT,
      phase: 'dusk',
      dayness: 1 - smoothstep(dayEnd, duskEnd, cycleT),
    }
  }
  return { cycleT, phase: 'night', dayness: 0 }
}

/** 秒 → m:ss（如 50:00、9:05） */
export function formatRemainClock(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export interface DayNightHud {
  phase: DayNightPhase
  isNight: boolean
  remainSec: number
  clock: string
  text: string
}

/** HUD：白天提示入夜倒计时，黑夜提示结束倒计时 */
export function sampleDayNightHud(nowMs: number = Date.now()): DayNightHud {
  const st = sampleDayNight(nowMs)
  if (st.phase === 'night') {
    const remainSec = Math.max(0, CYCLE_SEC - st.cycleT)
    const clock = formatRemainClock(remainSec)
    return {
      phase: st.phase,
      isNight: true,
      remainSec,
      clock,
      text: `黑夜还有 ${clock} 结束`,
    }
  }
  const remainSec = Math.max(0, DAY_SEC - st.cycleT)
  const clock = formatRemainClock(remainSec)
  return {
    phase: st.phase,
    isNight: false,
    remainSec,
    clock,
    text: `夜晚还有 ${clock} 降临`,
  }
}
