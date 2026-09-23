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

// loadScript 只注入一次 Cloudflare 的 api.js。
//
// **刻意不带 `?render=explicit`**：后台控制台（aicodcms-vue）线上能正常出题，
// 它的 index.html 引的就是不带参数的 `api.js`，容器用 `class="cf-turnstile"` +
// `data-sitekey`。前台照同一套走，别再自创加载方式 —— 2026-09-23 线上出不来题，
// 就是这里与后台不一致导致的。
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
        el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
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

// turnstileAction 与后台控制台使用同一个 action 名。
const turnstileAction = 'turnstile-spin-v2'

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
  /** siteKey 供模板绑定 `data-sitekey`（与后台同样的声明式写法）。 */
  const siteKey = ref('')

  let widgetId: string | null = null

  // render 显式渲染 widget —— 与后台控制台同一套写法：
  // 动态出现的 `.cf-turnstile` 不会被 api.js 自动渲染，必须自己 render 一次，
  // 并把返回的 widget id 记在元素上（后台也是这么防重复渲染的）。
  function render(key: string) {
    const w = window as unknown as { turnstile?: TurnstileApi }
    const el = host.value
    if (!w.turnstile || !el) return
    // 重复渲染会报错（同一个容器只能挂一个 widget）；已经渲染过就跳过。
    if (el.getAttribute('data-widget-id') || el.querySelector('iframe')) return
    widgetId = w.turnstile.render(el, {
      'sitekey': key,
      'action': turnstileAction,
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
    el.setAttribute('data-widget-id', String(widgetId))
    ready.value = true
  }

  async function init() {
    if (!import.meta.client) return
    try {
      const cfg = await apiRequest<VerificationConfig>('/pub/verification/config')
      const mode = cfg?.mode || 'none'
      siteKey.value = cfg?.turnstile_site_key || ''
      required.value = (mode === 'turnstile' || mode === 'both') && !!siteKey.value
      if (!required.value) return
      await loadScript()
      // 容器由 `v-if="required"` 控制，要等它进 DOM。
      await nextTick()
      render(siteKey.value)
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

  return { host, required, ready, token, error, siteKey, init, reset }
}
