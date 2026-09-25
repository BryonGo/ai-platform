// 演员库的**纯逻辑**：列表筛选序列化 + 后端原始数据归一化。
//
// 为什么单独放这里（而不是写进 HgActorLibrary / useHougongApi）：
//   · 后端字段还没最终冻结，接口返回可能用 camelCase 也可能用 snake_case、媒体可能给对象
//     也可能给数组。归一化集中在一处、只做「找不到就留空」的宽松映射，界面就不必到处兜底。
//   · 这些是纯函数，可以直接用 `node --test` 覆盖（tests/actor.test.mjs），
//     不必起 Nuxt、不必连后端。
import type {
  ActorDetail,
  ActorFacets,
  ActorFacetOption,
  ActorListQuery,
  ActorMedia,
  ActorMediaSlot,
  ActorMediaSlotKey,
  ActorOutfit,
  ActorTaxonomy,
  ActorVoice,
  ActorItem,
  CharacterItem
} from '~/composables/useHougongApi'

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 任意值 → 字符串（数字按十进制；其余给空串），用于雪花 id / 计数字段。 */
function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/** 取可读字符串并去首尾空白：空串/空白统一视作「没给」。 */
function clean(value: unknown): string {
  return asString(value).trim()
}

/** 正数才当计数用，否则 undefined（0 与非法值都不显示角标）。 */
function toCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

/**
 * 演员结构化标签的**字段顺序与中文名**（筛选面板、创建表单、索引共用一份）。
 *
 * `eraCategory` 必须排在 `era` 前面：前者是时代大类、后者是具体时代，
 * 展示与筛选都按"先大类后细分"读。
 */
export const ACTOR_TAXONOMY_FIELDS = [
  { key: 'eraCategory', label: '时代大类' },
  { key: 'era', label: '时代' },
  { key: 'region', label: '地区' },
  { key: 'gender', label: '性别' },
  { key: 'ageGroup', label: '年龄段' },
  { key: 'species', label: '物种' },
  { key: 'bodyType', label: '体型' },
  { key: 'height', label: '身高' },
  { key: 'skinTone', label: '肤色' },
  { key: 'hairLength', label: '发长' },
  { key: 'hairColor', label: '发色' }
] as const

/** 单值结构化字段的 key（不含多选的气质）。 */
export type ActorTaxonomyFieldKey = typeof ACTOR_TAXONOMY_FIELDS[number]['key']

/** 气质：唯一的多选字段，序列化时按重复键下发。 */
export const ACTOR_TEMPERAMENT_KEY = 'temperament' as const

/** 演员媒体槽位的**展示顺序与中文名**。 */
export const ACTOR_MEDIA_SLOTS = [
  { key: 'headshot', label: '头像' },
  { key: 'portrait', label: '立绘' },
  { key: 'fullBody', label: '全身' },
  { key: 'expressionSheet', label: '表情集' },
  { key: 'threeView', label: '三视图' }
] as const

/** 合法的排序值（后端 sort 枚举）。 */
export const ACTOR_SORT_VALUES = ['recommended', 'newest', 'name'] as const

const ACTOR_QUERY_KEYS = ACTOR_TAXONOMY_FIELDS.map(f => f.key)

/**
 * 演员列表筛选 → 查询串。
 *
 * 约定（必须与后端一致，改这里要两边一起改）：
 *   · 单值维度用 camelCase 键名（eraCategory/ageGroup/bodyType/skinTone/hairLength/hairColor）；
 *     12 个维度里 11 个单值 + 1 个多选，键名与 ACTOR_TAXONOMY_FIELDS 一一对应；
 *   · 气质是**多选**，用 `temperament[]=a&temperament[]=b` —— GoFrame 的 gstr.Parse
 *     只把 `key[]=` 拼成切片；重复的平键 `key=a&key=b` 会被后者覆盖、只剩一个（实测源码）；
 *   · 收藏开关只在 true 时下发 `favorite=1`（沿用资产接口 hidden=1 的口径）；
 *   · 空值一律不发，顺序固定，方便测试与缓存。
 */
