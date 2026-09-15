// 后端（Go API）当前**正在跑**的版本，供设置页展示。
//
// 为什么必须由服务端代问，而不是浏览器直连：
//  1. 浏览器能访问的 /api/version 是本服务（Nuxt）自己的路由，返回的是**前台**版本；
//     同源代理会把该路径抢给 Nuxt，改不了指向；
//  2. API 的公网入口是白名单（只放行 /api/v1/ 与少量精确路径），浏览器直连会 403；
//  3. 服务端可以用私有内网地址（NUXT_API_BASE_INTERNAL，线上是容器别名
//     http://hougong.avmaker.ai:8201）直接问 API —— 既走内网、Host 又正确。
//
// 失败一律返回空版本而不是抛错：设置页只是展示一行信息，
// 不该因为一次版本探测失败就把整页打崩（这与 useApiVersion 在控制台的处理口径一致）。
type BackendVersion = {
  service: string
  version: string
  commit: string
  buildTime: string
  startedAt: string
  goVersion: string
}

export default defineEventHandler(async (event): Promise<BackendVersion> => {
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')

  const empty: BackendVersion = { service: '', version: '', commit: '', buildTime: '', startedAt: '', goVersion: '' }
  const cfg = useRuntimeConfig(event)
  // 本地 dev 没配 NUXT_API_BASE_INTERNAL 时回落到本机 API：与 nuxt.config 的
  // 代理默认值（API_PROXY || http://127.0.0.1:8201）保持一致，避免两处各写一个默认值。
  const base = String(cfg.apiBaseInternal || 'http://127.0.0.1:8201').replace(/\/+$/, '')

  try {
    const res = await $fetch<Partial<BackendVersion>>(`${base}/api/version`, {
      // 超时要短：这是页面底部的一行信息，不能拖慢设置页的首屏。
      timeout: 3000,
      headers: { accept: 'application/json' }
    })
    return {
      service: String(res?.service || ''),
      version: String(res?.version || ''),
      commit: String(res?.commit || ''),
      buildTime: String(res?.buildTime || ''),
      startedAt: String(res?.startedAt || ''),
      goVersion: String(res?.goVersion || '')
    }
  } catch {
    return empty
  }
})
