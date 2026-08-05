const KEY = 'sv_last_server_id'

export function getLastServerId(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function setLastServerId(id: number) {
  try {
    localStorage.setItem(KEY, String(id))
  } catch {
    // ignore
  }
}

export function clearLastServerId() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
