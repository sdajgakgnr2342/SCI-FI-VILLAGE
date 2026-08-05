import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getLastServerId } from '@/utils/lastServer'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/servers',
      name: 'servers',
      component: () => import('@/views/ServersView.vue'),
      meta: { auth: true },
    },
    {
      path: '/worlds',
      redirect: '/servers',
    },
    {
      path: '/play/:serverId',
      name: 'play',
      component: () => import('@/views/PlayView.vue'),
      meta: { auth: true },
    },
    {
      path: '/dev/models',
      name: 'model-lab',
      component: () => import('@/views/ModelLabView.vue'),
      meta: { portrait: true },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.auth && !auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guest && auth.token) {
    const last = getLastServerId()
    if (last) return { name: 'play', params: { serverId: String(last) } }
    return { name: 'servers' }
  }
  return true
})

export default router
