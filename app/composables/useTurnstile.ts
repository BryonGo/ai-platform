/**
 * Cloudflare Turnstile：按站点验证方式**按需**渲染，并回传 `cf-turnstile-response`。
 *
 * 为什么必须先问 `/pub/verification/config` 而不是无脑渲染：
 * 站点可能把验证方式配成 none / captcha，也可能压根没配 Site Key。那种情况下渲染 widget
 * 只是白占位；反过来，站点要 turnstile 却拿不到 token，提交必被后端拒
 * （「turnstile token 为空（缺少 cf-turnstile-response）」）—— 2026-09-23 线上用户就是被
 * 这条挡在登录页外面：站点配了 turnstile，而前台登录/注册当时**根本没接**，只印了一句
 * 「提交由 Cloudflare Turnstile 保护」的装饰文案。
 *
 * 用法（`<script setup>` 里解构，模板里才能自动解包）：
 *
 *   const { host, required, ready, token, init, reset } = useTurnstile()
 *   onMounted(init)
 *   // 提交时：if (required && !token) 提示「请先完成人机验证」
 *   // 失败后：reset() 换一张
 */
import type { Ref } from 'vue'

/** VerificationConfig 是后端 /pub/verification/config 的响应。 */
export interface VerificationConfig {
  /** none / captcha / turnstile / both */
  mode: string
  /** 仅 turnstile / both 且站点配了 key 时下发 */
  turnstile_site_key?: string
}

// Turnstile 的 window 全局（Cloudflare 脚本注入）。
interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

// 脚本只注入一次：两个页面（登录/注册）各自挂载时不该重复插 <script>。
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const w = window as unknown as { turnstile?: TurnstileApi }
      if (w.turnstile) {
        resolve()
        return
      }
      const id = 'cf-turnstile-js'
      let el = document.getElementById(id) as HTMLScriptElement | null
      if (!el) {
        el = document.createElement('script')
        el.id = id
        // render=explicit：由我们决定何时渲染、渲染到哪个容器（默认的隐式渲染会扫全站）。
        el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        el.async = true
        el.defer = true
        document.head.appendChild(el)
      }
      el.addEventListener('load', () => resolve())
      el.addEventListener('error', () => reject(new Error('Turnstile 脚本加载失败')))
    })
  }
  return scriptPromise
}

export function useTurnstile() {
  /** host 绑到容器元素上；widget 渲染进它里面。 */
  const host: Ref<HTMLElement | null> = ref(null)
  /** required=true 表示本站在提交前必须拿到 token。 */
  const required = ref(false)
  /** ready=true 表示 widget 已经渲染出来，用户可以点它。 */
  const ready = ref(false)
  /** token 是 Cloudflare 回调给的凭据，提交时放进 cf-turnstile-response。 */
  const token = ref('')
  /** error 是非阻塞提示（脚本加载失败等），不挡页面其它内容。 */
  const error = ref('')

  let widgetId: string | null = null

  function render(siteKey: string) {
    const w = window as unknown as { turnstile?: TurnstileApi }
    if (!w.turnstile || !host.value) return
    // 重复渲染会报错（同一个容器只能挂一个 widget）。
    if (widgetId) return
    widgetId = w.turnstile.render(host.value, {
      'sitekey': siteKey,
      'callback': (t: string) => {
        token.value = t
      },
      'expired-callback': () => {
        token.value = ''
      },
      'error-callback': () => {
        token.value = ''
      }
    })
    ready.value = true
  }

  async function init() {
    if (!import.meta.client) return
    try {
      const cfg = await apiRequest<VerificationConfig>('/pub/verification/config')
      const mode = cfg?.mode || 'none'
      const siteKey = cfg?.turnstile_site_key || ''
      required.value = (mode === 'turnstile' || mode === 'both') && !!siteKey
      if (!required.value) return
      await loadScript()
      await nextTick()
      render(siteKey)
    } catch (e: unknown) {
      // 拿不到配置时不静默：该站要人机验证却渲染不出来，用户提交只会收到后端拒绝，
      // 这里先把原因讲清楚。
      error.value = e instanceof Error ? e.message : '人机验证加载失败'
    }
  }

  /** reset 提交失败后换一张新题（Cloudflare 的 token 一次性）。 */
  function reset() {
    token.value = ''
    const w = window as unknown as { turnstile?: TurnstileApi }
    if (w.turnstile && widgetId) w.turnstile.reset(widgetId)
  }

  onBeforeUnmount(() => {
    const w = window as unknown as { turnstile?: TurnstileApi }
    if (w.turnstile && widgetId) w.turnstile.remove(widgetId)
    widgetId = null
  })

  return { host, required, ready, token, error, init, reset }
}
