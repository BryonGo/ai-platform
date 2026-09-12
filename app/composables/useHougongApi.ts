// 后宫真实后端 API（go-sdk /api/v1/hougong + account/credit）。
import { apiBase, apiRequest, useAuthSession } from './useApi'

export interface AuthResult {
  user_id: number
  token: string
}

export interface AppearanceItem {
  label: string
  value: string
}

export interface OutfitItem {
  id: number
  name: string
  note: string
  swatch: string
  current: boolean
}

export interface CharacterItem {
  id: number
  name: string
  alias: string
  age: string
  ageVerified: boolean
  tagline: string
  traits: string[]
  appearance: AppearanceItem[]
  outfits: OutfitItem[]
  workCount: number
  /** 角色封面地址（presign）：手动指定优先，否则取最近作品产物 */
  coverUrl?: string
  /** 手动指定的封面素材 id（0/缺省 = 按最近作品自动） */
  coverAssetId?: number
}

// CharacterInput 角色创建/更新输入（对齐后端 data.CharacterInput）。
export interface CharacterInput {
  name: string
  alias?: string
  age?: string
  ageVerified: boolean
  tagline?: string
  traits?: string[]
  appearance?: AppearanceItem[]
  outfits?: { name: string, note?: string, swatch?: string }[]
}

export interface WorkItem {
  id: number
  title: string
  characterId: number
  sessionId?: number
  taskId?: number
  assetId: number
  imageUrl?: string
  kind: string
  status: string
  favorite: boolean
  createdAt: number
}

export interface StoryItem {
  id: number
  title: string
  synopsis: string
  characterIds: number[]
  relation: { from: string, to: string, note: string }[]
  settings: { name: string, note: string }[]
  clips: { workId: number, order: number, note: string }[]
  updatedAt: number
}

export interface CatalogSampling {
  steps: number
  stepsMin: number
  stepsMax: number
  cfgMin: number
  cfgMax: number
  cfgStep: number
  samplers: string[]
  schedulers: string[]
}

export interface CatalogItem {
  id: string
  type: 'model' | 'lora'
  name: string
  family: string
  /** 后台维护的一句话简介；未配置时后端不下发该字段 */
  summary?: string
  fileName?: string
  cover?: string
  available: boolean
  selectable: boolean
  /** 不可用原因（后台停用原文 / 文件未就绪 / 家族无工作流）；可用时后端不下发 */
  unavailableReason?: string
  weight?: { default: number, min: number, max: number }
  sampling?: { steps: number, sampler: string, scheduler: string, cfg: number }
}

export interface CloudModel {
  id: string
  name: string
  author: string
  /** 一句话简介（后台可覆盖）；未配置时为空 */
  excerpt?: string
  /** 图标/封面（后台可覆盖）；未配置时为空 */
  cover?: string
  state: string
  engine: 'seedream' | 'xiaoyi' | string
  endpoint: string
  /** 不可用原因（未就绪 / 后台停用原文）；仅 includeUnavailable=1 口径下才有值 */
  unavailableReason?: string
  capabilities: {
    parameters: { quality: string, ratios: { ratio: string, size: string }[] }[]
    default: { quality: string, ratio: string }
    maxInputs: number
    maxOutputs: number
  }
  pricing: {
    includedInputs: number
    extraInputBalance: number
    qualities: { quality: string, balance: number }[]
  }
  output: { format: string }
}

export interface VideoDurationOption {
  seconds: number
  frames: number
  actualSeconds: number
}

/** 视频画幅 → 输出尺寸（来自 comfy85 ResolutionSelector 实测：0.4MP、32 对齐） */
export interface VideoResolution {
  ratio: string
  label: string
  width: number
  height: number
}

export interface CatalogVideoModel {
  id: string
  name: string
  engine: string
  workflow: string
  /** 云端 provider 名（comfy 模型为空）。engine 决定执行器，provider 决定接入点。 */
  provider?: string
  /** 云端分辨率档（如 720p）；comfy 模型为空（它用 width/height）。 */
  resolution?: string
  steps: number
  frameRate: number
  length: number
  width: number
  height: number
  /** 时长约束（秒）+ 档位表，来自后端 24fps+17k+5 吸附计算 */
  minSeconds: number
  maxSeconds: number
  defaultSeconds: number
  durations: VideoDurationOption[]
  resolutions: VideoResolution[]
  note?: string
  available: boolean
  selectable: boolean
  /** 不可用原因（未就绪 / 后台停用原文）；可用时后端不下发 */
  unavailableReason?: string
}