export function serializeActorQuery(q: ActorListQuery = {}): string {
  const params = new URLSearchParams()
  const keyword = clean(q.keyword)
  if (keyword) params.set('keyword', keyword)
  for (const key of ACTOR_QUERY_KEYS) {
    const value = clean(q[key])
    if (value) params.set(key, value)
  }
  // 气质去重但保留首次出现的顺序，避免同一个值发两遍。
  const seen = new Set<string>()
  for (const raw of q.temperament || []) {
    const value = clean(raw)
    if (!value || seen.has(value)) continue
    seen.add(value)
    params.append('temperament[]', value)
  }
  if (q.favorite) params.set('favorite', '1')
  if (q.sort && (ACTOR_SORT_VALUES as readonly string[]).includes(q.sort)) params.set('sort', q.sort)
  if (typeof q.page === 'number' && Number.isFinite(q.page) && q.page >= 1) params.set('page', String(Math.floor(q.page)))
  if (typeof q.pageSize === 'number' && Number.isFinite(q.pageSize) && q.pageSize >= 1) params.set('pageSize', String(Math.floor(q.pageSize)))
  return params.toString()
}

/** 结构化标签归一化：未知/空值直接丢弃（界面按「未设置」处理）。 */
export function normalizeActorTaxonomy(raw: unknown): ActorTaxonomy {
  const out: ActorTaxonomy = {}
  if (!isRecord(raw)) return out
  for (const field of ACTOR_TAXONOMY_FIELDS) {
    const value = clean(raw[field.key])
    if (value) out[field.key] = value
  }
  const rawTemperament = raw[ACTOR_TEMPERAMENT_KEY]
  const list = Array.isArray(rawTemperament) ? rawTemperament : (rawTemperament ? [rawTemperament] : [])
  const temperament = list.map(clean).filter(Boolean)
  if (temperament.length) out.temperament = temperament
  return out
}

/** 后端媒体 kind → 前端槽位 key（后端用 snake_case；也兼容前端 camelCase）。 */
const KIND_TO_SLOT: Record<string, ActorMediaSlotKey> = {
  headshot: 'headshot',
  portrait: 'portrait',
  full_body: 'fullBody',
  fullBody: 'fullBody',
  expression_sheet: 'expressionSheet',
  expressionSheet: 'expressionSheet',
  three_view: 'threeView',
  threeView: 'threeView'
}

function normalizeMediaSlot(raw: unknown): ActorMediaSlot | undefined {
  if (!isRecord(raw)) return undefined
  // 注意：actor 媒体的 assetId 是 json:"-"，不下发；character 媒体才有 assetId。
  // 绝不能拿媒体行 id 冒充 assetId（那会指向一个不存在的资产）。
  const assetId = clean(raw.assetId ?? raw.asset_id)
  const url = clean(raw.url ?? raw.imageUrl ?? raw.image_url ?? raw.src)
  if (!url && !assetId) return undefined
  const slot: ActorMediaSlot = { url }
  if (assetId) slot.assetId = assetId
  const width = Number(raw.width)
  const height = Number(raw.height)
  if (Number.isFinite(width) && width > 0) slot.width = width
  if (Number.isFinite(height) && height > 0) slot.height = height
  return slot
}

/**
 * 媒体归一化，两种形态都认：
 *   · 数组（后端 actor/character 媒体）：`[{ kind:'portrait', assetId?, url }, …]`，
 *     kind 用后端口径 `full_body` / `expression_sheet` / `three_view`；
 *   · 对象（前端内部/测试用）：`{ headshot: {assetId,url}, portrait: … }`。
 * kind=voice 的条目不算图片槽位，由音色单独处理。
 */
export function normalizeActorMedia(raw: unknown): ActorMedia {
  const out: ActorMedia = {}
  if (!raw) return out
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isRecord(entry)) continue
      const kind = clean(entry.kind ?? entry.slot ?? entry.key ?? entry.name)
      const key = KIND_TO_SLOT[kind]
      if (!key) continue
      // 同 kind 多张（基础图 / 各造型预览）时按 sortOrder 取第一张作为该槽位主图，
      // 造型预览图另外通过 outfitId 挂到造型上（见 normalizeActorDetail）。
      const slot = normalizeMediaSlot(entry)
      if (slot && !out[key]) out[key] = slot
    }
    return out
  }
  if (isRecord(raw)) {
    for (const item of ACTOR_MEDIA_SLOTS) {
      const slot = normalizeMediaSlot(raw[item.key])
      if (slot) out[item.key] = slot
    }
  }
  return out
}

/**
 * 按 `outfitId` 把媒体行分组：每个造型拿到**它自己的**槽位集合。
 *
 * 后端一条演员媒体只属于一个来源：`outfitId` 为空 = 基础图（全局媒体），
 * 非空 = 该造型自己的图。返回 `Map<outfitId, ActorMedia>`，供 normalizeActorDetail 挂到造型上。
 */
