import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { emitLandscapeLayout } from './landscapeBus'

async function requestDomFullscreen() {
  try {
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void
      mozRequestFullScreen?: () => Promise<void> | void
      msRequestFullscreen?: () => Promise<void> | void
    }
    if (document.fullscreenElement) return true
    if (root.requestFullscreen) await root.requestFullscreen()
    else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen()
    else if (root.mozRequestFullScreen) await root.mozRequestFullScreen()
    else if (root.msRequestFullscreen) await root.msRequestFullscreen()
    return Boolean(document.fullscreenElement)
  } catch {
    return false
  }
}

async function lockLandscapeOrientation() {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>
    }
    if (orientation?.lock) await orientation.lock('landscape')
  } catch {
    // iOS 等忽略
  }
}

/**
 * 全局强制横屏 + 尽量全屏（全站统一：首页/登录/注册/选服/游戏）
 */
export function useForceLandscape(target: Ref<HTMLElement | null>) {
  const forced = ref(false)
  let gestureArmed = false

  function clear(el: HTMLElement) {
    el.style.position = ''
    el.style.width = ''
    el.style.height = ''
    el.style.left = ''
    el.style.top = ''
    el.style.right = ''
    el.style.bottom = ''
    el.style.transform = ''
    el.style.transformOrigin = ''
    el.style.zIndex = ''
    el.style.maxWidth = ''
    el.style.maxHeight = ''
  }

  function apply() {
    const el = target.value
    if (!el) return

    const w = window.innerWidth
    const h = window.innerHeight
    const needForce = h > w
    forced.value = needForce
    document.documentElement.classList.toggle('sv-forced-landscape', needForce)
    document.body.classList.toggle('sv-forced-landscape', needForce)

    if (needForce) {
      el.style.position = 'fixed'
      el.style.zIndex = '1000'
      el.style.width = `${h}px`
      el.style.height = `${w}px`
      el.style.maxWidth = 'none'
      el.style.maxHeight = 'none'
      el.style.top = '0'
      el.style.left = `${w}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      el.style.transformOrigin = '0 0'
      el.style.transform = 'rotate(90deg)'
    } else {
      clear(el)
    }

    requestAnimationFrame(() => emitLandscapeLayout())
  }

  function armFullscreenGesture() {
    if (gestureArmed || document.fullscreenElement) return
    gestureArmed = true
    const once = () => {
      gestureArmed = false
      void tryNativeLock()
      window.removeEventListener('pointerdown', once, true)
      window.removeEventListener('touchstart', once, true)
      window.removeEventListener('keydown', once, true)
    }
    window.addEventListener('pointerdown', once, { capture: true, passive: true })
    window.addEventListener('touchstart', once, { capture: true, passive: true })
    window.addEventListener('keydown', once, { capture: true })
  }

  async function tryNativeLock() {
    await requestDomFullscreen()
    await lockLandscapeOrientation()
    apply()
    if (!document.fullscreenElement) armFullscreenGesture()
  }

  /** 路由切换后再次尝试全屏（无手势时会挂起等待下一次点击） */
  async function ensureFullscreen() {
    apply()
    if (document.fullscreenElement) {
      await lockLandscapeOrientation()
      return
    }
    await tryNativeLock()
  }

  onMounted(() => {
    apply()
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    window.visualViewport?.addEventListener('resize', apply)
    document.addEventListener('fullscreenchange', apply)
    void tryNativeLock()
    armFullscreenGesture()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', apply)
    window.removeEventListener('orientationchange', apply)
    window.visualViewport?.removeEventListener('resize', apply)
    document.removeEventListener('fullscreenchange', apply)
    document.documentElement.classList.remove('sv-forced-landscape')
    document.body.classList.remove('sv-forced-landscape')
    if (target.value) clear(target.value)
  })

  return { forced, apply, tryNativeLock, ensureFullscreen, armFullscreenGesture }
}
