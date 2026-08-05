import { apiGet, apiPost } from './http'
import type { InventoryCounts } from '@/game/inventory'

export interface GameServer {
  id: number
  code: string
  name: string
  seed: number
  maxPlayers: number
  status: 'standby' | 'open' | 'full' | 'draining'
  region: string
  spawnX: number
  spawnY: number
  spawnZ: number
  online: number
  joinable?: boolean
}

export interface NpcPolicy {
  maxNearPlayer: number
  suppressWhenPlayersNearby: number
  lingerSec: [number, number]
  spawnDistance: [number, number]
  departDistance: [number, number]
  despawnMinDistance: number
  fovHalfDeg: number
  ratioHint: string
}

export interface JoinResult {
  server: GameServer
  player: { x: number; y: number; z: number; yaw: number; pitch: number }
  inventory?: InventoryCounts
  npcPolicy: NpcPolicy
}

export function listServers() {
  return apiGet<{ servers: GameServer[]; npcPolicy: NpcPolicy }>('/servers')
}

export function joinServer(serverId?: number) {
  return apiPost<JoinResult>('/servers/join', serverId ? { serverId } : {})
}

export function leaveServer(finalState?: {
  serverId: number
  x: number
  y: number
  z: number
  yaw?: number
  pitch?: number
  inventory?: InventoryCounts
}) {
  return apiPost<boolean>('/servers/leave', finalState || {})
}

export function serverHeartbeat(data: {
  serverId: number
  x: number
  y: number
  z: number
  yaw?: number
  pitch?: number
}) {
  return apiPost<boolean>('/servers/heartbeat', data)
}

export function nearbyPlayers(serverId: number) {
  return apiGet<
    Array<{
      userId: number
      username: string
      displayName: string
      x: number
      y: number
      z: number
    }>
  >('/servers/nearby', { serverId })
}

export interface ServerBlock {
  x: number
  y: number
  z: number
  blockId: string
}

export function queryServerBlocks(params: {
  serverId: number
  minX: number
  maxX: number
  minY?: number
  maxY?: number
  minZ: number
  maxZ: number
}) {
  return apiGet<ServerBlock[]>('/servers/blocks', params)
}

export function saveServerBlocks(serverId: number, blocks: ServerBlock[]) {
  return apiPost<ServerBlock[]>('/servers/blocks', { serverId, blocks })
}

export function saveServerInventory(serverId: number, inventory: InventoryCounts) {
  return apiPost<InventoryCounts>('/servers/inventory', { serverId, inventory })
}