function outfitMediaFromMedia(raw: unknown): Map<string, ActorMedia> {
  const map = new Map<string, ActorMedia>()
  if (!Array.isArray(raw)) return map
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const kind = clean(entry.kind)
    const key = KIND_TO_SLOT[kind]
    if (!key) continue
    const outfitId = clean(entry.outfitId ?? entry.outfit_id)
    if (!outfitId) continue
    const slot = normalizeMediaSlot(entry)
    if (!slot) continue
    let group = map.get(outfitId)
    if (!group) {
      group = {}
      map.set(outfitId, group)
    }
    // 同 kind 多张时取第一张（与全局媒体口径一致）。
    if (!group[key]) group[key] = slot
  }
  return map
}

function normalizeFacetOptions(raw: unknown): ActorFacetOption[] {
  if (!Array.isArray(raw)) return []
  const out: ActorFacetOption[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    let value = ''
    let label: string | undefined
    let count: number | undefined
    if (typeof entry === 'string' || typeof entry === 'number') {
      value = asString(entry).trim()
    } else if (isRecord(entry)) {
      value = clean(entry.value ?? entry.key ?? entry.id ?? entry.code)
      label = clean(entry.label ?? entry.name) || undefined
      const parsed = Number(entry.count)
      count = Number.isFinite(parsed) ? parsed : undefined
    }
    if (!value || seen.has(value)) continue
    seen.add(value)
    const option: ActorFacetOption = { value }
    if (label) option.label = label
    if (count !== undefined) option.count = count
    out.push(option)
  }
  return out
}

/** 把 `{value: count}` 这种「值→数量」映射转成选项数组。 */
function facetOptionsFromCountMap(raw: Raw): ActorFacetOption[] {
  const out: ActorFacetOption[] = []
  for (const [value, count] of Object.entries(raw)) {
    const key = clean(value)
    if (!key) continue
    const parsed = Number(count)
    const option: ActorFacetOption = { value: key }
    if (Number.isFinite(parsed)) option.count = parsed
    out.push(option)
  }
  return out
}

/**
 * 分面归一化，兼容三种后端形态：
 *   · 值→数量的映射（**当前后端**）：`{ era: { ancient: 2, modern: 1 }, … }`
 *   · 选项数组：`{ era: [{value,label,count}] }`
 *   · 数组：`[{ key:'era', values:[…] }]`
 * 未给值的维度直接从结果里缺席 —— 界面只渲染「后端确实提供了选项」的维度，不猜选项。
 */
export function normalizeActorFacets(raw: unknown): ActorFacets {
  const out: ActorFacets = {}
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isRecord(entry)) continue
      const key = clean(entry.key ?? entry.dimension ?? entry.name) as keyof ActorFacets
      if (!key) continue
      const options = normalizeFacetOptions(entry.values ?? entry.options ?? entry.items)
      if (options.length) out[key] = options
    }
    return out
  }
  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const options = Array.isArray(value)
        ? normalizeFacetOptions(value)
        : (isRecord(value) ? facetOptionsFromCountMap(value) : [])
      if (options.length) out[key as keyof ActorFacets] = options
    }
  }
  return out
}

/** 维度 code → 展示名。facets 里同一个 value 出现多次时以第一条为准。 */
export type ActorFacetLabelMap = Map<string, string>

/**
 * 由 facets 建「维度 → (value → label)」映射，供卡片/详情把 taxonomy 的原始 code
 * 换成中文展示名（如 `modern` → 现代）。
 *
 * 只收有 label 的项：后端在"字典缺失/字典外取值"时会给 `label === value`，
 * 那种情况与回退 value 等价，不必进表。
 */
export function buildFacetLabelMap(facets: ActorFacets | null | undefined): Map<string, ActorFacetLabelMap> {
  const out = new Map<string, ActorFacetLabelMap>()
  if (!facets) return out
  for (const [dimension, options] of Object.entries(facets)) {
    const map: ActorFacetLabelMap = new Map()
    for (const option of options || []) {
      const value = clean(option?.value)
      const label = clean(option?.label)
      if (!value || !label || label === value) continue
      if (!map.has(value)) map.set(value, label)
    }
    if (map.size) out.set(dimension, map)
  }
  return out
}