/** 站点报价表：键为画幅（如 "1:1"），值为积分单价；来自 billing_rate_version 最新 revision */
export interface CatalogRates {
  product: string
  image: Record<string, number>
  video: Record<string, number>
  extend: Record<string, number>
  /**
   * 视频「按时长计价」的可选维度：画幅 → 秒数 → 积分。
   * 仅当运营在后台配了 i2v:<画幅>:<秒> 报价才有条目；
   * 该秒数没配时回落到 video[画幅]（按画幅单档）。
   */
  videoByDuration?: Record<string, Record<string, number>>
}

export interface Catalog {
  version: number
  sampling: CatalogSampling
  models: CatalogItem[]
  loras: CatalogItem[]
  videoModels: CatalogVideoModel[]
  cloudModels: CloudModel[]
  rates?: CatalogRates
}

export interface HougongTask {
  id: number | string
  type: string
  status: string
  progress?: number
  errorCode?: string
  billedCredits?: number
  snapshot?: Record<string, unknown>
  outputAssets?: string[]
  createdAt?: number
  finishedAt?: number
}

export interface WorkCreateInput {
  characterId?: number | string
  sessionId?: number | string
  taskId?: number | string
  assetId?: number | string
  kind?: string
  title?: string
}

export interface SessionItem {
  id: string
  title: string
  state: string
  current: boolean
  latestTask: { id: string, status: string, assets: string[], works: unknown[], updatedAt: number } | null
  createdAt: number
  lastActivityAt: number
}

export interface SnippetCategory {
  key: string
  labels: { chinese: string, english: string }
  position: number
  subcategories: { key: string, labels: { chinese: string, english: string }, position: number }[]
}

export interface SnippetItem {
  id: string
  category: string
  subcategory: string
  labels: { chinese: string, english: string }
  prompt: { chinese: string, english: string }
  preview: string | null
}

export interface AssetItem {
  id: string
  origin: string
  status: string
  mimeType: string
  bytes: number
  width: number
  height: number
  url: string
  createdAt: number
  hidden: boolean
}

export interface AssetChoice {
  asset: AssetItem
  generation: { taskId: string } | null
}

/** 导出任务（对齐 api/v1/platform/export.go 的 ExportTaskItem）。 */
export interface ExportTask {
  id: string
  kind: string
  /** queued / running / succeeded / failed */
  status: string
  sourceKind: string
  sourceId: string
  total: number
  done: number
  failed: number
  /** 产物 ZIP 的资产 id；未成功时为空 */
  resultAssetId: string
  /** 产物限时下载地址；未成功时为空 */
  downloadUrl: string
  errorCode: string
  errorMessage: string
  startedAt: number
  finishedAt: number
  createdAt: number
  /** 未能进入包内的条目（路径与原因）——必须展示，避免「少了文件没人知道」 */
  failures?: { path: string, assetId?: string, reason: string }[]
}

export interface PublicationWork {
  id: string
  title: string
  state: string
  contentRating: string
  coverUrl: string | null
  tags: PlatformTag[]
  stats: { likes: number, favorites: number, comments: number, remixes: number }
  publishedAt: number
}

export interface PublicationPost {
  id: string
  title: string
  state: string
  content: string
  assets: AssetItem[]
  tags: PlatformTag[]
  stats: { likes: number, favorites: number, comments: number }
  publishedAt: number
}

export interface PublicationComment {
  id: string
  targetKind: string
  targetId: string
  content: string
  likes: number
  createdAt: number
}

export interface PlatformTag {
  id: string
  key: string
  name: string
  aliases: string[]
  active: boolean
  priority: number
}

export interface Invite {
  code: string
  invited: number
  completed: number
  pending: number
  earnedCredits: number
  friendCredits: number
  rewardCredits: number
}

export interface EconomyWallet {
  credits: number
  balanceCents: number
  nextExpiry: string
}

export interface WalletLedgerItem {
  id: string
  asset: string // credit / balance
  amount: number
  kind: string // daily/invite/generation/refund/publish/member/topup/adjust
  expiresAt: string
  createdAt: string
}

export interface Membership {
  purchaseId: string
  tier: string
  choice: string
  startedAt: string
  expiresAt: string
}

export interface Purchase {
  id: string
  kind: string
  state: string
  priceCents: number
  credits: number
  balanceCents: number
  months: number | null
  tier: string
  choice: string
  paymentUrl: string
  paidAt: string
  createdAt: string
}

