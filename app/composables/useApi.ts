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
  /** 稳定错误键（由后端 httpx 注入，如 INSUFFICIENT_CREDITS）。成功响应缺省。 */
  errorKey?: string
  /** 请求编号：用户反馈时凭它定位服务端日志。 */
  requestId?: string
  /** 结构化错误细节：字段级校验错误 / 业务附加数据。 */
  details?: PlatformErrorDetails
  contractVersion?: number
}

/** 错误细节：与后端 httpx.Details 对应。 */
export interface PlatformErrorDetails {
  fieldErrors?: { field: string, rule: string, message: string }[]
  extra?: unknown
}

/**
 * PlatformApiError 平台业务错误。
 *
 * 带出 code / errorKey / requestId，让调用方能按 **errorKey** 分支（例如金币不足要
 * 引导去充值、年龄门要弹确认框），而不是去模糊匹配 message 文案 —— 文案会改，键不会。
 */
export class PlatformApiError extends Error {
  readonly code: number
  readonly errorKey: string
  readonly requestId: string
  readonly details?: PlatformErrorDetails

  constructor(code: number, message: string, errorKey: string, requestId: string, details?: PlatformErrorDetails) {
    super(message)
    this.name = 'PlatformApiError'
    this.code = code
    this.errorKey = errorKey
    this.requestId = requestId
    this.details = details
  }
}

// errorKeyMessages 稳定错误键 → 面向用户的中文文案。
//
// 为什么在前端做映射、而不是让后端 message 直接返回中文：后端的 message 是给开发看的
// 内部描述（英文，如 "insufficient credits"），面向用户的措辞属于展示层，要随产品话术
// 调整；而 errorKey 正是后端为「前端可枚举处理」专门提供的稳定契约（见后端
// platform/consts/error.go 的包注释）。文案集中在这一张表里、由 apiRequest 一处收口，
// 全站调用点自动受益，也不会把 UI 文案焊死在后端。
const errorKeyMessages: Record<string, string> = {
  INSUFFICIENT_CREDITS: '金币不足，请先充值后再试',
  UNAUTHENTICATED: '登录已过期，请重新登录',
  FORBIDDEN: '没有权限执行该操作',
  AGE_GATE_REQUIRED: '需要先完成 18+ 年龄确认',
  CONTENT_BLOCKED: '提示词包含不允许的内容，请修改后重试',
  RATE_LIMITED: '操作太频繁，请稍后再试',
  UNSUPPORTED_PARAMETER: '当前模型或参数不支持，请调整后重试',
  ASSET_UNAVAILABLE: '素材不可用，请重新选择',
  CAPABILITY_UNAVAILABLE: '该能力暂时不可用，请稍后再试',
  VALIDATION_FAILED: '提交的参数不合法，请检查后重试',
  STATE_CONFLICT: '当前状态不允许该操作，请刷新后重试',
  VERSION_CONFLICT: '内容已被更新，请刷新后重试',
  NOT_FOUND: '内容不存在或已被删除',
  QUOTE_EXPIRED: '报价已过期，请重新获取',
  QUOTE_STALE: '价格已变化，请确认新价格后重新提交',
  IMPORT_NOT_READY: '还有文件未就绪，请稍后再试',
  PATH_CONFLICT: '目标路径已被占用，请选择其他路径',
  OPERATION_EXPIRED: '该操作已过期，请重新发起',
  EXPORT_PLAN_CHANGED: '导出内容已变化，请重新确认',
  IDEMPOTENCY_CONFLICT: '请求与上次重复，请刷新后重试',
  INVALID_PACKAGE: '该套餐不存在或已下架',
  INTERNAL_ERROR: '服务开小差了，请稍后再试',
  // ── 账号域（go-sdk/internal/app/account/consts/error.go，键名与之逐字对齐）──
  // 注意 USER_EMAIL_REGISTERED 对应后端 50004，同时用于邮箱与用户名冲突，文案必须通用。
  USER_NOT_FOUND: '账号不存在',
  USER_PASSWORD_WRONG: '账号或密码错误',
  USER_DISABLED: '账号已被停用',
  USER_EMAIL_REGISTERED: '该邮箱或用户名已被使用',
  USER_CODE_ERROR: '验证码错误',
  USER_CODE_EXPIRED: '验证码已过期，请重新获取',
  USER_PLATFORM_FAIL: '第三方登录暂不可用',
  USER_REGISTER_FAIL: '注册失败，请稍后再试',
  USER_UPLOAD_FAIL: '上传失败，请稍后再试',
  AGREEMENT_REQUIRED: '请先阅读并同意用户协议',
  USERNAME_INVALID: '用户名不符合规则',
  LOGIN_BY_EMAIL_ONLY: '本站仅支持邮箱登录',
  USER_NOT_GUEST: '会话状态异常，请刷新后重试'
}

/** friendlyMessage 取用户可读文案：优先用错误键映射，未登记的键回落到后端 message。 */
export function friendlyMessage(errorKey: string, fallback: string): string {
  return errorKeyMessages[errorKey] || fallback
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
    const errorKey = res.errorKey || ''
    const requestId = res.requestId || ''
    // 登录失效：JWT 中间件返回 401（"请求要求用户的身份认证"）、平台接口 60001，
    // 以及账号侧的 50005/50006/50007（Token 过期 / 无效 / 未登录）。
    // 清本地登录态 + 友好提示，页面会引导重新登录。
    //
    // 50005-50007 必须在这里列出：后端那几个码此前被 `liberr.PanicIfErr` 吞成
    // CodeInternalPanic(68)，既认不出也提示不对（2026-09-23 修）。两边要一起看。
    if (res.code === 60001 || res.code === 401
      || res.code === 50005 || res.code === 50006 || res.code === 50007
      || errorKey === 'UNAUTHENTICATED') {
      session.clear()
      throw new PlatformApiError(res.code, '登录已过期，请重新登录', 'UNAUTHENTICATED', requestId)
    }
    const backendMessage = (res.message || '').trim()
    // INTERNAL_ERROR 刻意**不走文案表**：后端对这类错误已经做过脱敏（httpx.sanitizeMessage），
    // 它给的消息本身就是给人看的（掩码过的还已经带上了「（编号 xxx）」）。用「服务开小差了」
    // 盖掉它，会把「Token已过期，请重新登录」这类真实原因一起盖没 —— 2026-09-23 线上踩过。
    let message = errorKey === 'INTERNAL_ERROR'
      ? (backendMessage || '服务开小差了，请稍后再试')
      : friendlyMessage(errorKey, backendMessage || `API error ${res.code}`)
    // 其余情况仍补编号：用户截图/复制时编号跟着走，后端能直接定位（已含则不重复）。
    if (errorKey === 'INTERNAL_ERROR' && requestId && !message.includes(requestId)) {
      message += `（编号 ${requestId}）`
    }
    throw new PlatformApiError(res.code, message, errorKey, requestId, res.details)
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