/** 单个维度取值 → 展示名；映射里没有就回退原值（绝不显示空白）。 */
export function facetLabel(
  labels: Map<string, ActorFacetLabelMap> | null | undefined,
  dimension: string,
  value: string
): string {
  const raw = clean(value)
  if (!raw) return ''
  return labels?.get(dimension)?.get(raw) || raw
}

/** `actorTaxonomyChips` 的选项：最多显示几个维度。 */
export const ACTOR_CHIP_LIMIT = 4

/**
 * 卡片/详情标签：按 `ACTOR_TAXONOMY_FIELDS` 顺序取**前 limit 个有值**的维度，
 * 值是 facets 的 label（取不到回退原 code），气质多选每个值各出一个。
 *
 * 为什么限制个数：12 个维度一次铺开会把卡片挤成一堵墙，主维度
 * （时代大类/时代/地区/性别/年龄段…）先显示，其余留给详情页。
 */
export function actorTaxonomyChips(
  taxonomy: ActorTaxonomy | null | undefined,
  labels: Map<string, ActorFacetLabelMap> | null | undefined,
  limit = ACTOR_CHIP_LIMIT
): string[] {
  if (!taxonomy) return []
  const out: string[] = []
  for (const field of ACTOR_TAXONOMY_FIELDS) {
    if (out.length >= limit) break
    const value = clean((taxonomy as Record<string, unknown>)[field.key])
    if (value) out.push(facetLabel(labels, field.key, value))
  }
  for (const value of taxonomy.temperament || []) {
    if (out.length >= limit) break
    const label = facetLabel(labels, ACTOR_TEMPERAMENT_KEY, value)
    if (label) out.push(label)
  }
  return out
}

/* ────────── 卡片媒体（双图块：肖像 + 全身） ────────── */

/**
 * 卡片媒体区的**布局形态**。
 *
 * `pair`  = 肖像 + 全身并排（两张都有时的标准形态）
 * `single`= 只有一张可用（肖像或封面），居中铺满可用空间
 * `empty` = 一张图都没有，显示首字占位
 */
export type ActorCardMediaMode = 'pair' | 'single' | 'empty'

/** 卡片媒体区：左肖像 / 右全身（缺图时为 null）。 */
export interface ActorCardMedia {
  mode: ActorCardMediaMode
  /** 左格：肖像（portrait 优先，其次 headshot）。 */
  portrait: string
  /** 右格：全身（full_body）。 */
  fullBody: string
  /** single/empty 时用作整块底图（封面 / 最后兜底）。 */
  fallback: string
}

/**
 * 挑选卡片媒体。
 *
 * 为什么要**两张分开**而不是一张硬裁：演员的肖像与全身是两种画幅、两种信息，
 * 把竖版立绘裁成 4:3 横图等于两头都看不清（参考站也是双图块）。所以：
 *   · 有全身 → 双图块（肖像优先 portrait 再 headshot；两张都 `object-fit: contain`）；
 *   · 没全身但有肖像/头像 → 肖像居中铺满（`single`）；
 *   · 两张图位都没有 → 退回后端给的 `coverUrl`（仍是单图，不硬裁）；
 *   · 连封面都没有 → `empty`，界面显示首字占位。
 *
 * 纯函数：只吃已归一化的 `ActorMedia` + coverUrl，返回两个 URL 与形态，
 * 界面据此决定 DOM 结构与类名（便于单测，不需要 DOM）。
 */
export function actorCardMedia(
  media: ActorMedia | null | undefined,
  coverUrl?: string
): ActorCardMedia {
  const m = media || {}
  const portrait = clean(m.portrait?.url) || clean(m.headshot?.url)
  const fullBody = clean(m.fullBody?.url)
  const cover = clean(coverUrl)

  if (portrait && fullBody) {
    return { mode: 'pair', portrait, fullBody, fallback: '' }
  }
  if (portrait) {
    return { mode: 'single', portrait, fullBody: '', fallback: '' }
  }
  if (cover) {
    return { mode: 'single', portrait: '', fullBody: '', fallback: cover }
  }
  return { mode: 'empty', portrait: '', fullBody: '', fallback: '' }
}

/** 卡片固定宽高比 4:3（= 参考站 420×315）。写成常量供测试与样式对齐。 */
export const ACTOR_CARD_ASPECT_RATIO = '4 / 3'

/* ────────── 演员资产生成（actor-generation run） ────────── */