export interface Transaction {
  id: string
  type: 'purchase' | 'ledger'
  category: string
  state?: string
  priceCents?: number
  credits?: number
  balanceCents?: number
  tier?: string
  amount?: number
  kind?: string
  expiresAt?: string
  createdAt: string
}

export interface CreatorWork {
  id: string
  title: string
  imageUrl: string
}

export interface Creator {
  state: string // '' | pending/approved/rejected/revoked
  eligible: boolean
  inviteCredits: number
  requiredImages: number
  publishedImages: number
  reward: { images: number, limit: number, credits: number, perImageCredits: number, expiresAt: string }
  direction: string
  statement: string
  agreedAt: string
  submittedAt: string
  reviewedAt: string
  reason: string
  works: CreatorWork[]
  selectableWorks: CreatorWork[]
}

export interface ModelCreator {
  state: string
  platform: string
  profileUrl: string
  resourceUrls: string[]
  agreedAt: string
  submittedAt: string
  reviewedAt: string
  reason: string
}

export interface NotificationItem {
  id: string
  kind: string
  message: string
  readAt: string // '' = unread
  createdAt: string
  target: { kind: string, id: string }
}

// ── 模型（model）类型 ──
export interface ModelWeight { default: number, min: number, max: number }
export interface ModelStats { works: number, comments: number, heat: number }
export interface ModelTag { key: string, labels: { chinese: string, english: string }, aliases: string[] }
export interface ModelSampling { steps?: number, sampler?: string, scheduler?: string, cfg?: number }
export interface ModelFile { name: string, bytes: number, available: boolean }
export interface ModelRuntime { engine: string, fileName?: string }
export interface ModelListItem {
  id: string
  type: string // model / lora
  name: string
  author: string
  owner?: { id: string, name: string }
  source?: string
  family: string
  category: string
  tags: string[]
  excerpt: string
  cover: string | null
  stats: ModelStats
  available: boolean
  selectable: boolean
  unavailableReason: string | null
  safety: string
  triggers: string[]
  weight: ModelWeight | null
  state?: string
  updatedAt: number
  engine: string
}

export interface ModelDetail extends ModelListItem {
  description: string
  compatible: ModelListItem[]
  sampling: { steps: number, sampler: string, scheduler: string, cfg: number } | null
}

export interface ModelFacets {
  families: string[]
  loraCategories: string[]
}

export interface MineListItem {
  id: string
  title: string
  type: string
  family: string
  category: string
  excerpt: string
  safety: string
  state: string
  updatedAt: number
  cover: string | null
  viewer: { edit: boolean, submit: boolean, withdraw: boolean, hide: boolean, remove: boolean }
}

export interface MineModel extends MineListItem {
  owner: { id: string, name: string }
  source: string
  sourceUrl: string | null
  description: string
  triggers: string[]
  weight: ModelWeight | null
  sampling: ModelSampling | null
  images: { id: string, url: string, position: number }[]
  runtime: ModelRuntime
  file: ModelFile | null
  reason: string | null
}

export interface ModelDraftInput {
  source: 'original' | 'import'
  sourceUrl?: string
  title: string
  type: 'model' | 'lora'
  family: string
  category: string
  description?: string
  triggers?: string[]
  weight?: number
  sampling?: { steps?: number, sampler?: string, scheduler?: string, cfg?: number }
  imageIds?: string[]
  safety: 'safe' | 'adult'
}

