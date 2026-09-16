/**
 * 媒体自愈的全局接线（仅浏览器）。
 *
 * 两件事，都只在这里做一次，页面不用各自写监听：
 *
 * 1) 捕获阶段监听媒体加载失败：`<img>`/`<video>`/`<source>` 的 error 事件**不冒泡**，
 *    只有捕获阶段能拿到，所以在 document 上加 capture 监听。命中「签名地址 + 已过期」
 *    才触发刷新 —— 不是所有加载失败都该重取数据（用户断网、图被删、CDN 抖动都不该）。
 * 2) 从后台切回来：页面隐藏期间不会加载任何东西，DOM 里可能全是过期地址。
 *    切回来时扫一遍，过期就刷新（这一步覆盖"挂着一小时没动"的经典场景）。
 */
import { hasExpiredMediaInDom, requestMediaRefresh, signedUrlExpired } from '~/composables/useMediaRefresh'

function srcOf(target: EventTarget | null): string {
  const el = target as (HTMLImageElement | HTMLVideoElement | HTMLSourceElement) | null
  if (!el) return ''
  // currentSrc 只有 img/video 有（source 没有）；src 属性三种都有，作为兜底
  const current = (el as HTMLImageElement | HTMLVideoElement).currentSrc
  return current || el.getAttribute('src') || ''
}

export default defineNuxtPlugin(() => {
  if (import.meta.server) return

  document.addEventListener('error', (event) => {
    const url = srcOf(event.target)
    if (!url) return
    // 只有"签名地址且已过期"才自愈：其它失败重取数据也没用，白打接口
    if (!signedUrlExpired(url, 0)) return
    requestMediaRefresh('media-error')
  }, true)

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return
    if (!hasExpiredMediaInDom()) return
    requestMediaRefresh('tab-return')
  })

  // 某些浏览器切回标签页只触发 focus 不触发 visibilitychange（多窗口并排时常见）
  window.addEventListener('focus', () => {
    if (!hasExpiredMediaInDom()) return
    requestMediaRefresh('window-focus')
  })
})
