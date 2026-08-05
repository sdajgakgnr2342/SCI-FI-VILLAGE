/** 和平精英式队友配色：黄 / 蓝 / 绿 / 粉 */
export const SQUAD_COLORS = ['#f0c93a', '#3d9eff', '#3dce6a', '#ff6eb4'] as const

export interface MapPeer {
  userId: number
  name: string
  x: number
  z: number
  /** 朝向（弧度），与引擎一致 */
  yaw?: number
}

export interface SquadMember {
  userId: number
  name: string
  /** 1..4 */
  slot: number
  /** 同服在线（有位置同步） */
  online?: boolean
}

export function squadColor(slot: number) {
  return SQUAD_COLORS[(Math.max(1, slot) - 1) % SQUAD_COLORS.length]
}
