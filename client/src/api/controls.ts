import { apiGet, apiPost, apiPut } from './http'
import type { ControlLayout } from '@/game/controlLayout'

export function fetchControlLayout() {
  return apiGet<{ layout: ControlLayout | null; shareCode: string | null }>('/player/controls')
}

export function saveControlLayout(layout: ControlLayout) {
  return apiPut<{ layout: ControlLayout; shareCode: string | null }>('/player/controls', { layout })
}

export function shareControlLayout() {
  return apiPost<{ shareCode: string; layout: ControlLayout }>('/player/controls/share')
}

export function importControlLayout(code: string) {
  return apiPost<{ layout: ControlLayout; shareCode: string | null }>('/player/controls/import', {
    code,
  })
}
