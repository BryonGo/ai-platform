// 前台（客户端）与 API（服务端）当前**正在跑**的版本，供侧边栏底部并排展示。
//
// 为什么要两个都显示、且不做「是否一致」的判断：两条发布链彼此独立 ——
// 前台是换镜像发布（tag 形如 20260915182431-4b893f7），API 是换宿主二进制发布
// （tag 形如 20260915-71113a3），编号规则与仓库都不同，比相等必然天天报不一致；
// 并排给出来，由人一眼核对「这次是不是只发了半边」。
//
// 两个数据源：
//   · 客户端版本 = /api/version（本服务 Nuxt 运行时返回 NUXT_PUBLIC_BUILD_VERSION）；
//   · 服务端版本 = /api/backend-version（服务端用内网地址代问 API，见该路由注释）。
//
// 为什么带模块级缓存：侧边栏在每个页面都渲染、路由切换会重挂载，
// 没有缓存就会变成「每翻一页打两次接口」。同一会话内只取一次，失败也不重试轰炸。
import { ref } from 'vue'

export type BackendVersionInfo = {
  service: string
  version: string
  commit: string
  buildTime: string
  startedAt: string
  goVersion: string
}

const clientVersion = ref('')
const serverVersion = ref('')
const serverCommit = ref('')
const serverBuildTime = ref('')
const serverStartedAt = ref('')
const loading = ref(false)
const failed = ref(false)

let fetched = false
let inflight: Promise<void> | null = null

async function fetchVersions() {
  loading.value = true
  failed.value = false
  // allSettled：一侧失败不该让另一侧也显示不出来（例如 API 正在滚动重启）。
  const [clientRes, serverRes] = await Promise.allSettled([
    $fetch<{ version?: string }>('/api/version', { query: { t: Date.now() } }),
    $fetch<Partial<BackendVersionInfo>>('/api/backend-version')
  ])
  if (clientRes.status === 'fulfilled') {
    clientVersion.value = String(clientRes.value?.version || '')
  }
  if (serverRes.status === 'fulfilled') {
    serverVersion.value = String(serverRes.value?.version || '')
    serverCommit.value = String(serverRes.value?.commit || '')
    serverBuildTime.value = String(serverRes.value?.buildTime || '')
    serverStartedAt.value = String(serverRes.value?.startedAt || '')
  }
  failed.value = !clientVersion.value && !serverVersion.value
  loading.value = false
  fetched = true
}

/** 取版本（默认同一会话只打一次接口；force=true 用于手动刷新）。 */
export function useAppVersions() {
  async function load(force = false): Promise<void> {
    if (inflight) return inflight
    if (fetched && !force) return
    inflight = fetchVersions().finally(() => {
      inflight = null
    })
    return inflight
  }

  return {
    clientVersion,
    serverVersion,
    serverCommit,
    serverBuildTime,
    serverStartedAt,
    loading,
    failed,
    load
  }
}
