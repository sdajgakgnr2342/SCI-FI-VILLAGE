import { apiGet, apiPost } from './http'

export interface PartyInfo {
  id: number
  code: string
  hostUserId: number
  serverId: number | null
  status: string
}

export interface PartyMember {
  userId: number
  username: string
  displayName: string | null
  role: 'host' | 'member'
}

export interface PartyInvite {
  id: number
  status: string
  createdAt: string
  partyCode: string
  partyId: number
  fromUsername: string
  fromDisplayName: string | null
}

export interface PartyMine {
  party: PartyInfo | null
  members: PartyMember[]
  invites: PartyInvite[]
  sent: Array<{ id: number; status: string; toUsername: string; toDisplayName: string | null }>
}

export function fetchPartyMine() {
  return apiGet<PartyMine>('/party/mine')
}

export function inviteFriend(username: string) {
  return apiPost<{ inviteId: number }>('/party/invite', { username })
}

export function acceptInvite(id: number) {
  return apiPost<PartyMine>(`/party/invites/${id}/accept`)
}

export function declineInvite(id: number) {
  return apiPost<boolean>(`/party/invites/${id}/decline`)
}

export function leaveParty() {
  return apiPost<boolean>('/party/leave')
}

export function enterWithParty(serverId?: number) {
  return apiPost<{
    server: { id: number; name: string; seed: number }
    player: {
      x: number
      y: number
      z: number
      yaw: number
      pitch: number
      cabinX?: number
      cabinZ?: number
      partySlot?: number
      shareCabin?: boolean
    }
    npcPolicy: unknown
    party: PartyInfo
  }>('/party/enter', serverId ? { serverId } : {})
}