export function useHougongApi() {
  const session = useAuthSession()

  async function login(account: string, password: string): Promise<AuthResult> {
    const data = await apiRequest<AuthResult>('/account/auth/login', {
      method: 'POST',
      body: { account, password }
    })
    session.save(data.token, data.user_id)
    return data
  }

  // 游客一键登录：后端自动建临时账号（无密码）返回 token，适合开发/快速体验。
  async function guestLogin(): Promise<AuthResult> {
    const data = await apiRequest<AuthResult>('/account/auth/guest', {
      method: 'POST',
      body: {}
    })
    session.save(data.token, data.user_id)
    return data
  }

  async function register(input: {
    username: string
    email: string
    password: string
    nickname: string
  }): Promise<AuthResult> {
    const data = await apiRequest<AuthResult>('/account/auth/register', {
      method: 'POST',
      body: { ...input, agree_version: '2026.08' }
    })
    session.save(data.token, data.user_id)
    return data
  }

  function logout() {
    session.clear()
  }

  async function listCharacters(): Promise<CharacterItem[]> {
    const res = await apiRequest<{ list: CharacterItem[] }>('/hougong/characters')
    return res.list || []
  }

  async function getCharacter(id: number): Promise<CharacterItem> {
    return apiRequest<CharacterItem>(`/hougong/characters/${id}`)
  }

  // 角色创建/更新（字段对齐后端 CharacterInputData；更新时空字符串表示「不修改」）
  async function createCharacter(input: CharacterInput): Promise<CharacterItem> {
    return apiRequest<CharacterItem>('/hougong/characters', { method: 'POST', body: input })
  }

  async function updateCharacter(id: number | string, input: CharacterInput): Promise<CharacterItem> {
    return apiRequest<CharacterItem>(`/hougong/characters/${id}`, { method: 'PUT', body: input })
  }

  // 指定 / 清除角色封面（assetId=0 恢复自动：取最近作品产物），返回更新后的角色。
  async function setCharacterCover(id: number | string, assetId: number | string): Promise<CharacterItem> {
    return apiRequest<CharacterItem>(`/hougong/characters/${id}/cover`, {
      method: 'PUT',
      body: { assetId: Number(assetId) || 0 }
    })
  }

  // 删除角色：后端软删；该角色名下还有作品时会拒绝（先删作品）。
  async function deleteCharacter(id: number | string): Promise<void> {
    await apiRequest(`/hougong/characters/${id}`, { method: 'DELETE' })
  }

  async function listWorks(): Promise<WorkItem[]> {
    const res = await apiRequest<{ list: WorkItem[] }>('/hougong/works')
    return res.list || []
  }

  // 后宫作品详情/收藏（与 /platform/work 的发布作品区分开）
  async function getHougongWork(id: string | number): Promise<WorkItem> {
    return apiRequest<WorkItem>(`/hougong/works/${id}`)
  }

  async function favoriteHougongWork(id: string | number, favorite: boolean): Promise<WorkItem> {
    return apiRequest<WorkItem>(`/hougong/works/${id}/favorite`, { method: 'POST', body: { favorite } })
  }

  async function deleteHougongWork(id: string | number): Promise<void> {
    await apiRequest(`/hougong/works/${id}`, { method: 'DELETE' })
  }

  async function listStories(): Promise<StoryItem[]> {
    const res = await apiRequest<{ list: StoryItem[] }>('/hougong/stories')
    return res.list || []
  }

  async function getHougongStory(id: string | number): Promise<StoryItem> {
    return apiRequest<StoryItem>(`/hougong/stories/${id}`)
  }

  // 整理片段：全量替换（按数组顺序重排 order；空数组 = 清空片段）
  async function updateStoryClips(id: string | number, clips: { workId: number, order: number, note: string }[]): Promise<StoryItem> {
    return apiRequest<StoryItem>(`/hougong/stories/${id}/clips`, { method: 'PUT', body: { clips } })
  }

  async function listTasks(): Promise<HougongTask[]> {
    const res = await apiRequest<{ list: HougongTask[] }>('/hougong/tasks')
    return res.list || []
  }

  async function wallet(): Promise<{ balance: number, holds: number }> {
    return apiRequest('/account/credits')
  }

  /**
   * 能力目录。
   *
   * includeUnavailable=false（默认）：不可用条目**不下发**，模型面板只会看到能用的。
   * true：不可用条目也下发并带 `unavailableReason`，由 UI 自己渲染灰态 +
   * 「为什么不可用」。这是产品口径，切换前先确认前端面板能承载灰态列表。
   */
  async function getCatalog(includeUnavailable = false): Promise<Catalog> {
    const q = includeUnavailable ? '?includeUnavailable=1' : ''
    return apiRequest<Catalog>(`/platform/catalog${q}`)
  }

  async function optimizePrompt(prompt: string, modelId: string): Promise<string> {
    const r = await apiRequest<{ prompt: string }>('/hougong/prompt/optimize', { method: 'POST', body: { prompt, modelId } })
    return r.prompt
  }

  async function translatePrompt(prompt: string, target = 'en'): Promise<string> {
    const r = await apiRequest<{ prompt: string }>('/hougong/prompt/translate', { method: 'POST', body: { prompt, target } })
    return r.prompt
  }

  // 上传资产。权威入口是 POST /platform/asset（媒体域唯一权威）；
  // /hougong/media 已降级为兼容别名，两侧共用同一份实现，但**响应字段不同**：
  // 权威返回 id / mimeType，别名返回 mediaAssetId / mime，故这里统一成 assetId 给调用方。
  async function uploadAsset(file: File): Promise<{ assetId: string, width: number, height: number, mimeType: string }> {
    const form = new FormData()
    form.append('file', file)
    const r = await apiRequest<{ id: string, width: number, height: number, mimeType: string }>(
      '/platform/asset', { method: 'POST', form }
    )
    return { assetId: r.id, width: r.width, height: r.height, mimeType: r.mimeType }
  }

  async function createTask(input: {
    clientKey: string
    type: string
    prompt: string
    negativePrompt?: string
    ratio?: string
    width?: number
    height?: number
    count?: number
    durationSeconds?: number
    seed?: number
    sampling?: { steps: number, sampler: string, scheduler: string, cfg: number, denoise?: number }
    loras?: { name: string, weight: number }[]
    modelId?: string
    quality?: string
    engine?: string
    characterId?: string
    refAssetIds?: string[]
  }): Promise<HougongTask> {
    return apiRequest<HougongTask>('/hougong/tasks', { method: 'POST', body: input })
  }

  async function getTask(id: number | string): Promise<HougongTask> {
    return apiRequest<HougongTask>(`/hougong/tasks/${id}`)
  }

  async function cancelTask(id: number | string): Promise<{ status: string }> {
    return apiRequest(`/hougong/tasks/${id}/cancel`, { method: 'POST' })
  }

  // 重试任务。后端语义是「**新建一个任务并重新计费**」，不是原地重跑：
  // 传新 clientKey 做幂等，snapshot 沿用旧任务；只有终态任务可重试（否则 409）。
  // 返回的是**新任务**的 id，调用方要拿它去轮询，而不是继续轮询旧 id。
  async function retryTask(id: number | string, clientKey: string): Promise<{ id: number, status: string }> {
    return apiRequest(`/hougong/tasks/${id}/retry`, { method: 'POST', body: { clientKey } })
  }

  async function createWork(input: WorkCreateInput): Promise<WorkItem> {
    return apiRequest<WorkItem>('/hougong/works', { method: 'POST', body: input })
  }

  // ── 生成会话（workspace）──
  async function listSessions(page = 1, pageSize = 20): Promise<SessionItem[]> {
    const res = await apiRequest<{ items: SessionItem[] }>(`/platform/session?page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }
  async function createSession(title?: string): Promise<SessionItem> {
    const body = title ? { title } : {}
    return apiRequest<SessionItem>('/platform/session', { method: 'POST', body })
  }
  async function getSession(id: string): Promise<SessionItem> {
    return apiRequest<SessionItem>(`/platform/session/${id}`)
  }
  async function renameSession(id: string, title: string): Promise<SessionItem> {
    return apiRequest<SessionItem>(`/platform/session/${id}/rename`, { method: 'POST', body: { title } })
  }
  async function archiveSession(id: string): Promise<SessionItem> {
    return apiRequest<SessionItem>(`/platform/session/${id}/archive`, { method: 'POST' })
  }
  async function listSessionTasks(id: string, page = 1, pageSize = 20): Promise<HougongTask[]> {
    const res = await apiRequest<{ items: HougongTask[] }>(`/platform/session/${id}/tasks?page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }

  // ── 快捷词（snippet）──
  async function snippetCategories(): Promise<SnippetCategory[]> {
    const res = await apiRequest<{ categories: SnippetCategory[] }>('/platform/snippet/categories')
    return res.categories || []
  }
  async function snippetList(input: { category: string, subcategory?: string, query?: string, cursor?: string, limit?: number }): Promise<{ items: SnippetItem[], nextCursor?: string }> {
    const q = new URLSearchParams()
    q.set('category', input.category)
    if (input.subcategory) q.set('subcategory', input.subcategory)
    if (input.query) q.set('query', input.query)
    if (input.cursor) q.set('cursor', input.cursor)
    if (input.limit) q.set('limit', String(input.limit))
    return apiRequest(`/platform/snippet?${q.toString()}`)
  }

  // ── 资产库（asset）──
  async function listAssets(hidden = false, page = 1, pageSize = 100): Promise<AssetItem[]> {
    const res = await apiRequest<{ items: AssetItem[] }>(`/platform/asset?hidden=${hidden ? 1 : 0}&page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }
  async function removeAsset(id: string): Promise<void> {
    await apiRequest(`/platform/asset/${id}`, { method: 'DELETE' })
  }
  async function setAssetHidden(id: string, hidden: boolean): Promise<void> {
    await apiRequest(`/platform/asset/${id}/hidden`, { method: 'POST', body: { hidden } })
  }
  async function assetSelect(page = 1, pageSize = 20): Promise<AssetChoice[]> {
    const res = await apiRequest<{ items: AssetChoice[] }>(`/platform/asset/select?page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }
  async function assetSelectByIds(ids: string[]): Promise<AssetChoice[]> {
    const res = await apiRequest<{ items: AssetChoice[] }>('/platform/asset/selectByIds', { method: 'POST', body: { ids } })
    return res.items || []
  }
  /**
   * assetDownloadUrl 取资产的原图下载地址（签发限时 URL）。
   * 与列表里的 url 区别：列表 url 是展示用（可能已转码），这里是原图下载入口。
   */
  async function assetDownloadUrl(id: string): Promise<{ url: string, expiresAt: string }> {
    return apiRequest(`/platform/asset/${id}/download`)
  }

  // ── 导出（工程包）──
  // 把一组资产按 relPath 打成 ZIP，**异步**执行：创建后轮询 getExport 到 succeeded，
  // 再取 downloadUrl。failures 必须展示——工程回填最怕「少了一个文件但没人知道」。
  async function createExport(
    items: { assetId: string, relPath?: string }[],
    sourceKind?: string,
    sourceId?: string
  ): Promise<{ exportId: string }> {
    return apiRequest('/platform/export', {
      method: 'POST',
      body: { items, ...(sourceKind ? { sourceKind } : {}), ...(sourceId ? { sourceId } : {}) }
    })
  }
  async function getExport(id: string): Promise<{ found: boolean, task?: ExportTask }> {
    return apiRequest(`/platform/export/${id}`)
  }
  async function listExports(page = 1, pageSize = 20): Promise<ExportTask[]> {
    const res = await apiRequest<{ list: ExportTask[] }>(`/platform/export?page=${page}&pageSize=${pageSize}`)
    return res.list || []
  }

  // ── 发布（work/post/comment/tag/report）──
  async function listWorksFeed(page = 1, pageSize = 20): Promise<PublicationWork[]> {
    const res = await apiRequest<{ items: PublicationWork[] }>(`/platform/work?page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }
  async function getWork(id: string): Promise<PublicationWork> {
    return apiRequest(`/platform/work/${id}`)
  }
  async function listPosts(page = 1, pageSize = 20): Promise<PublicationPost[]> {
    const res = await apiRequest<{ items: PublicationPost[] }>(`/platform/post?page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }
  async function listComments(targetKind: string, targetId: string): Promise<PublicationComment[]> {
    const res = await apiRequest<{ items: PublicationComment[] }>(`/platform/comment?targetKind=${targetKind}&targetId=${targetId}`)
    return res.items || []
  }
  async function createComment(input: { targetKind: string, targetId: string, content: string, parentId?: string }): Promise<PublicationComment> {
    return apiRequest('/platform/comment', { method: 'POST', body: input })
  }
  async function react(input: { targetKind: string, targetId: string, kind: string }): Promise<void> {
    await apiRequest('/platform/interaction/reaction', { method: 'POST', body: input })
  }
  async function searchTags(query: string): Promise<PlatformTag[]> {
    return apiRequest(`/platform/tag/search?query=${encodeURIComponent(query)}`)
  }
  /** 创建标签（POST /platform/tag）。同名标签后端按既有实现幂等返回。 */
  async function createTag(name: string): Promise<PlatformTag> {
    return apiRequest<PlatformTag>('/platform/tag', { method: 'POST', body: { name } })
  }
  async function report(input: { targetKind: string, targetId: string, reason: string, detail?: string }): Promise<void> {
    await apiRequest('/platform/report', { method: 'POST', body: input })
  }

  // ── 经济（wallet/invite/membership/checkout/transaction/creator）──
  async function walletBalance(): Promise<EconomyWallet> {
    return apiRequest<EconomyWallet>('/platform/economy/wallet')
  }
  async function claimDaily(): Promise<EconomyWallet> {
    return apiRequest<EconomyWallet>('/platform/economy/wallet/claim', { method: 'POST' })
  }
  async function walletLedger(asset?: string, kind?: string, page = 1, pageSize = 20): Promise<WalletLedgerItem[]> {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (asset) q.set('asset', asset)
    if (kind) q.set('kind', kind)
    const res = await apiRequest<{ items: WalletLedgerItem[] }>(`/platform/economy/wallet/ledger?${q.toString()}`)
    return res.items || []
  }
  async function invite(): Promise<Invite> {
    return apiRequest<Invite>('/platform/economy/invite')
  }
  async function membership(): Promise<Membership> {
    return apiRequest<Membership>('/platform/economy/membership')
  }
  async function creator(): Promise<Creator> {
    return apiRequest<Creator>('/platform/economy/creator')
  }
  async function submitCreator(input: { direction: string, statement: string, workIds: string[], agreed: boolean }): Promise<Creator> {
    return apiRequest<Creator>('/platform/economy/creator/submit', { method: 'POST', body: input })
  }
  async function modelCreator(): Promise<ModelCreator> {
    return apiRequest<ModelCreator>('/platform/economy/model-creator')
  }
  async function submitModelCreator(input: { platform: string, profileUrl: string, resourceUrls: string[], agreed: boolean }): Promise<ModelCreator> {
    return apiRequest<ModelCreator>('/platform/economy/model-creator/submit', { method: 'POST', body: input })
  }
  async function listTransactions(page = 1, pageSize = 20): Promise<Transaction[]> {
    const res = await apiRequest<{ items: Transaction[] }>(`/platform/economy/transaction?page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }
  async function checkoutCreate(purchase: { kind: string, yuan?: number, tier?: string, choice?: string }, clientKey = 'web-' + Date.now()): Promise<Purchase> {
    return apiRequest<Purchase>('/platform/economy/checkout', { method: 'POST', body: { clientKey, purchase } })
  }
  async function checkoutGet(id: string): Promise<Purchase> {
    return apiRequest<Purchase>(`/platform/economy/checkout/${id}`)
  }

  // ── 通知（notification）──
  async function unreadNotifications(): Promise<number> {
    const r = await apiRequest<{ unread: number }>('/platform/notification/unread')
    return r.unread || 0
  }
  async function listNotifications(page = 1, pageSize = 20): Promise<NotificationItem[]> {
    const res = await apiRequest<{ items: NotificationItem[] }>(`/platform/notification/list?page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }
  async function markNotificationsRead(notificationIds?: string[], all = false): Promise<void> {
    await apiRequest('/platform/notification/mark-read', { method: 'POST', body: { notificationIds, all } })
  }

  // ── 模型（model：目录 + 我的模型 + 发布）──
  async function modelList(input: { type?: string, family?: string, category?: string, cursor?: string, limit?: number } = {}): Promise<{ items: ModelListItem[], nextCursor?: string }> {
    const q = new URLSearchParams()
    if (input.type) q.set('type', input.type)
    if (input.family) q.set('family', input.family)
    if (input.category) q.set('category', input.category)
    if (input.cursor) q.set('cursor', input.cursor)
    if (input.limit) q.set('limit', String(input.limit))
    return apiRequest(`/platform/model/list?${q.toString()}`)
  }
  async function modelGet(id: string): Promise<ModelDetail> {
    return apiRequest<ModelDetail>(`/platform/model/get?id=${encodeURIComponent(id)}`)
  }
  async function modelFacets(): Promise<ModelFacets> {
    return apiRequest<ModelFacets>('/platform/model/facets')
  }
  async function mineModels(state?: string, cursor?: string, limit = 50): Promise<{ items: MineListItem[], nextCursor?: string }> {
    const q = new URLSearchParams({ limit: String(limit) })
    if (state) q.set('state', state)
    if (cursor) q.set('cursor', cursor)
    return apiRequest(`/platform/model/mine/list?${q.toString()}`)
  }
  async function mineModel(id: string): Promise<MineModel> {
    return apiRequest<MineModel>(`/platform/model/mine/get?id=${encodeURIComponent(id)}`)
  }
  async function createModel(): Promise<MineModel> {
    return apiRequest<MineModel>('/platform/model/create', { method: 'POST' })
  }
  async function saveModel(id: string, draft: ModelDraftInput): Promise<MineModel> {
    return apiRequest<MineModel>('/platform/model/save', { method: 'POST', body: { id, draft } })
  }
  async function submitModel(id: string): Promise<MineModel> {
    return apiRequest<MineModel>('/platform/model/submit', { method: 'POST', body: { id, agreed: true } })
  }
  async function withdrawModel(id: string): Promise<MineModel> {
    return apiRequest<MineModel>('/platform/model/withdraw', { method: 'POST', body: { id } })
  }
  async function setModelHidden(id: string, hidden: boolean): Promise<MineModel> {
    return apiRequest<MineModel>('/platform/model/setHidden', { method: 'POST', body: { id, hidden } })
  }
  async function removeModel(id: string): Promise<void> {
    await apiRequest(`/platform/model/remove?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
  /** 模型目录（公开，按类型/族/分类过滤）。与 modelList 的区别：这是目录视图，非市场列表。 */
  async function modelCatalog(input: { type?: string, family?: string, category?: string } = {}): Promise<{ items: ModelListItem[] }> {
    const q = new URLSearchParams()
    if (input.type) q.set('type', input.type)
    if (input.family) q.set('family', input.family)
    if (input.category) q.set('category', input.category)
    return apiRequest(`/platform/model/catalog?${q.toString()}`)
  }
  /**
   * prepareModelFile 模型文件上传第一步：后端签发限时 PUT 地址。
   * 键名是 `bytes`（不是 size），必填且 >=1；第二步用 completeModelFile 收尾。
   */
  async function prepareModelFile(modelId: string, name: string, bytes: number): Promise<{ id: string, url: string, expiresAt: string }> {
    return apiRequest('/platform/model/file/prepare', { method: 'POST', body: { modelId, name, bytes } })
  }
  /** completeModelFile 模型文件上传收尾（后端校验对象确实落地后置 ok）。 */
  async function completeModelFile(modelId: string): Promise<{ ok: boolean }> {
    return apiRequest('/platform/model/file/complete', { method: 'POST', body: { modelId } })
  }

  /**
   * subscribeTaskEvents 订阅平台任务事件流（GET /api/v1/platform/events，产品中立 SSE）。
   *
   * 浏览器 EventSource 不能自定义 header，因此鉴权走 `?token=`（后端 GetRequestToken
   * 同时接受 Authorization 与 query token）。事件帧的 data 里带十进制字符串 taskId。
   *
   * ⚠ 定位是**加速**而非替代：调用方必须保留轮询兜底 —— EventSource 不可用、断线或
   * 丢事件时行为要与没有它时完全一致（与 gamelora-web 的用法一致）。返回值是关闭函数。
   */
  function subscribeTaskEvents(onEvent: (event: string, data: Record<string, unknown>) => void): () => void {
    if (!import.meta.client || typeof EventSource === 'undefined') return () => {}
    if (!session.token.value) return () => {}
    const url = `${apiBase()}/platform/events?token=${encodeURIComponent(session.token.value)}`
    const es = new EventSource(url)
    const handler = (e: MessageEvent) => {
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(e.data || '{}') as Record<string, unknown>
      } catch {
        /* 坏帧忽略，不影响后续事件 */
      }
      onEvent(e.type, data)
    }
    for (const name of ['task.queued', 'task.started', 'task.progress', 'task.completed', 'task.failed', 'task.cancelled', 'error']) {
      es.addEventListener(name, handler as EventListener)
    }
    return () => es.close()
  }

  return {
    login,
    guestLogin,
    register,
    logout,
    listCharacters,
    getCharacter,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    setCharacterCover,
    listWorks,
    getHougongWork,
    favoriteHougongWork,
    deleteHougongWork,
    listStories,
    getHougongStory,
    updateStoryClips,
    listTasks,
    wallet,
    uploadAsset,
    createTask,
    getTask,
    cancelTask,
    retryTask,
    createWork,
    getCatalog,
    optimizePrompt,
    translatePrompt,
    listSessions,
    createSession,
    getSession,
    renameSession,
    archiveSession,
    listSessionTasks,
    snippetCategories,
    snippetList,
    listAssets,
    removeAsset,
    setAssetHidden,
    assetSelect,
    assetSelectByIds,
    assetDownloadUrl,
    createExport,
    getExport,
    listExports,
    listWorksFeed,
    getWork,
    listPosts,
    listComments,
    createComment,
    react,
    searchTags,
    createTag,
    report,
    walletBalance,
    claimDaily,
    walletLedger,
    invite,
    membership,
    creator,
    submitCreator,
    modelCreator,
    submitModelCreator,
    listTransactions,
    checkoutCreate,
    checkoutGet,
    unreadNotifications,
    listNotifications,
    markNotificationsRead,
    modelList,
    modelGet,
    modelFacets,
    mineModels,
    mineModel,
    createModel,
    saveModel,
    submitModel,
    withdrawModel,
    setModelHidden,
    removeModel,
    modelCatalog,
    prepareModelFile,
    completeModelFile,
    subscribeTaskEvents
  }
}
