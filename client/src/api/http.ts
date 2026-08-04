import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiResult<unknown>
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return res
  },
  (err) => {
    const msg = err.response?.data?.message || err.message || '网络错误'
    return Promise.reject(new Error(msg))
  }
)

export async function apiGet<T>(url: string, params?: object) {
  const res = await http.get<ApiResult<T>>(url, { params })
  return res.data.data
}

export async function apiPost<T>(url: string, data?: object) {
  const res = await http.post<ApiResult<T>>(url, data)
  return res.data.data
}

export async function apiPut<T>(url: string, data?: object) {
  const res = await http.put<ApiResult<T>>(url, data)
  return res.data.data
}

export default http
