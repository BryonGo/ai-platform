/**
 * 卡片视频的「进视口自动播放」。
 *
 * 为什么不是一个 `<video autoplay>` 了事：
 *
 * 1) 每个 `<video>` 都是一路独立解码器 + 一条独立网络流。首页/工具页一个列表里
 *    可能有十几个视频卡，全部同时播会把带宽和解码器一起打满；iOS 同屏解码器还有
 *    硬上限，超了先播的那几路会被系统直接掐成黑框。
 *    → **同一时刻只播最靠前的那一路**（模块级单例，新的一路进来先暂停旧的）。
 * 2) 离屏的卡片不该发请求。`preload="none"` + 进视口才 `play()`，浏览器在此之前
 *    一个字节都不拉；卡片上先用首帧图/封面图占位（见 videoFirstFrameSrc）。
 * 3) 自动播放会被浏览器拒（低电量、省流、无用户手势）。`play()` 返回的是 Promise，
 *    拒绝是**正常路径**而不是错误 —— 这里必须吞掉，退回首帧 + 播放角标。
 * 4) 有用户明确表达「别动」的信号时要让路：prefers-reduced-motion（前庭敏感）与
 *    `saveData`/2g/3g（流量敏感）。这两种情况下卡片停在首帧，不自动播。
 */
import type { Directive, DirectiveBinding } from 'vue'

/** 自动播放的可见度阈值：卡片露出 60% 才算「正在看」。 */
const VISIBLE_RATIO = 0.6

/** 当前正在播放的那一路（全局单例）。 */
let activeEl: HTMLVideoElement | null = null

/** 被指令接管过、需要还原默认行为的元素（卸载时用）。 */
const mounted = new WeakSet<HTMLVideoElement>()

let observer: IntersectionObserver | null = null
let visibilityBound = false

/** 用户偏好：允许自动播放吗（SSR 一律 false）。 */
function autoplayAllowed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  } catch {
    // matchMedia 不可用（极老的浏览器）时按「允许」处理，不因为探测失败就砍功能
  }
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean, effectiveType?: string }
  }).connection
  if (conn?.saveData) return false
  // 2g/3g：手机上这点流量比一段循环预览金贵
  if (conn?.effectiveType && /(^|-)2g$|(^|-)3g$/.test(conn.effectiveType)) return false
  return true
}

function pauseActive() {
  if (!activeEl) return
  try {
    activeEl.pause()
  } catch {
    // 元素已被移除/换源，pause 抛错无需处理
  }
  activeEl = null
}

async function play(el: HTMLVideoElement) {
  if (el === activeEl) return
  // 单实例：先把上一路停下再起新的，避免两路同时拉流
  pauseActive()
  if (!el.paused) {
    activeEl = el
    return
  }
  try {
    // 三个属性必须显式落到 property 上：`muted` 只写 attribute 在某些浏览器里
    // 不参与自动播放判定，静音自动播放会被直接拒绝。
    el.muted = true
    el.loop = true
    el.playsInline = true
    await el.play()
    activeEl = el
  } catch {
    // NotAllowedError（策略拒绝）/ AbortError（切源打断）都属正常：停在首帧即可
    activeEl = null
  }
}

function ensureObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return null
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLVideoElement
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) void play(el)
        else if (el === activeEl) pauseActive()
      }
    }, { threshold: [0, VISIBLE_RATIO] })
  }
  if (!visibilityBound) {
    visibilityBound = true
    // 切到别的标签页时浏览器不会替我们暂停：后台播着既费电又会让回来时的
    // 画面停在莫名其妙的位置，这里主动停，回到前台由观察器重新触发。
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseActive()
    })
  }
  return observer
}

/** 指令入参：`{ enabled?: boolean, immediate?: boolean }`。 */
export interface AutoPlayVideoOptions {
  /** false 时不接管（例如没有视频源的那一支），默认 true。 */
  enabled?: boolean
}

function apply(el: HTMLVideoElement, binding: DirectiveBinding<AutoPlayVideoOptions | undefined>) {
  const enabled = binding.value?.enabled !== false
  if (!enabled || !autoplayAllowed()) {
    el.autoplay = false
    if (el === activeEl) pauseActive()
    return
  }
  el.autoplay = false // 由观察器决定时机，不用属性式自动播放
  el.muted = true
  el.loop = true
  el.playsInline = true
  const io = ensureObserver()
  if (!io) {
    // 没有 IntersectionObserver（老浏览器）：退化成「立刻静音播」，至少不会不播
    void play(el)
    return
  }
  io.observe(el)
  mounted.add(el)
}

function release(el: HTMLVideoElement) {
  observer?.unobserve(el)
  if (el === activeEl) pauseActive()
  mounted.delete(el)
}

/**
 * v-auto-play-video：贴在卡片里的 `<video>` 上即可。
 *
 *   <video v-auto-play-video :src="url" muted loop playsinline preload="none" />
 *
 * 组件卸载、源变化都不用你管；同一时刻只会有一路在播。
 */
export const vAutoPlayVideo: Directive<HTMLVideoElement, AutoPlayVideoOptions | undefined> = {
  mounted: apply,
  updated: apply,
  unmounted: release
}

/**
 * 首帧地址：给 URL 挂一个媒体片段 `#t=0.1`，浏览器会 seek 到 0.1s 并把那一帧画出来。
 *
 * 为什么需要它：视频作品没有独立封面图，卡片在自动播放起效前（还没进视口、
 * 或自动播放被拒）如果什么都不画，就是一块黑框 —— 比一张图还糟。
 * 片段是纯客户端语义，不参与预签名校验，带 query 的限时地址可以直接拼。
 */
export function videoFirstFrameSrc(url: string, at = 0.1): string {
  if (!url || url.includes('#')) return url
  return `${url}#t=${at}`
}

/**
 * 判断一个地址是不是视频（管理员在封面里直接填 mp4 时用）。
 *
 * 只认扩展名：这里没有可靠的 MIME 可查（对象存储的限时地址不带 content-type），
 * 而后端已下发的 kind 才是权威口径 —— 这个函数只服务于「后端没给 kind」的兜底。
 */
export function looksLikeVideoUrl(url: string): boolean {
  if (!url) return false
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)
}
