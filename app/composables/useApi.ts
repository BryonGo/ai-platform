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
  // 原生 fetch + reviver：雪花 ID（>2^53）JSON.parse 会丢精度，一律转字符串。
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90000)
  let resp: Response
  try {
    resp = await fetch(apiBase() + path, { method: opts.method || 'GET', headers, body, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
  const res = parseWithBigInt(await resp.text()) as ApiEnvelope<T>
  if (res.code !== 0) {
    // 登录失效：JWT 中间件返回 401（"请求要求用户的身份认证"）或平台接口 60001。
    // 清除本地登录态并给友好提示，页面会引导重新登录（游客一键登录）。
    if (res.code === 60001 || res.code === 401) {
      session.clear()
      throw new Error('登录已过期，请重新登录（可点「游客一键登录」）')
    }
    throw new Error(res.message || `API error ${res.code}`)
  }
  return res.data
}

// 大整数（雪花 ID > 2^53）→ 字符串。
// 注意：必须在 JSON.parse 之前处理——parse 阶段 Number 就已丢失精度，
// 任何 reviver 都救不回已舍入的数值。这里用正则把 16 位以上整数整体加引号。
function parseWithBigInt(text: string): unknown {
  const guarded = text.replace(
    /([:{}[\],])\s*(-?\d{16,})(?=\s*[,}\]])/g,
    (_m, prefix: string, digits: string) => `${prefix}"${digits}"`
  )
  return JSON.parse(guarded)
}
