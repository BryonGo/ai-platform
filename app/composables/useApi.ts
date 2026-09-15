// Hougong 会话与真实后端（go-sdk /api/v1）请求封装。
//
// 凭据策略：token **不再写 localStorage**。登录时后端同时下发 HttpOnly Cookie
// （脚本读不到、浏览器自动带上），前端只在内存保留一份，供 SSE 等无法自定义请求头
// 的场景使用 —— 即便页面被注入脚本，也拿不到可长期复读的凭据。
// 站点头可经 NUXT_PUBLIC_SITE_CODE 覆盖（默认 default，dev 联调；生产部署时指向后宫实际站点）。

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

// legacyTokenKey 旧版落盘的凭据键名。迁移后主动清理，避免历史用户机器上遗留的
// token 继续被任意脚本读取。
const legacyTokenKey = 'hg:token'

// restoreOnce 保证会话恢复在整个应用生命周期内只请求一次。
let restoreOnce: Promise<void> | null = null

export function useAuthSession() {
  const token = useState<string>('hg:token', () => '')
  const uid = useState<number>('hg:uid', () => 0)

  // acceptSession 写入登录态，只进内存 —— 持久化正是凭据可被 XSS 读走的根因。
  function acceptSession(t: string, userId: number) {
    token.value = t
    uid.value = userId
  }

  // restoreSession 用 HttpOnly Cookie 里的凭据换回内存态。
  //
  // 刷新页面后内存 token 必然丢失，靠 Cookie 续：后端 auto-login 在 token 为空时
  // 支持改用 Cookie 校验并重签，因此无需在本地保存任何凭据。
  function restoreSession(): Promise<void> {
    if (!import.meta.client || token.value) return Promise.resolve()
    if (!restoreOnce) {
      restoreOnce = apiRequest<{ token: string, user_id: number }>('/account/auth/auto-login', {
        method: 'POST', body: {}
      }).then((data) => {
        if (data?.token) acceptSession(data.token, data.user_id || 0)
      }).catch(() => {
        /* 未登录或已过期：保持未登录态即可，不必打扰用户 */
      })
    }
    return restoreOnce
  }

  async function load() {
    if (!import.meta.client) return
    // 迁移：清掉旧版本落盘的凭据
    localStorage.removeItem(legacyTokenKey)
    await restoreSession()
  }
  function save(t: string, userId: number) {
    acceptSession(t, userId)
    restoreOnce = null
  }
  function clear() {
    token.value = ''
    uid.value = 0
    restoreOnce = null
    if (import.meta.client) {
      localStorage.removeItem(legacyTokenKey)
    }
  }
  return { token, uid, load, save, clear }
}

// apiBase 返回 API 前缀。
//
// SSR 与浏览器刻意分开：服务端内部请求走**内网**（apiBaseInternal，容器内直连，
// 不必绕公网域名再回来）；浏览器走 public.apiBase —— 留空即同源 '/api/v1'，
// 由 nuxt.config 的 routeRules 代理到内网，因此天然无跨域。
export function apiBase(): string {
  const config = useRuntimeConfig()
  if (import.meta.server) {
    const internal = (config.apiBaseInternal as string || '').replace(/\/+$/, '')
    if (internal) return internal + '/api/v1'
  }
  return ((config.public.apiBase as string) || '') + '/api/v1'
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
    // credentials: 'include' —— 凭据在 HttpOnly Cookie 里，必须允许浏览器带上。
    resp = await fetch(apiBase() + path, {
      method: opts.method || 'GET', headers, body, signal: ctrl.signal, credentials: 'include'
    })
  } finally {
    clearTimeout(timer)
  }
  const res = parseWithBigInt(await resp.text()) as ApiEnvelope<T>
  if (res.code !== 0) {
    // 登录失效：JWT 中间件返回 401（"请求要求用户的身份认证"）或平台接口 60001。
    // 清除本地登录态并给友好提示，页面会引导重新登录。
    if (res.code === 60001 || res.code === 401) {
      session.clear()
      throw new Error('登录已过期，请重新登录')
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
