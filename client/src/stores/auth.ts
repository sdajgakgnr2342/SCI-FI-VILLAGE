import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/api/auth'
import * as authApi from '@/api/auth'

const TOKEN_KEY = 'sv_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<User | null>(null)

  const isLoggedIn = computed(() => Boolean(token.value))

  function setSession(nextToken: string, nextUser: User) {
    token.value = nextToken
    user.value = nextUser
    localStorage.setItem(TOKEN_KEY, nextToken)
  }

  function clearSession() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  async function login(username: string, password: string) {
    const data = await authApi.login({ username, password })
    setSession(data.token, data.user)
    return data
  }

  async function register(payload: {
    username: string
    password: string
    email?: string
    displayName?: string
  }) {
    const data = await authApi.register(payload)
    setSession(data.token, data.user)
    return data
  }

  async function loadMe() {
    if (!token.value) return null
    try {
      user.value = await authApi.fetchMe()
      return user.value
    } catch {
      clearSession()
      return null
    }
  }

  function logout() {
    clearSession()
  }

  return {
    token,
    user,
    isLoggedIn,
    login,
    register,
    loadMe,
    logout,
    setSession,
    clearSession,
  }
})
