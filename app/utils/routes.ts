// 全站路由规则（纯函数，不依赖 Vue/Nuxt）：旧链接重定向、path 子路由与 query 的互转。
//
// 为什么单独放一个文件：这些规则决定「旧链接会不会变成死链」「刷新/后退能不能回到同一视图」，
// 是最容易回归、也最适合用 node --test 钉住的部分（见 tests/routes.test.mjs）。
// 页面与组件只从这里取规则，不在各自的 setup 里再抄一份判断。

/** 去掉结尾斜杠（保留根路径），同时剥掉 query / hash。 */
export function normalizePath(path: string): string {
  if (!path) return '/'
  const cut = path.split('?')[0]!.split('#')[0]!
  if (cut.length > 1) return cut.replace(/\/+$/, '') || '/'
  return cut
}

/** query 值统一取字符串（数组取第一个；null/undefined → 空串）。 */
export function queryValue(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  return raw == null ? '' : String(raw)
}

/** 只保留非空的字符串 query（重定向时把无关/空参数丢掉，链接保持干净）。 */
export function cleanQuery(query: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!query) return out
  for (const [key, value] of Object.entries(query)) {
    const text = queryValue(value)
    if (text) out[key] = text
  }
  return out
}

export interface RouteTarget {
  path: string
  query?: Record<string, string>
}

/* ───────────── path 子路由：效果 / 钱包 / 资产 / 演员 / 探索 ───────────── */

export type EffectTab = 'all' | 'image' | 'video'

/** 效果页 path → 页签。`/effects` 默认全部。 */
export function effectTabFromPath(path: string): EffectTab {
  const p = normalizePath(path)
  if (p === '/effects/image') return 'image'
  if (p === '/effects/video') return 'video'
  return 'all'
}

/** 页签 → 效果页 path（页签即地址，切页签必须换 URL）。 */
export function effectPath(tab: EffectTab): string {
  if (tab === 'image') return '/effects/image'
  if (tab === 'video') return '/effects/video'
  return '/effects'
}

export type WalletSection = 'transactions' | 'ledger' | 'recharge' | 'orders' | 'membership'

/** 钱包 path → 区块。`/wallet` 默认交易（订单列表）。 */
export function walletSectionFromPath(path: string): WalletSection {
  const p = normalizePath(path)
  if (p === '/wallet/ledger') return 'ledger'
  if (p === '/wallet/recharge') return 'recharge'
  if (p === '/wallet/orders') return 'orders'
  if (p === '/wallet/membership') return 'membership'
  return 'transactions'
}

export function walletPath(section: WalletSection): string {
  if (section === 'ledger') return '/wallet/ledger'
  if (section === 'recharge') return '/wallet/recharge'
  if (section === 'orders') return '/wallet/orders'
  if (section === 'membership') return '/wallet/membership'
  return '/wallet'
}

export type AssetPane = 'library' | 'temp' | 'trash'

/** 资产 path → 页签（演员不再属于资产，没有 actors 页签）。 */
export function assetPaneFromPath(path: string): AssetPane {
  const p = normalizePath(path)
  if (p === '/assets/temp') return 'temp'
  if (p === '/assets/trash') return 'trash'
  return 'library'
}

export function assetPath(pane: AssetPane): string {
  if (pane === 'temp') return '/assets/temp'
  if (pane === 'trash') return '/assets/trash'
  return '/assets'
}

export type ActorSource = 'platform' | 'mine'

/** 演员库 path → 来源（/actors = 平台，/actors/mine = 我的）。 */
export function actorSourceFromPath(path: string): ActorSource {
  return normalizePath(path).startsWith('/actors/mine') ? 'mine' : 'platform'
}

export function actorSourcePath(source: ActorSource): string {
  return source === 'mine' ? '/actors/mine' : '/actors'
}

/** 我的演员详情 / 编辑 / 生成 run 的地址（id 全按字符串，避免雪花 id 精度坑）。 */
export function myActorPath(id: string | number): string {
  return `/actors/mine/${encodeURIComponent(String(id))}`
}

export function myActorEditPath(id: string | number): string {
  return `${myActorPath(id)}/edit`
}

export function myActorGenerationPath(id: string | number, runId: string | number): string {
  return `${myActorPath(id)}/generation/${encodeURIComponent(String(runId))}`
}

/* ───────────── 探索分类：中文标签 ↔ URL slug ───────────── */

