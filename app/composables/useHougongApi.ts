// 后宫真实后端 API（go-sdk /api/v1/hougong + account/credit）。
import { apiRequest, useAuthSession } from './useApi'

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
}

export interface WorkItem {
  id: number
  title: string
  characterId: number
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
  fileName?: string
  cover?: string
  available: boolean
  selectable: boolean
  weight?: { default: number, min: number, max: number }
  sampling?: { steps: number, sampler: string, scheduler: string, cfg: number }
}

export interface CloudModel {
  id: string
  name: string
  author: string
  state: string
  engine: 'seedream' | 'xiaoyi' | string
  endpoint: string
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
}

/** 站点报价表：键为画幅（如 "1:1"），值为积分单价；来自 billing_rate_version 最新 revision */
export interface CatalogRates {
  product: string
  image: Record<string, number>
  video: Record<string, number>
  extend: Record<string, number>
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

  async function listWorks(): Promise<WorkItem[]> {
    const res = await apiRequest<{ list: WorkItem[] }>('/hougong/works')
    return res.list || []
  }

  async function listStories(): Promise<StoryItem[]> {
    const res = await apiRequest<{ list: StoryItem[] }>('/hougong/stories')
    return res.list || []
  }

  async function listTasks(): Promise<HougongTask[]> {
    const res = await apiRequest<{ list: HougongTask[] }>('/hougong/tasks')
    return res.list || []
  }

  async function wallet(): Promise<{ balance: number, holds: number }> {
    return apiRequest('/account/credits')
  }

  async function getCatalog(): Promise<Catalog> {
    return apiRequest<Catalog>('/platform/catalog')
  }

  async function optimizePrompt(prompt: string, modelId: string): Promise<string> {
    const r = await apiRequest<{ prompt: string }>('/hougong/prompt/optimize', { method: 'POST', body: { prompt, modelId } })
    return r.prompt
  }

  async function translatePrompt(prompt: string, target = 'en'): Promise<string> {
    const r = await apiRequest<{ prompt: string }>('/hougong/prompt/translate', { method: 'POST', body: { prompt, target } })
    return r.prompt
  }

  async function uploadMedia(file: File): Promise<{ mediaAssetId: string, width: number, height: number, mime: string }> {
    const form = new FormData()
    form.append('file', file)
    return apiRequest('/hougong/media', { method: 'POST', form })
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

  return {
    login,
    guestLogin,
    register,
    logout,
    listCharacters,
    getCharacter,
    listWorks,
    listStories,
    listTasks,
    wallet,
    uploadMedia,
    createTask,
    getTask,
    cancelTask,
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
    listWorksFeed,
    getWork,
    listPosts,
    listComments,
    createComment,
    react,
    searchTags,
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
    removeModel
  }
}
