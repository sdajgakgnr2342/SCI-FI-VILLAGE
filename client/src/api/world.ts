import { apiGet, apiPost, apiPut } from './http'

export interface World {
  id: number
  name: string
  seed: number
  gameMode: string
  spawnX: number
  spawnY: number
  spawnZ: number
  isPublic: number
  ownerId: number
  ownerName?: string
  createdAt: string
}

export interface PlayerState {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  health?: number
  hunger?: number
  energy?: number
}

export interface InventoryItem {
  slot: number
  itemId: string
  quantity: number
  meta?: unknown
}

export function listWorlds() {
  return apiGet<World[]>('/worlds')
}

export function createWorld(data: {
  name: string
  seed?: number
  gameMode?: string
  isPublic?: boolean
}) {
  return apiPost<World>('/worlds', data)
}

export function getWorld(id: number) {
  return apiGet<{ world: World; player: PlayerState }>(`/worlds/${id}`)
}

export function syncPosition(data: {
  worldId: number
  x: number
  y: number
  z: number
  yaw?: number
  pitch?: number
}) {
  return apiPut<PlayerState>('/player/position', data)
}

export function getInventory(worldId: number) {
  return apiGet<InventoryItem[]>('/player/inventory', { worldId })
}

export function placeBlock(data: {
  worldId: number
  x: number
  y: number
  z: number
  blockId: string
}) {
  return apiPost('/worlds/blocks', data)
}
