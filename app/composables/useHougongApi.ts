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
  available: boolean
  selectable: boolean
  weight?: { default: number, min: number, max: number }
  sampling?: { steps: number, sampler: string, scheduler: string, cfg: number }
}

export interface Catalog {
  version: number
  sampling: CatalogSampling
  models: CatalogItem[]
  loras: CatalogItem[]
}

export interface HougongTask {
  id: number
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
    seed?: number
    sampling?: { steps: number, sampler: string, scheduler: string, cfg: number, denoise?: number }
    loras?: { name: string, weight: number }[]
    modelId?: string
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
  async function listAssets(page = 1, pageSize = 20): Promise<AssetItem[]> {
    const res = await apiRequest<{ items: AssetItem[] }>(`/platform/asset?page=${page}&pageSize=${pageSize}`)
    return res.items || []
  }
  async function removeAsset(id: string): Promise<void> {
    await apiRequest(`/platform/asset/${id}`, { method: 'DELETE' })
  }

  return {
    login,
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
    removeAsset
  }
}