export const EXPLORE_CATEGORY_SLUGS = [
  { slug: 'recommend', label: '推荐' },
  { slug: 'anime', label: '动画动漫' },
  { slug: 'film', label: '影视创作' },
  { slug: 'product', label: '产品展示' }
] as const

export type ExploreSlug = typeof EXPLORE_CATEGORY_SLUGS[number]['slug']

export const DEFAULT_EXPLORE_SLUG: ExploreSlug = 'recommend'

/** 中文分类标签 → slug；未知标签返回空串（调用方据此回退/拒绝）。 */
export function exploreSlugOf(label: string): ExploreSlug | '' {
  const hit = EXPLORE_CATEGORY_SLUGS.find(item => item.label === label)
  return hit ? hit.slug : ''
}

/** slug → 中文标签；未知 slug 回退「推荐」（不产生 404 死链）。 */
export function exploreLabelOf(slug: string): string {
  const hit = EXPLORE_CATEGORY_SLUGS.find(item => item.slug === slug)
  return hit ? hit.label : '推荐'
}

/** 是否为合法探索 slug。 */
export function isExploreSlug(slug: string): slug is ExploreSlug {
  return EXPLORE_CATEGORY_SLUGS.some(item => item.slug === slug)
}

/* ───────────── 站内搜索 ───────────── */

/** 搜索地址：词为空时就是 `/search`（不写空 q=）。 */
export function searchPath(keyword: string): string {
  const q = keyword.trim()
  return q ? `/search?q=${encodeURIComponent(q)}` : '/search'
}

/* ───────────── 旧链接 → 新链接 ───────────── */

/**
 * 旧 URL 的新地址。返回 null 表示这个地址不需要重定向。
 *
 * 规则集中在这里（设计文档 §5），页面只负责把结果交给 navigateTo：
 * - `/characters*` → `/actors/mine*`（演员新命名空间）；
 * - `/assets?pane=actors|temp|trash|library` → path 子路由（演员不再属于资产）；
 * - `/wallet?tab=ledger|recharge|orders` → path 子路由；
 * - `/effects?tab=image|video` → path 子路由（旧页签从没写过 URL，属于未雨绸缪）；
 * - `/canvas?id=<id>` → `/canvas/<id>`（保留 ownerType/ownerId）。
 */
export function legacyRedirect(
  pathname: string,
  query?: Record<string, unknown>
): RouteTarget | null {
  const path = normalizePath(pathname)
  const q = query || {}

  // ── 演员旧命名空间 ──
  if (path === '/characters') return { path: '/actors/mine' }
  if (path === '/characters/new') return { path: '/actors/new' }
  const edit = path.match(/^\/characters\/([^/]+)\/edit$/)
  if (edit) return { path: `/actors/mine/${edit[1]}/edit` }
  const detail = path.match(/^\/characters\/([^/]+)$/)
  if (detail) return { path: `/actors/mine/${detail[1]}` }

  // ── 资产旧 ?pane= ──
  if (path === '/assets') {
    const pane = queryValue(q.pane)
    if (!pane) return null
    const rest = { ...q }
    delete rest.pane
    delete rest.source
    const keep = cleanQuery(rest)
    if (pane === 'actors') {
      return { path: queryValue(q.source) === 'mine' ? '/actors/mine' : '/actors', query: keep }
    }
    if (pane === 'temp') return { path: '/assets/temp', query: keep }
    if (pane === 'trash') return { path: '/assets/trash', query: keep }
    if (pane === 'library') return { path: '/assets', query: keep }
    return null
  }

  // ── 钱包旧 ?tab= ──
  if (path === '/wallet') {
    const tab = queryValue(q.tab)
    if (tab === 'ledger') return { path: '/wallet/ledger' }
    if (tab === 'recharge') return { path: '/wallet/recharge' }
    if (tab === 'orders') return { path: '/wallet/orders' }
    return null
  }

  // ── 效果旧 ?tab= ──
  if (path === '/effects') {
    const tab = queryValue(q.tab)
    if (tab === 'image') return { path: '/effects/image' }
    if (tab === 'video') return { path: '/effects/video' }
    return null
  }

  // ── 画布旧 ?id= ──
  if (path === '/canvas') {
    const id = queryValue(q.id)
    if (!id) return null
    const rest = { ...q }
    delete rest.id
    return { path: `/canvas/${encodeURIComponent(id)}`, query: cleanQuery(rest) }
  }

  return null
}
