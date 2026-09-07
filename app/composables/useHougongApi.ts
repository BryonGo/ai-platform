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

export interface HougongTask {
  id: number
  type: string
  status: string
  errorCode: string
  billedCredits: number
  createdAt: number
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

  return {
    login,
    register,
    logout,
    listCharacters,
    getCharacter,
    listWorks,
    listStories,
    listTasks,
    wallet
  }
}