/**
 * 生成 role 的**展示顺序与中文名**（与后端 ActorGenRoles 同序）。
 *
 * 4 个 role 由一张源图派生；`voice` 不在其中 —— 它无法从静态图推导，
 * 后端放在 unsupportedRoles 里，前端只如实说明，不给假播放器。
 */
export const ACTOR_GEN_ROLES = [
  { role: 'headshot', label: '头像' },
  { role: 'full_body', label: '全身' },
  { role: 'expression_sheet', label: '表情集' },
  { role: 'three_view', label: '三视图' }
] as const

/** role 的中文名；未知 role 原样返回（不隐藏后端新增的 role）。 */
export function actorGenRoleLabel(role: string): string {
  const raw = clean(role)
  if (!raw) return ''
  return ACTOR_GEN_ROLES.find(item => item.role === raw)?.label || raw
}

/** 不支持的 role → 面向用户的说明（`voice` 是当前唯一的已知项）。 */
export function actorGenUnsupportedReason(role: string): string {
  if (clean(role) === 'voice') return '暂不支持：无法从静态图片推导音色'
  return ''
}

/** run / role 的状态中文名；未知状态原样返回（不假装是终态）。 */
export function actorGenStatusLabel(status: string): string {
  switch (clean(status)) {
    case 'pending': return '排队中'
    case 'running': return '生成中'
    case 'succeeded': return '已完成'
    case 'partial': return '部分完成'
    case 'failed': return '失败'
    case 'skipped': return '已跳过'
    default: return clean(status)
  }
}

/**
 * run 是否已到终态（succeeded / partial / failed）。
 *
 * **只认这三个**：pending / running / 未知状态都不算终态 —— 把未知状态当终态会让轮询
 * 提前停在一个其实还在跑的运行上，界面显示的进度就成了终态假象。
 */
export function actorGenIsTerminal(status: string): boolean {
  const s = clean(status)
  return s === 'succeeded' || s === 'partial' || s === 'failed'
}

/** role 是否需要显示「重试」（仅 failed）。 */
export function actorGenRoleNeedsRetry(status: string): boolean {
  return clean(status) === 'failed'
}

/**
 * 轮询是否还应继续。
 *
 * 三个停止条件：run 到终态、轮询已被停止（组件卸载）、或超过最大轮询次数（兜底，
 * 避免后端一直不收敛时把页面挂在无限请求上）。
 */
export function shouldContinueActorGenPolling(input: {
  status: string
  stopped?: boolean
  attempts: number
  maxAttempts: number
}): boolean {
  if (input.stopped) return false
  if (actorGenIsTerminal(input.status)) return false
  return input.attempts < input.maxAttempts
}

/** run 级进度文案：已完成 role 数 + 成功资产数，全部来自后端真实字段。 */
export function actorGenSummary(run: { status: string, roles?: { status: string }[], successAssetCount?: number }): string {
  const roles = run.roles || []
  const done = roles.filter(r => clean(r.status) === 'succeeded').length
  const total = roles.length
  const assets = Math.max(0, Math.floor(Number(run.successAssetCount) || 0))
  const parts = [`${actorGenStatusLabel(run.status)}`]
  if (total) parts.push(`${done}/${total} 个资产已产出`)
  if (assets) parts.push(`共 ${assets} 张`)
  return parts.join(' · ')
}

/** role 条目归一化（id 一律字符串、assetIds 数组必为数组）。 */
export function normalizeActorGenRole(raw: unknown): ActorGenRole {
  const r = isRecord(raw) ? raw : {}
  const assetIds = Array.isArray(r.assetIds) ? r.assetIds.map(clean).filter(Boolean) : []
  const count = Number(r.assetCount)
  return {
    role: clean(r.role),
    kind: clean(r.kind),
    status: clean(r.status) || 'pending',
    taskId: clean(r.taskId),
    assetIds,
    assetCount: Number.isFinite(count) && count >= 0 ? Math.floor(count) : assetIds.length,
    error: clean(r.error)
  }
}

