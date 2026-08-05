/** 局内小队消息（队伍 / 系统） */

export type ChatChannel = 'team' | 'system'

export interface ChatMarkPayload {
  userId: number
  slot: number
  x: number
  y: number
  z: number
  label?: string
}

export interface SquadChatItem {
  id: string
  channel: ChatChannel
  /** chat | mark | wait */
  kind: 'chat' | 'mark' | 'wait'
  userId?: number
  slot?: number
  name?: string
  text: string
  ts: number
  /** 系统标记消息：点击可重新显示 */
  mark?: ChatMarkPayload
}

export const CHAT_MAX_ITEMS = 40
/** 单次队伍消息最大字数 */
export const CHAT_TEXT_MAX = 20

let chatSeq = 0
export function nextChatId() {
  chatSeq += 1
  return `c${Date.now().toString(36)}_${chatSeq}`
}

export function pushChatItem(list: SquadChatItem[], item: SquadChatItem): SquadChatItem[] {
  const next = [...list, item]
  if (next.length > CHAT_MAX_ITEMS) return next.slice(next.length - CHAT_MAX_ITEMS)
  return next
}
