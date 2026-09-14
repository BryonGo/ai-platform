// 前端版本检测：线上发了新版本，让还挂着旧页面的用户知道并（在安全时机）自动刷新。
//
// 为什么需要：产物是内容哈希的 SSR 包，用户的标签页可能挂几天。线上换版本后，
// 旧页面里的 chunk 仍然在跑，用户"根本不知道"（新功能看不到、老 JS 打新接口还可能报错）。
//
// 三个必须的护栏（都是踩过才知道的）：
//   1. **连续两次一致才认**：滚动发布期间新旧容器同时在线，版本会来回跳，
//      只对比一次会导致反复弹提示/反复刷新。
//   2. **sessionStorage 记账**：刷新后如果 CDN 仍给旧 HTML（版本没变），会陷入死循环；
//      记录"已经为该版本刷过一次"，同一版本不再自动刷，只留手动入口。
//   3. **不打断用户**：输入框有内容 / 有进行中的生成任务 / 光标停在输入控件里 → 只提示不刷。
//
// 状态用 useState（SSR 安全，不会在服务端跨请求串味）；定时器只在客户端启动。

const STABLE_HITS = 2
const SS_RELOADED = 'hg:version:reloaded'
const SS_AUTO_OFF = 'hg:version:auto-off'

/**
 * 注册一个"现在不能自动刷新"的条件（例如：有生成中的任务、输入框有未提交内容）。
 * 由页面在 setup 里调用，随作用域销毁自动注销。
 */
const blockers = new Set<() => boolean>()

export function useUpdateBlocker(fn: () => boolean) {
  blockers.add(fn)
  onScopeDispose(() => blockers.delete(fn))
}

/** 当前有没有正在进行的用户操作（有就只提示、不自动刷新）。 */
function hasActiveWork(): boolean {
  for (const fn of blockers) {
    try {
      if (fn()) return true
    } catch {
      // 单个 blocker 抛错不该让检测整体失效
    }
  }
  if (typeof document !== 'undefined') {
    const el = document.activeElement as HTMLElement | null
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return true
  }
  return false
}

export function useVersionWatcher() {
  // 节拍可配（生产走 nuxt.config 的默认值：60s 轮询 / 15s 最小间隔 / 20s 自动刷新延迟）
  const cfg = useRuntimeConfig().public as {
    versionPollMs?: number
    versionMinIntervalMs?: number
    versionAutoDelayMs?: number
  }
  const POLL_MS = Number(cfg.versionPollMs) || 60_000
  const MIN_INTERVAL_MS = Number(cfg.versionMinIntervalMs) || 15_000
  const AUTO_DELAY_MS = Number(cfg.versionAutoDelayMs) || 20_000

  /** 当前页面正在跑的版本（第一次探测时确立基线）。 */
  const current = useState<string>('hg:ver:current', () => '')
  /** 判定为"已上线的新版本"（空 = 没有）。 */
  const available = useState<string>('hg:ver:available', () => '')
  const pending = useState<string>('hg:ver:pending', () => '')
  const hits = useState<number>('hg:ver:hits', () => 0)
  const lastCheckedAt = useState<number>('hg:ver:checked-at', () => 0)
  const checking = useState<boolean>('hg:ver:checking', () => false)
  /** 提示条是否被用户"稍后"关掉（仅本次会话）。 */
  const dismissed = ref(false)
  /** 自动刷新倒计时（秒）；0 = 未启动。 */
  const countdown = ref(0)
  /** 因为正在操作而暂停自动刷新。 */
  const paused = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let ticker: ReturnType<typeof setInterval> | null = null
  let started = false

  function ss(key: string): string {
    if (typeof sessionStorage === 'undefined') return ''
    return sessionStorage.getItem(key) || ''
  }
  function ssSet(key: string, value: string) {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(key, value)
  }

  /** 探测一次。失败按"没有新版本"处理，绝不打扰用户。 */
  async function check(force = false) {
    if (import.meta.server) return
    const now = Date.now()
    if (!force && now - lastCheckedAt.value < MIN_INTERVAL_MS) return
    lastCheckedAt.value = now
    checking.value = true
    try {
      const res = await $fetch<{ version?: string }>('/api/version', {
        query: { t: now },
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      })
      const version = String(res?.version || '')
      if (!version) return
      if (!current.value) {
        // 第一次探测只确立基线：当前页面就是服务端现在给的版本
        current.value = version
        return
      }
      if (version === current.value || version === 'dev') {
        pending.value = ''
        hits.value = 0
        available.value = ''
        return
      }
      if (version === pending.value) hits.value += 1
      else {
        pending.value = version
        hits.value = 1
      }
      if (hits.value >= STABLE_HITS && available.value !== version) available.value = version
    } catch {
      // 探测失败（离线/5xx）：什么都不做
    } finally {
      checking.value = false
    }
  }

  /** 同一版本本次会话已经刷过一次：不再自动刷，避免"刷新 → 还是旧版 → 再刷新"的死循环。 */
  function autoReloadAllowed(version: string): boolean {
    return ss(SS_RELOADED) !== version && ss(SS_AUTO_OFF) !== version
  }

  function reload() {
    if (available.value) ssSet(SS_RELOADED, available.value)
    window.location.reload()
  }

  /** 用户点"稍后"：本次会话不再自动刷这个版本（下次进站仍会提示）。 */
  function dismiss() {
    if (available.value) ssSet(SS_AUTO_OFF, available.value)
    dismissed.value = true
    stopCountdown()
  }

  function stopCountdown() {
    countdown.value = 0
    paused.value = false
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  function armCountdown() {
    if (ticker || !available.value) return
    countdown.value = Math.round(AUTO_DELAY_MS / 1000)
    ticker = setInterval(() => {
      const version = available.value
      if (!version || dismissed.value || !autoReloadAllowed(version)) {
        stopCountdown()
        return
      }
      if (hasActiveWork()) {
        // 用户正在输入/生成：暂停倒计时，等空下来再继续
        paused.value = true
        return
      }
      paused.value = false
      countdown.value -= 1
      if (countdown.value <= 0) {
        stopCountdown()
        reload()
      }
    }, 1000)
  }

  function start() {
    if (started || import.meta.server) return
    started = true
    void check(true)
    timer = setInterval(() => void check(), POLL_MS)
    // 回到标签页 / 重新聚焦时立刻补一次：用户"切回来才发现变了"是最常见的场景
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void check()
    })
    window.addEventListener('focus', () => void check())
    onScopeDispose(() => {
      if (timer) clearInterval(timer)
      stopCountdown()
    })
  }

  // 判定出新版本 → 起提示条与倒计时（只有允许自动刷新的版本才倒计时）
  watch(available, (version) => {
    if (!version) {
      stopCountdown()
      return
    }
    dismissed.value = false
    if (autoReloadAllowed(version)) armCountdown()
  })

  return {
    current,
    available,
    checking,
    dismissed,
    countdown,
    paused,
    lastCheckedAt,
    start,
    check,
    reload,
    dismiss
  }
}
