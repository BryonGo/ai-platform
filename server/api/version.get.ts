// 当前**正在运行**的前端版本（用户浏览器里缓存的那份可能是旧的）。
//
// 为什么必须有这个端点：前端产物带内容哈希（chunk 名随构建变化），用户标签页可能挂好几天。
// 线上发了新版本后，旧页面里的 JS 仍然在跑，只有对比"服务端现在的版本"才知道该刷新。
//
// 关键点：
//   · no-store —— 被 Cloudflare / 浏览器缓存住的话，检测会永远返回旧版本（等于没做）；
//   · 版本取运行时 NUXT_PUBLIC_BUILD_VERSION（compose 传镜像 tag），服务器上重启容器即生效，
//     不需要把版本号写进代码里；
//   · startedAt 是进程启动时间，用它一眼分辨"是不是换了容器"（滚动发布排查用）。
const startedAt = new Date().toISOString()

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')
  const config = useRuntimeConfig(event)
  return {
    version: String(config.public.buildVersion || 'dev'),
    startedAt
  }
})
