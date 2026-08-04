import { apiGet, apiPost } from './http'

export interface User {
  id: number
  username: string
  email?: string | null
  displayName?: string
}

export interface AuthPayload {
  user: User
  token: string
}

export function register(data: {
  username: string
  password: string
  email?: string
  displayName?: string
}) {
  return apiPost<AuthPayload>('/auth/register', data)
}

export function login(data: { username: string; password: string }) {
  return apiPost<AuthPayload>('/auth/login', data)
}

export function fetchMe() {
  return apiGet<User>('/auth/me')
}

export function health() {
  return apiGet<{ status: string; mysql: boolean; redis: boolean; time: string }>('/health')
}