/** run 归一化：ID 全字符串、roles/unsupportedRoles 必为数组、状态有兜底。 */
export function normalizeActorGenRun(raw: unknown): ActorGenRun | null {
  if (!isRecord(raw)) return null
  const r: Raw = raw
  const id = clean(r.id)
  if (!id) return null
  const rolesRaw = Array.isArray(r.roles) ? r.roles : []
  const unsupportedRaw = Array.isArray(r.unsupportedRoles) ? r.unsupportedRoles : []
  const count = Number(r.successAssetCount)
  return {
    id,
    characterId: clean(r.characterId),
    sourceAssetId: clean(r.sourceAssetId),
    modelId: clean(r.modelId),
    status: clean(r.status) || 'pending',
    roles: rolesRaw.map(normalizeActorGenRole),
    unsupportedRoles: unsupportedRaw
      .filter(isRecord)
      .map((item: Raw) => ({ role: clean(item.role), reason: clean(item.reason) }))
      .filter((item: { role: string }) => !!item.role),
    successAssetCount: Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
    error: clean(r.error),
    createdAt: Number(r.createdAt) || 0,
    updatedAt: Number(r.updatedAt) || 0
  }
}

/** 演员列表条目归一化（id 一律字符串，封面从 media/cover 兜底）。 */
export function normalizeActorItem(raw: unknown): ActorItem {
  const r = isRecord(raw) ? raw : {}
  const media = normalizeActorMedia(r.media)
  const id = clean(r.id ?? r.actorId ?? r.actor_id)
  const directCover = clean(r.coverUrl ?? r.cover_url ?? r.cover ?? r.avatarUrl ?? r.avatar_url)
  const item: ActorItem = {
    id,
    name: clean(r.name ?? r.nickname) || '未命名演员',
    coverUrl: directCover || media.portrait?.url || media.headshot?.url || undefined,
    favorite: r.favorite === true || r.favorited === true
  }
  const imageCount = toCount(r.imageCount ?? r.image_count)
  if (imageCount !== undefined) item.imageCount = imageCount
  const outfitCount = toCount(r.outfitCount ?? r.outfit_count ?? (Array.isArray(r.outfits) ? r.outfits.length : undefined))
  if (outfitCount !== undefined) item.outfitCount = outfitCount
  if (Object.keys(media).length) item.media = media
  const taxonomy = normalizeActorTaxonomy(r.taxonomy ?? r)
  if (Object.keys(taxonomy).length) item.taxonomy = taxonomy
  const generationStatus = clean(r.generationStatus ?? r.generation_status)
  if (generationStatus) item.generationStatus = generationStatus
  const sourceActorId = clean(r.sourceActorId ?? r.source_actor_id)
  if (sourceActorId) item.sourceActorId = sourceActorId
  return item
}

/** 造型归一化（后端字段：id/outfitKey/label/sortOrder；用户角色是 name/current）。 */
export function normalizeActorOutfits(raw: unknown): ActorOutfit[] {
  if (!Array.isArray(raw)) return []
  const out: ActorOutfit[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const id = clean(entry.id ?? entry.outfitId ?? entry.outfit_id)
    const name = clean(entry.name ?? entry.label ?? entry.outfitKey ?? entry.outfit_key)
    if (!id && !name) continue
    const outfit: ActorOutfit = { id: id || name, name: name || '造型' }
    const assetId = clean(entry.assetId ?? entry.asset_id)
    const url = clean(entry.url ?? entry.imageUrl ?? entry.image_url)
    if (assetId) outfit.assetId = assetId
    if (url) outfit.url = url
    if (entry.current === true) outfit.current = true
    out.push(outfit)
  }
  return out
}

/** 音色归一化：后端可能给单个对象，也可能给数组（取第一条）。 */
export function normalizeActorVoice(raw: unknown): ActorVoice | null {
  const entry = Array.isArray(raw) ? raw[0] : raw
  if (!isRecord(entry)) return null
  const url = clean(entry.url ?? entry.audioUrl ?? entry.audio_url)
  const id = clean(entry.id ?? entry.voiceId ?? entry.voice_id)
  const name = clean(entry.name ?? entry.label)
  if (!url && !id && !name) return null
  const voice: ActorVoice = {}
  if (id) voice.id = id
  if (name) voice.name = name
  if (url) voice.url = url
  const assetId = clean(entry.assetId ?? entry.asset_id)
  if (assetId) voice.assetId = assetId
  const duration = Number(entry.durationSeconds ?? entry.duration_seconds ?? entry.duration)
  if (Number.isFinite(duration) && duration > 0) voice.durationSeconds = duration
  return voice
}

