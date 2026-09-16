/**
 * 预签名媒体地址的**过期自愈**。
 *
 * 背景：对象存储是私有的，图片/视频一律下发**限时签名地址**（作品与资产 3600s、
 * 工具封面 86400s）。页面挂满一小时之后，DOM 里那些地址就成了废纸 —— 浏览器再取
 * 一次（重新加载图片、视频换 Range 段、切回标签页后重新解码）就是 403，用户看到
 * 一屏碎图。以前这个边界没人管。
 *
 * 这里做三件事：
 *
 * 1) 从 URL 反解过期时刻（`signedUrlExpiresAt`）。签名地址自带
 *    `X-Amz-Date=20260916T074509Z&X-Amz-Expires=3600`，两者相加就是到期时间，
 *    不需要后端额外下发字段，也不用猜。
 * 2) 一个全局的刷新信号（`requestMediaRefresh`）：媒体加载失败、或从后台切回来
 *    发现 DOM 里已有过期地址时，发一次"该重新取数了"的广播。带节流与预算，
 *    避免"地址一直坏 → 一直重取"把接口打穿。
 * 3) `useMediaAutoRefresh(loader)`：页面把自己那套取数逻辑挂上，信号来了就重跑，
 *    拿到新签名地址后 DOM 自动换 URL，碎图自己长回来。
 *
 * 为什么不做「后端把 TTL 调长」：签名就是防盗链，调长等于把可转发的时间窗一起放大；
 * 也不做「代理转发」：那会让每张图都过一次 API 进程。过期就重新签名才是对的解法。
 */

/** 签名地址到期前多久就该换（留出网络与渲染时间）。 */
const REFRESH_SKEW_MS = 60_000
/** 两次刷新之间的最小间隔（防抖，避免一屏碎图触发 N 次请求）。 */
const REFRESH_MIN_INTERVAL_MS = 5_000
/** 一分钟内最多刷新几次（预算耗尽说明"刷新也救不回来"，别再打了）。 */
const REFRESH_BUDGET = 3
const REFRESH_WINDOW_MS = 60_000

let lastRefreshAt = 0
let windowStartedAt = 0
let usedInWindow = 0

/**
 * 解析签名地址的过期时刻（毫秒）。非签名地址（CDN 地址、相对路径、外链）返回 null。
 *
 * 认的是 AWS/MinIO 的 V4 查询串签名：`X-Amz-Date=<YYYYMMDD>T<HHMMSS>Z` + `X-Amz-Expires`。
 * 片段（`#t=0.1`，我们给视频卡加的首帧跳转）不影响 query，解析前先剥掉。
 */
export function signedUrlExpiresAt(url: string): number | null {
  if (!url) return null
  const hash = url.indexOf('#')
  const clean = hash >= 0 ? url.slice(0, hash) : url
  const q = clean.indexOf('?')
  if (q < 0) return null
  let date = ''
  let expires = ''
  for (const pair of clean.slice(q + 1).split('&')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const key = pair.slice(0, eq)
    if (key === 'X-Amz-Date') date = pair.slice(eq + 1)
    else if (key === 'X-Amz-Expires') expires = pair.slice(eq + 1)
  }
  if (!date || !expires) return null
  // 20260916T074509Z
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(decodeURIComponent(date))
  if (!m) return null
  const issued = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6])
  )
  const seconds = Number(expires)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return issued + seconds * 1000
}

/** 是不是（能解析出到期时间的）签名地址。 */
export function isSignedUrl(url: string): boolean {
  return signedUrlExpiresAt(url) !== null
}

/** 该地址是否已过期（或将在 skewMs 内过期）。非签名地址一律 false。 */
export function signedUrlExpired(url: string, skewMs = REFRESH_SKEW_MS): boolean {
  const at = signedUrlExpiresAt(url)
  if (at === null) return false
  return Date.now() + skewMs >= at
}

/**
 * 全局刷新纪元：页面通过 watch 它来重跑取数。用 useState 是为了跨组件共享
 * （同一页多个区块挂在同一个信号上，一次刷新一起换地址）。
 */
function useEpoch() {
  return useState<number>('media-refresh-epoch', () => 0)
}

/** 当前是否需要刷新（给调试/测试用）。 */
export function mediaRefreshEpoch(): Ref<number> {
  return useEpoch()
}

/**
 * 请求一次"重新取数"。节流 + 预算：媒体一直坏时最多每分钟 3 次，之后静默放弃
 * （刷新救不回来的情况，继续打接口只会更糟）。
 */
export function requestMediaRefresh(reason: string): boolean {
  const now = Date.now()
  if (now - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return false
  if (now - windowStartedAt > REFRESH_WINDOW_MS) {
    windowStartedAt = now
    usedInWindow = 0
  }
  if (usedInWindow >= REFRESH_BUDGET) {
    if (usedInWindow === REFRESH_BUDGET) {
      usedInWindow += 1 // 只提示一次
      console.warn(
        `[media-refresh] 一分钟内已刷新 ${REFRESH_BUDGET} 次（最近原因：${reason}），`
        + '仍有过期地址，已停止自动刷新；手动刷新页面即可恢复。'
      )
    }
    return false
  }
  lastRefreshAt = now
  usedInWindow += 1
  const epoch = useEpoch()
  epoch.value += 1
  return true
}

/**
 * 页面把"重新取数"挂上来：媒体过期或加载失败时会被调用。
 *
 * 用法（返回值随意，Promise.all 的元组也行）：
 *   useMediaAutoRefresh(() => Promise.all([loadContinue(), loadExplore(true)]))
 */
export function useMediaAutoRefresh(loader: () => unknown | Promise<unknown>) {
  const epoch = useEpoch()
  if (import.meta.server) return
  watch(epoch, () => {
    void loader()
  })
}

/** DOM 里是否已有过期的签名媒体（切回标签页时扫一遍用）。 */
export function hasExpiredMediaInDom(root: ParentNode = document): boolean {
  const nodes = root.querySelectorAll<HTMLElement>('img[src], video[src], source[src], a[href]')
  for (const node of nodes) {
    const url = node.getAttribute('src') || node.getAttribute('href') || ''
    if (url && signedUrlExpired(url)) return true
  }
  return false
}
