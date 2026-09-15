// 版本端点（/api/version）GET 与 HEAD 共用的部分。
//
// 为什么 HEAD 也要单独有一个文件：Nitro 的方法路由是**按文件后缀绑定**的 ——
// 只写 version.get.ts 时，HEAD /api/version 会 404。而监控与探活普遍先发一次 HEAD，
// 于是"服务正常"被误读成"端点不存在"（这条是线上真实踩到的）。
// 契约细节见后端仓库 aicodcms 的 docs/VERSION-CONTRACT.md 第 3 节。
import type { H3Event } from 'h3'

// 进程启动时间：模块加载时求值一次。GET 与 HEAD 共用同一个值，
// 用它分辨"是不是真的换了容器"（滚动发布时 startedAt 变而 version 未变 = 只是重启）。
export const versionStartedAt = new Date().toISOString()

// 禁缓存头部。被 Cloudflare / 浏览器缓存住的话，版本检测会永远返回旧版本 ——
// 而它失效时没有任何报错，只表现为"明明发了新版，用户永远看不到提示"。
export function setVersionCacheHeaders(event: H3Event) {
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')
}