/** 演员详情归一化：actor + media + outfits + voice + favorited。 */
export function normalizeActorDetail(raw: unknown): ActorDetail {
  const r = isRecord(raw) ? raw : {}
  const actorRaw = isRecord(r.actor) ? r.actor : r
  const actor = normalizeActorItem(actorRaw)
  const mediaRaw = r.media ?? actorRaw.media
  // 全局媒体只收「没有 outfitId」的那部分：带 outfitId 的属于具体造型，
  // 混进全局会让"选中造型后图不变"（正是本轮要修的问题）。
  const globalMediaRaw = Array.isArray(mediaRaw)
    ? mediaRaw.filter(entry => isRecord(entry) && !clean(entry.outfitId ?? entry.outfit_id))
    : mediaRaw
  const media = normalizeActorMedia(globalMediaRaw)
  if (Object.keys(media).length) actor.media = media

  const outfits = normalizeActorOutfits(r.outfits ?? actorRaw.outfits)
  // 把每个造型自己的槽位挂回去；第一条（或唯一的）图兼作造型预览。
  const outfitMedia = outfitMediaFromMedia(mediaRaw)
  for (const outfit of outfits) {
    const own = outfitMedia.get(outfit.id)
    if (!own) continue
    outfit.media = own
    if (!outfit.url) {
      outfit.url = own.portrait?.url || own.headshot?.url || own.fullBody?.url || ''
    }
  }
  return {
    actor,
    media,
    outfits,
    voice: normalizeActorVoice(r.voice ?? r.voices ?? actorRaw.voice),
    favorited: r.favorited === true || actor.favorite === true
  }
}

/**
 * 生成状态 → 中文；**空/未知一律返回空串**（= 后端没有明确状态，不该假装有）。
 *
 * 流水线还没接，所以"没有状态"是常态；调用方必须先判断返回值非空再显示状态，
 * 否则每个演员都会挂一个并不存在的「待生成」。
 */
export function actorGenerationLabel(status?: string): string {
  switch (clean(status)) {
    case 'generating':
      return '生成中'
    case 'ready':
      return '已就绪'
    case 'failed':
      return '生成失败'
    case 'pending':
      return '待生成'
    default:
      return ''
  }
}

/**
 * 列表卡片是否要显示生成状态角标。
 *
 * **只认后端明确给的 generationStatus**：流水线未接时空值很常见，靠"有媒体没封面"
 * 之类推导出来的状态是编的（曾因此让每个无封面演员都显示「待生成」）。
 */
export function actorShowsGeneration(actor: { generationStatus?: string }): boolean {
  return clean(actor.generationStatus) !== ''
}

/**
 * 用户角色行归一化。
 *
 * id 一律**显式**转字符串（不能只 spread）：后端与 JSON reviver 都把雪花 id 当字符串，
 * 但历史路径/测试里可能是 number，`String(1471022339713873920)` 会先丢末位再转 —— 所以
 * 必须走十进制字符串化（本项目的 id 在到达前端时已经是字符串，这里只做兜底）。
 */
export function normalizeCharacterItem(raw: unknown): CharacterItem {
  const r = isRecord(raw) ? raw : {}
  const id = clean(r.id)
  // 0 在后端是「未指定」哨兵（封面/来源），不能当成有效雪花 id 展示。
  const coverAssetId = clean(r.coverAssetId ?? r.cover_asset_id)
  const sourceActorId = clean(r.sourceActorId ?? r.source_actor_id)
  const item = {
    ...(r as unknown as CharacterItem),
    id,
    coverAssetId: coverAssetId && coverAssetId !== '0' ? coverAssetId : undefined,
    sourceActorId: sourceActorId && sourceActorId !== '0' ? sourceActorId : undefined,
    media: normalizeActorMedia(r.media),
    voice: normalizeCharacterVoices(r.voice ?? r.voices),
    taxonomy: normalizeActorTaxonomy(r.taxonomy)
  }
  return item
}

/**
 * 角色音色归一化：后端下发的 `voice` 可能是数组（当前实现）也可能是单个对象，
 * 统一成 `ActorVoice[]`，展示层只管第一条有没有可播 URL。
 */
export function normalizeCharacterVoices(raw: unknown): ActorVoice[] {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  const out: ActorVoice[] = []
  for (const entry of list) {
    const voice = normalizeActorVoice(entry)
    if (voice) out.push(voice)
  }
  return out
}

/* ────────── 演员详情：画廊三块 / 造型媒体 / 音色 / 切换条 ────────── */

