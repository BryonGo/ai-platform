// Hougong 会话与真实后端（go-sdk /api/v1）请求封装。
// token 存 localStorage；站点头可经 NUXT_PUBLIC_SITE_CODE 覆盖（默认 default，
// dev 联调；生产部署时指向后宫实际站点）。

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export function useAuthSession() {
  const token = useState<string>('hg:token', () => '')
  const uid = useState<number>('hg:uid', () => 0)

  function load() {
    if (!import.meta.client) return
    token.value = localStorage.getItem('hg:token') || ''
    uid.value = Number(localStorage.getItem('hg:uid') || 0)
  }
  function save(t: string, userId: number) {
    token.value = t
    uid.value = userId
    if (import.meta.client) {
      localStorage.setItem('hg:token', t)
      localStorage.setItem('hg:uid', String(userId))
    }
  }
  function clear() {
    token.value = ''
    uid.value = 0
    if (import.meta.client) {
      localStorage.removeItem('hg:token')
      localStorage.removeItem('hg:uid')
    }
  }
  return { token, uid, load, save, clear }
}

export function apiBase(): string {
  const config = useRuntimeConfig()
  return (config.public.apiBase as string || '') + '/api/v1'
}

export function siteCode(): string {
  const config = useRuntimeConfig()
  return (config.public.siteCode as string || 'default')
}

export async function apiRequest<T = unknown>(
  path: string,
  opts: { method?: string, body?: unknown, form?: FormData } = {}
): Promise<T> {
  const session = useAuthSession()
  const headers: Record<string, string> = {
    'X-Site-Code': siteCode()
  }
  let body: BodyInit | undefined
  if (opts.form) {
    body = opts.form
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  if (session.token.value) headers.Authorization = `Bearer ${session.token.value}`
  const res = await $fetch<ApiEnvelope<T>>(apiBase() + path, {
    method: opts.method || 'GET',
    headers,
    body,
    timeout: 90000
  })
  if (res.code !== 0) {
    throw new Error(res.message || `API error ${res.code}`)
  }
  return res.data
}
