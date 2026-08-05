export type PresenceAction = 'dig' | 'chop' | 'mine' | 'build' | 'clear' | string | null

export interface PeerPresence {
  userId: number
  username: string
  displayName?: string | null
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  action?: PresenceAction
  crouching?: boolean
  ts?: number
}

type Handler = {
  onPeers?: (peers: PeerPresence[]) => void
  onPresence?: (peer: PeerPresence) => void
  onLeft?: (userId: number) => void
  onBlocks?: (blocks: { x: number; y: number; z: number; blockId: string }[]) => void
  onSquadMark?: (mark: {
    userId: number
    clear?: boolean
    slot?: number
    x?: number
    y?: number
    z?: number
    label?: string
    ts?: number
  }) => void
  onSquadChat?: (msg: {
    userId: number
    username?: string
    displayName?: string | null
    channel?: 'team' | 'system'
    kind?: string
    slot?: number
    text?: string
    mark?: {
      userId: number
      slot: number
      x: number
      y: number
      z: number
      label?: string
    }
    ts?: number
  }) => void
  onError?: (msg: string) => void
}

/**
 * 同服实时存在同步（WebSocket）
 * 服务端 AOI snapshot；客户端按移动自适应降频上报
 */
export class PresenceClient {
  private ws: WebSocket | null = null
  private handlers: Handler = {}
  private serverId = 0
  private token = ''
  private sendTimer: number | undefined
  private lastSend = 0
  private lastX = 0
  private lastZ = 0
  private lastAction: PresenceAction = null
  private reconnectTimer: number | undefined

  connect(token: string, serverId: number, handlers: Handler) {
    this.disconnect()
    this.token = token
    this.serverId = serverId
    this.handlers = handlers

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${location.host}/ws`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token, serverId }))
    }

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if ((msg.type === 'snapshot' || msg.type === 'peers') && Array.isArray(msg.peers)) {
        this.handlers.onPeers?.(msg.peers as PeerPresence[])
      } else if (msg.type === 'presence') {
        this.handlers.onPresence?.(msg as unknown as PeerPresence)
      } else if (msg.type === 'peer_left' && msg.userId != null) {
        this.handlers.onLeft?.(Number(msg.userId))
      } else if (msg.type === 'blocks' && Array.isArray(msg.blocks)) {
        this.handlers.onBlocks?.(
          msg.blocks as { x: number; y: number; z: number; blockId: string }[]
        )
      } else if (msg.type === 'squad_mark' && msg.userId != null) {
        this.handlers.onSquadMark?.(msg as {
          userId: number
          clear?: boolean
          slot?: number
          x?: number
          y?: number
          z?: number
          label?: string
          ts?: number
        })
      } else if (msg.type === 'squad_chat' && msg.userId != null) {
        this.handlers.onSquadChat?.(msg as {
          userId: number
          username?: string
          displayName?: string | null
          channel?: 'team' | 'system'
          kind?: string
          slot?: number
          text?: string
          mark?: {
            userId: number
            slot: number
            x: number
            y: number
            z: number
            label?: string
          }
          ts?: number
        })
      } else if (msg.type === 'error') {
        this.handlers.onError?.(String(msg.message || 'ws error'))
      }
    }

    ws.onclose = () => {
      if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = window.setTimeout(() => {
        if (this.token && this.serverId) this.connect(this.token, this.serverId, this.handlers)
      }, 2500)
    }
  }

  /**
   * 自适应上报：移动 ~10Hz，静止 ~2Hz，动作变化立即发
   */
  sendPresence(data: {
    x: number
    y: number
    z: number
    yaw: number
    pitch: number
    action?: PresenceAction
    crouching?: boolean
  }) {
    const now = performance.now()
    const dx = data.x - this.lastX
    const dz = data.z - this.lastZ
    const moved = dx * dx + dz * dz > 0.0004
    const actionChanged = (data.action || null) !== this.lastAction
    const minInterval = actionChanged ? 50 : moved ? 100 : 450
    if (now - this.lastSend < minInterval) return
    this.lastSend = now
    this.lastX = data.x
    this.lastZ = data.z
    this.lastAction = data.action || null
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        type: 'presence',
        ...data,
      })
    )
  }

  sendBlocks(blocks: { x: number; y: number; z: number; blockId: string }[]) {
    if (!blocks.length) return
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        type: 'blocks',
        blocks,
      })
    )
  }

  /** 小队标记：同服队友全图同步 */
  sendSquadMark(data: {
    clear?: boolean
    slot?: number
    x?: number
    y?: number
    z?: number
    label?: string
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        type: 'squad_mark',
        ...data,
      })
    )
  }

  /** 小队聊天 / 系统消息同步 */
  sendSquadChat(data: {
    channel: 'team' | 'system'
    kind?: 'chat' | 'mark' | 'wait'
    slot?: number
    text: string
    mark?: {
      userId?: number
      slot?: number
      x: number
      y: number
      z: number
      label?: string
    }
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        type: 'squad_chat',
        ...data,
      })
    )
  }

  disconnect() {
    this.token = ''
    this.serverId = 0
    if (this.sendTimer) window.clearInterval(this.sendTimer)
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: 'leave' }))
      } catch {
        // ignore
      }
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