/**
 * 详情画廊三块（对齐参考站：肖像 / 表情 / 转身）。
 *
 * 每块有自己的**回退链**，且回退只在同一份媒体集合内做。
 *
 * 为什么肖像槽优先 `headshot` 而不是 `portrait`：真实导入数据里 `portrait` 是
 * 1.333 的横向双图合成（2304×1728），塞进 116×300 的竖块会缩成很小一条；
 * `headshot` 是 0.75 的竖图，才对应参考站的肖像位。`full_body`（0.563）是不错的
 * 次选；`portrait` 只作为最后兜底。
 *
 * 跨造型回退会拿别的造型的图冒充，所以回退链由调用方在「该造型自己的 media」上应用。
 */
export const ACTOR_GALLERY_BLOCKS = [
  { key: 'portrait', label: '肖像', candidates: ['headshot', 'fullBody', 'portrait'], grow: 116 },
  { key: 'emotive', label: '表情', candidates: ['expressionSheet', 'fullBody', 'headshot'], grow: 66 },
  { key: 'turnaround', label: '转身', candidates: ['threeView', 'fullBody'], grow: 158 }
] as const

/** 画廊整体宽高比（参考站 356×302）。写成常量供样式与测试对齐。 */
export const ACTOR_GALLERY_ASPECT = '356 / 302'

/** 画廊里一块的内容。 */
export interface ActorGalleryBlock {
  key: string
  label: string
  /** 图片地址；空串 = 这块没有图（界面显示占位，不拿别块顶替） */
  url: string
  /** 实际命中的槽位；没命中为空串 */
  slot: ActorMediaSlotKey | ''
  /** 命中槽位的中文名（如「头像」）；没命中为空串 */
  slotLabel: string
  /** 该块的宽度配比（116 : 66 : 158），供样式 flex-grow 使用 */
  grow: number
}

/** 一份媒体集合 → 画廊三块（各自回退，互不顶替）。 */
export function actorGalleryBlocks(media?: ActorMedia | null): ActorGalleryBlock[] {
  const m: ActorMedia = media || {}
  return ACTOR_GALLERY_BLOCKS.map((block) => {
    const hit = block.candidates.find(key => !!m[key as ActorMediaSlotKey]?.url)
    const slot = (hit || '') as ActorMediaSlotKey | ''
    return {
      key: block.key,
      label: block.label,
      url: slot ? (m[slot]?.url || '') : '',
      slot,
      slotLabel: slot ? (ACTOR_MEDIA_SLOTS.find(s => s.key === slot)?.label || '') : '',
      grow: block.grow
    }
  })
}

/**
 * 当前生效的媒体集合。
 *
 * 选中造型 → **只**用该造型自己的 media；未选中 → 全局 media。
 * 造型没有图时返回空集合（界面显示占位），**不回落全局**：回落会把基础图/别的造型
 * 当成这个造型的图，与「切造型图必须跟着换」直接矛盾（不拿别的造型冒充）。
 */
export function actorMediaForOutfit(
  detail: { media?: ActorMedia | null, outfits?: ActorOutfit[] | null } | null | undefined,
  outfitId: string
): ActorMedia {
  const id = clean(outfitId)
  if (!id) return detail?.media || {}
  const outfit = (detail?.outfits || []).find(o => o.id === id)
  return outfit?.media || {}
}

/** 音色状态：要么有可播地址，要么如实说明"登记了但没地址"。 */
export interface ActorVoiceState {
  hasPlayable: boolean
  url: string
  name: string
  /** 登记了但后端没给可播地址的条数 */
  missingUrl: number
}

/** 音色归一：接受单个对象或数组；只有带 url 的才算可播（不放无声播放器）。 */
export function actorVoiceState(voice?: ActorVoice | ActorVoice[] | null): ActorVoiceState {
  const raw = Array.isArray(voice) ? voice : (voice ? [voice] : [])
  const list = raw.filter((v): v is ActorVoice => !!v && typeof v === 'object')
  const playable = list.find(v => clean(v.url))
  return {
    hasPlayable: !!playable,
    url: playable ? clean(playable.url) : '',
    name: playable ? clean(playable.name) : '',
    missingUrl: list.filter(v => !clean(v.url)).length
  }
}

/**
 * 「切换演员」条的候选：**排除当前演员**，最多 limit 个。
 * 把自己也列进"切换到别的演员"里是错的（点了等于原地刷新）。
 */
export function actorStripCandidates(
  items: ActorItem[] | null | undefined,
  currentId: string,
  limit = 12
): ActorItem[] {
  const self = clean(currentId)
  const out: ActorItem[] = []
  for (const item of items || []) {
    if (!item?.id) continue
    if (item.id === self) continue
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}
