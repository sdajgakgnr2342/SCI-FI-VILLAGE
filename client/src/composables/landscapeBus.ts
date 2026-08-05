type LayoutListener = () => void

const listeners = new Set<LayoutListener>()

export function onLandscapeLayout(listener: LayoutListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitLandscapeLayout() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}
