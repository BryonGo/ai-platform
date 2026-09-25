// 后宫真实后端 API（go-sdk /api/v1/hougong + account/credit）。
import { apiBase, apiRequest, useAuthSession } from './useApi'
// 演员库的纯逻辑（筛选序列化 / 原始数据归一化）单独放 utils，便于单测且不依赖 Nuxt。
import {
  normalizeActorDetail,
  normalizeActorFacets,
  normalizeActorGenRun,
  normalizeActorItem,
  normalizeCharacterItem,
  serializeActorQuery
} from '~/utils/actor'

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

/**
 * 演员结构化标签（taxonomy）。
 *
 * 与「一句话设定」的区别：这是**可筛选的结构化维度**，演员库按它分面，
 * 创建/复制时随 CharacterInput 一起落库。取值由后端字典决定（前端不猜）。
 *
 * 共 12 个维度。注意 `eraCategory`（时代大类）与 `era`（具体时代）是**两个独立维度**：
 * 参考源里 `era_category` 是"上古/中世/近未来"这类大类，`era` 是更细的时代取值，不能互相代替。
 */
export interface ActorTaxonomy {
  /** 时代大类（参考源 era_category，如 上古/中世/现代/近未来） */
  eraCategory?: string
  /** 具体时代 */
  era?: string
  /** 地区 */
  region?: string
  /** 性别 */
  gender?: string
  /** 年龄段 */
  ageGroup?: string
  /** 物种（人类/精灵/兽人…） */
  species?: string
  /** 体型 */
  bodyType?: string
  /** 身高 */
  height?: string
  /** 肤色 */
  skinTone?: string
  /** 发长 */
  hairLength?: string
  /** 发色 */
  hairColor?: string
  /** 气质：唯一的多选维度 */
  temperament?: string[]
}

/** 演员媒体槽位：一个槽位一张素材（actor 媒体不返回 assetId，只有签名 url）。 */
export interface ActorMediaSlot {
  /** 素材 id（用户角色的媒体会返回；平台演员媒体不返回，故可选）。 */
  assetId?: string
  url: string
  /** 图片宽高（有则带上，用于占位与画布） */
  width?: number
  height?: number
}

/** 演员媒体槽位名。 */
export type ActorMediaSlotKey = 'headshot' | 'portrait' | 'fullBody' | 'expressionSheet' | 'threeView'

/** 演员媒体集合：未产出的槽位直接缺席，界面按缺失显示占位。 */
export type ActorMedia = Partial<Record<ActorMediaSlotKey, ActorMediaSlot>>

/** 造型：名称 + 该造型自己的媒体（用户角色带 id/current；平台演员 label 来自 outfitKey）。 */
export interface ActorOutfit {
  id: string
  name: string
  assetId?: string
  url?: string
  /** 是否为当前默认造型 */
  current?: boolean
  /**
   * 该造型**自己的**媒体槽位。
   *
   * 平台演员的媒体行带 outfitId：基础图挂在"没有造型"上，各造型另有自己的
   * headshot/portrait/fullBody/expressionSheet/threeView。选中造型后界面应切换成这里的图，
   * 而不是继续用全局媒体（否则换了造型图不变，等于没切）。
   */
  media?: ActorMedia
}

/** 音色：可播放的音频素材（url 为限时签名地址）。 */
export interface ActorVoice {
  id?: string
  name?: string
  assetId?: string
  url?: string
  durationSeconds?: number
}

/** 演员列表条目。id 一律按字符串收发（雪花 id）。 */
export interface ActorItem {
  id: string
  name: string
  coverUrl?: string
  /** 图片张数（媒体库） */
  imageCount?: number
  /** 造型数 */
  outfitCount?: number
  favorite?: boolean
  taxonomy?: ActorTaxonomy
  media?: ActorMedia
  /** 生成状态：pending/generating/ready/failed；流水线未接时按 pending 显示。 */
  generationStatus?: string
  /** 从哪个平台演员复制而来（我的演员才有） */
  sourceActorId?: string
}

/** 演员详情：actor + 媒体 + 造型 + 音色 + 当前账号是否收藏。 */
export interface ActorDetail {
  actor: ActorItem
  media: ActorMedia
  outfits: ActorOutfit[]
  voice: ActorVoice | null
  favorited: boolean
}

/** 分面里的一个选项。 */
export interface ActorFacetOption {
  value: string
  label?: string
  count?: number
}

/** 演员分面：维度 → 可选值。后端没给的维度不出现。 */
export type ActorFacets = Partial<Record<keyof ActorTaxonomy | 'favorite', ActorFacetOption[]>>

/** 演员列表查询参数（与后端 /hougong/actors 约定一致）。 */
export interface ActorListQuery {
  keyword?: string
  /** 时代大类（与 era 独立） */
  eraCategory?: string
  era?: string
  region?: string
  gender?: string
  ageGroup?: string
  species?: string
  bodyType?: string
  height?: string
  skinTone?: string
  hairLength?: string
  hairColor?: string
  /** 气质可多选 */
  temperament?: string[]
  /** 只看我的收藏 */
  favorite?: boolean
  sort?: 'recommended' | 'newest' | 'name'
  page?: number
  pageSize?: number
}

/** 演员列表响应（含分页与分面）。 */
export interface ActorListResult {
  items: ActorItem[]
  total: number
  page: number
  pageSize: number
  facets: ActorFacets
}

export interface CharacterItem {
  /** 雪花 id：一律按**字符串**收发（后端与 JSON reviver 都是字符串，>2^53 用 number 会丢末位）。 */
  id: string
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
  /** 手动指定的封面素材 id（雪花字符串；缺省 = 按最近作品自动） */
  coverAssetId?: string
  /** 结构化标签（新演员体系；老数据为空） */
  taxonomy?: ActorTaxonomy
  /** 媒体集合（headshot/portrait/…；老数据为空） */
  media?: ActorMedia
  /**
   * 音色媒体（后端从 kind=voice 聚合；无音色时为空数组）。
   *
   * 统一成数组：后端下发的可能是数组，克隆来的角色可能只有一条，
   * 展示层只关心"有没有可播放的 URL"。
   */
  voice?: ActorVoice[]
  /** 从平台演员复制而来时的来源 id（雪花字符串） */
  sourceActorId?: string
  /** 生成状态：pending/generating/ready/failed（流水线未接时为空） */
  generationStatus?: string
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
  /** 结构化标签 */
  taxonomy?: ActorTaxonomy
  /** 媒体集合（创建时可带已上传素材） */
  media?: ActorMedia
  /** 来源平台演员 id（复制时由后端写入，一般不用手传） */
  sourceActorId?: string
  /** 生成状态（由后端流水线维护，创建时一般不用手传） */
  generationStatus?: string
  /** 创建时的角色源图素材 id（雪花 id 字符串） */
  sourceAssetId?: string
}

/** 演员资产生成：单个 role 的状态与产物（ID 一律字符串）。 */
export interface ActorGenRole {
  /** headshot / full_body / expression_sheet / three_view（后端枚举，可能有新增） */
  role: string
  /** 产物在 hougong_character_media 里的 kind（本阶段与 role 一一对应） */
  kind: string
  /** pending / running / succeeded / failed / skipped */
  status: string
  /** 平台任务 id（未创建为空串） */
  taskId: string
  /** 产物资产 id（雪花字符串） */
  assetIds: string[]
  assetCount: number
  /** 失败原因（成功时为空串） */
  error: string
}

/** 本阶段明确不支持的 role 及原因（如 voice：无法从静态图推导）。 */
export interface ActorGenUnsupportedRole {
  role: string
  reason: string
}

/** 一次演员资产生成运行。 */
export interface ActorGenRun {
  id: string
  characterId: string
  sourceAssetId: string
  modelId: string
  /** pending / running / succeeded / partial / failed */
  status: string
  roles: ActorGenRole[]
  unsupportedRoles: ActorGenUnsupportedRole[]
  successAssetCount: number
  error: string
  createdAt: number
  updatedAt: number
}

/** 发起生成的入参（modelId 必填）。 */
export interface ActorGenStartInput {
  /** 底模 id（目录域，与 /tasks 的 modelId 同口径） */
  modelId: string
  /** 画幅；缺省由前端/后端决定 */
  ratio?: string
  /** 云端清晰度档位（1K/1.5K/2K/3K/4K） */
  quality?: string
  /** 负面提示词（4 个 role 共用） */
  negativePrompt?: string
}

/** 演员资产生成的 4 个 role 中文名见 `~/utils/actor` 的 `ACTOR_GEN_ROLES`（只定义一处）。 */

export interface WorkItem {
  id: number
  title: string
  /**
   * 所属角色的雪花 id，**字符串**（后端 uint64，JSON reviver 已转字符串）。
   * 消费方比较时一律 `String(...)`，不要转 number。
   */
  characterId: string
  sessionId?: number
  taskId?: number
  assetId: number
  /**
   * 图片作品的展示地址；**视频作品为空**。
   *
   * 视频没有独立封面图，早前后端把母版 mp4 塞进这个字段，前端当图片渲染就是坏图
   * （线上实测 naturalWidth=0）。视频一律走 videoUrl。
   */
  imageUrl?: string
  /** 视频作品的播放地址（kind === 'video' 时才有）。 */
  videoUrl?: string
  kind: string
  /**
   * 作品的**任务状态**，`/hougong/works` 目前不下发这个字段（标记可选就是为了如实反映这一点）。
   *
   * 作品只在任务成功之后才入库（`useChatStudio` 里 `createWork` 唯一一次调用就在
   * `status === 'succeeded'` 分支上），所以就算后端补上，作品列表里也只会是终态。
   * 想拿「进行中」要看任务接口（`listTasks()` / `HougongTask.status`）。
   */
  status?: string
  favorite: boolean
  /** 内容分级 sfw/r15/r18（语义见服务端 internal/platform/rating）。 */
  contentRating?: string
  /** 可见性 private/unlisted/public。 */
  visibility?: string
  createdAt: number
}

/**
 * 一集（画布·集）。
 *
 * `graphCount` 由服务端在集列表里一次算好：它是"这一集有没有东西"的唯一线索，
 * 页面不必为每集再查一次画布接口（N+1）。
 */
export interface EpisodeItem {
  id: number
  idx: number
  title: string
  /** todo / running / done */
  status: string
  budgetCredits: number
  updatedAt: number
  graphCount: number
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

/**
 * 创作工具（后台「创作工具」维护）。
 *
 * 与 CatalogItem（底模/LoRA 目录）是两回事：工具是"一类能力 + 预置"，
 * 底模是"用哪个模型画"。工具的预置提示词/LoRA/工作流都在服务端，前端只认 code。
 */
export interface ToolTemplateItem {
  code: string
  name: string
  summary: string
}

export interface ToolCatalogItem {
  code: string
  name: string
  /** image / video / enhance */
  category: string
  summary: string
  icon: string
  /** 封面图 URL（效果卡缩略图）；空 = 用图标占位 */
  cover?: string
  /** 角标文案（热门/新品/精选…）；空 = 不显示 */
  badge?: string
  /** 执行引擎：comfy / cloud */
  engine: string
  /** 输入形态：text/image/image_pair/image_mask/image_audio（据此选输入面板） */
  input: string
  supportsTemplates: boolean
  templates?: ToolTemplateItem[]
}

export interface CatalogItem {
  id: string
  type: 'model' | 'lora'
  name: string
  family: string
  /** 后台维护的一句话简介；未配置时后端不下发该字段 */
  summary?: string
  /**
   * 内容分级。adult 条目只在"本站开启成人内容 + 已过 18+ 年龄门 + 已开成人模式"时
   * 由服务端下发；也就是说前端拿到 adult 就说明当前用户有资格，
   * 不需要再自己判断一次（判定只有服务端那一份）。
   */
  safety: 'safe' | 'adult' | string
  fileName?: string
  cover?: string
  available: boolean
  selectable: boolean
  /** 不可用原因（后台停用原文 / 文件未就绪 / 家族无工作流）；可用时后端不下发 */
  unavailableReason?: string
  weight?: { default: number, min: number, max: number }
  sampling?: {
    steps: number
    sampler: string
    scheduler: string
    cfg: number
    /** 以下为**可选**的按模型约束：声明了就覆盖全局 sampling，没声明用全局 */
    samplers?: string[]
    schedulers?: string[]
    stepsMin?: number
    stepsMax?: number
    cfgMin?: number
    cfgMax?: number
    cfgStep?: number
  }
  /** 底模声明的画幅（可选，留空=用前端默认 8 档） */
  ratios?: string[]
  /** 底模声明的清晰度档（可选，留空=用默认 1K/2K） */
  qualities?: string[]
  /** 底模声明的尺寸表（可选，形如 {"16:9":[1344,768]}，指 1K 下的像素） */
  sizes?: Record<string, [number, number]>
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
  /** 后台维护的一句话简介（目录下发；未配置时为空，UI 回落 note） */
  summary?: string
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
  /**
   * 文本模型（kind=chat，openai_chat 协议）。
   *
   * 与 cloudModels 分开：文本声明的是上下文窗口 / 输出上限 / 推理档位，
   * 且按 token 用量计费（单价在站点配置里），没有图像那套「清晰度档 × 每档单价」。
   */
  textModels?: CatalogTextModel[]
  /**
   * 音频模型（kind=audio，openai_audio 协议），画布「配音配乐」节点的模型下拉用它。
   *
   * 同样单独一个桶：音频没有档位、没有家族版本，只有「能不能用」——
   * 未接音频上游时这一桶是空的，前端据此显示"本站暂无音频模型"。
   */
  audioModels?: CatalogAudioModel[]
  rates?: CatalogRates
}

/** 一个音频模型（语音合成）。字段比文本/视频少，因为一次调用没有档位可选。 */
export interface CatalogAudioModel {
  id: string
  name: string
  author?: string
  excerpt?: string
  summary?: string
  available: boolean
  selectable: boolean
  unavailableReason?: string
  family?: string
  versionLabel?: string
  isDefault?: boolean
}

/**
 * 一个文本模型。
 *
 * `available === false` 时**不要摆进下拉**：后端只在 ?includeUnavailable=1 口径下
 * 才下发未就绪条目，常规目录里不会出现（这里的过滤是防御性的）。
 */
export interface CatalogTextModel {
  id: string
  name: string
  author?: string
  excerpt?: string
  cover?: string
  summary?: string
  description?: string
  /** 上下文窗口（token）；0/缺省 = 上游与后台都没声明 */
  contextWindow?: number
  /** 单次最大输出（token）；0/缺省 = 未声明 */
  maxOutput?: number
  /** 推理档位；没有该字段 = 该模型不支持推理强度（不要拿空数组当默认） */
  reasoning?: { efforts: string[], default?: string }
  available: boolean
  selectable: boolean
  unavailableReason?: string
  family?: string
  versionLabel?: string
  isDefault?: boolean
}

export interface HougongTask {
  id: number | string
  type: string
  status: string
  progress?: number
  errorCode?: string
  /** 失败原因（上游原始报错）。有它才能把"451 内容审核"和"地址拼错"分开给用户看。 */
  errorMessage?: string
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
  /** 内容分级，缺省 sfw。 */
  contentRating?: 'sfw' | 'r15' | 'r18'
  /** 可见性；缺省由服务端按分级推（r18 → private）。 */
  visibility?: 'private' | 'unlisted' | 'public'
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
  /** 原始文件名（上传时落库；生成产物没有文件名，为空串）。资产库展示与搜索靠它。 */
  name?: string
  /** 资产类型：image/video/audio/zip/manifest/file */
  kind?: string
  origin: string
  status: string
  mimeType: string
  bytes: number
  width: number
  height: number
  url: string
  createdAt: number
  hidden: boolean
  /** 作用域：temp=临时生成产物 / permanent=上传素材与已保存的产物。缺省视为 permanent。 */
  scope?: 'temp' | 'permanent'
  /** 同内容（sha256）在本账号素材库里的总份数，仅 >1 时下发（用于「重复 ×N」角标）。 */
  duplicateCount?: number
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
  /** 作者（后端 PublicationUser：id/displayName/avatarUrl）。作品的作者展示靠它。 */
  author?: { id: string, displayName: string, avatarUrl: string | null }
  contentRating: string | null
  coverUrl: string | null
  /**
   * 作品媒体类型 image/video（后端取自封面资产的 media_asset.kind）。
   *
   * 探索流卡片据此决定用 <img> 还是 <video>：视频作品的 coverUrl 指的就是那段
   * mp4，交给 <img> 只会得到一张坏图。老后端没有这个字段时按 image 处理。
   */
  kind?: string
  /** 视频作品的播放地址（kind === 'video' 时才有）。 */
  videoUrl?: string | null
  tags: PlatformTag[]
  stats: { likes: number, favorites: number, comments: number, remixes: number }
  publishedAt: number
}

/**
 * 作品编辑器（后端 WorkEditor）：草稿/已发布作品的可编辑字段。
 *
 * 与 PublicationWork 的区别：编辑器带 state/title/content/rating/tags，但**不带封面 URL**
 * —— 封面是展示口径（签发地址），只在 WorkSummary/WorkDetail 里出现。
 */
export interface WorkEditor {
  id: string
  state: string
  title: string
  content: string
  contentRating: string | null
  tags: PlatformTag[]
  updatedAt: number
}

/** 保存作品草稿入参（对应后端 WorkSaveReq）。 */
export interface WorkSaveInput {
  id?: string | number
  title?: string
  content?: string
  tagIds?: number[]
  /** 封面资产 id，必须是本人资产；缺省/0 = 不改动现有封面。 */
  coverAssetId?: string | number
  /** 分级 sfw/r15/r18；缺省 = 不改。 */
  contentRating?: string
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
  /**
   * 金币余额（后端 coin_wallet.balance）。
   *
   * 2026-09-23 起旧的 credit_wallet（积分）与 platform_balance_wallet（余额分）已并入同一
   * coin_wallet（1 元 = 100 分 = 1000 金币），所以这个字段现在就是用户可见的**金币数**；
   * 字段名 credits 是历史契约，不改。
   */
  credits: number
  /**
   * 旧「余额(分)」字段。后端为不打断前端协议仍下发，实测恒为 0（见 aicodcms
   * platform/economy/service 的 Wallet 注释），待后端改名/移除后再同步。
   *
   * **仅为协议保留**：钱包页「消费余额（元）」卡片已于 2026-09-23 删除，UI 已不再展示；
   * 类型与响应字段保留是为了不破坏后端契约，前端不要再据此渲染。
   */
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

/** 当前登录账号的概要信息（对齐 /account/profile 返回）。 */
export interface ProfileInfo {
  id: number
  username: string
  email: string
  nickname: string
  avatar: string
  user_type: number
  status: number
}

export function useHougongApi() {
  const session = useAuthSession()

  // 登录只认邮箱（后端口径，2026-09）：用户名是自动生成、可自行修改的展示名，
  // 不再作为登录标识，所以这里发的字段就是 email，而不是过去的 account 混填。
  //
  // turnstileToken：站点把登录验证方式配成 turnstile/both 时后端必填，字段名是
  // Cloudflare 的约定名 `cf-turnstile-response`（见后端 UserLoginReq.TurnstileToken）。
  async function login(email: string, password: string, turnstileToken?: string): Promise<AuthResult> {
    const data = await apiRequest<AuthResult>('/account/auth/login', {
      method: 'POST',
      body: {
        email,
        password,
        ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {})
      }
    })
    session.save(data.token, data.user_id)
    return data
  }

  /**
   * 邮箱注册。用户名与展示名都由服务端自动生成（「邮箱前缀 + 随机后缀」，
   * 用户名即展示名），因此这里只提交邮箱与密码；注册后可在设置页改用户名。
   * turnstileToken 同 login。
   */
  async function register(
    input: { email: string, password: string, turnstileToken?: string }
  ): Promise<AuthResult> {
    const { turnstileToken, ...rest } = input
    const data = await apiRequest<AuthResult>('/account/auth/register', {
      method: 'POST',
      body: {
        ...rest,
        agree_version: '2026.08',
        ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {})
      }
    })
    session.save(data.token, data.user_id)
    return data
  }

  // 发送邮箱验证码（找回密码用；字段对齐 /account/auth/code）。
  //
  // 契约：POST /account/auth/code，body { email }；站点把验证方式配成 turnstile/both 时
  // 后端要求带 cf-turnstile-response（见 UserCodeSendReq.TurnstileToken），因此这里与
  // login/register 同一套：有 token 才带。返回体为空，成功与否看是否抛错。
  async function sendAuthCode(email: string, turnstileToken?: string): Promise<void> {
    await apiRequest('/account/auth/code', {
      method: 'POST',
      body: {
        email,
        ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {})
      }
    })
  }

  // 用邮箱验证码重置密码（字段对齐 /account/auth/reset-pwd）。
  //
  // 契约：POST /account/auth/reset-pwd，body { email, code, new_password }；
  // 后端会校验验证码有效期（Redis 5 分钟）与密码强度（≥8 位含字母与数字），
  // 校验失败的 errorKey 由 useApi 文案表统一转成中文。
  async function resetPassword(
    input: { email: string, code: string, newPassword: string }
  ): Promise<void> {
    await apiRequest('/account/auth/reset-pwd', {
      method: 'POST',
      body: {
        email: input.email,
        code: input.code,
        new_password: input.newPassword
      }
    })
  }

  /** 当前账号信息（用户名/邮箱/展示名）。 */
  async function getProfile(): Promise<ProfileInfo> {
    return apiRequest<ProfileInfo>('/account/profile')
  }

  /**
   * 改用户名。后端会做规则校验（4-32 位字母数字下划线连字符）与全局唯一性校验，
   * 并把展示名一并跟随；返回改完后的用户名与展示名，直接用于界面回显。
   */
  async function updateUsername(username: string): Promise<{ username: string, nickname: string }> {
    return apiRequest<{ username: string, nickname: string }>('/account/profile/edit', {
      method: 'POST',
      body: { username }
    })
  }

  /**
   * 退出登录。先调后端 /account/auth/logout：把当前 token 移出服务端令牌缓存、
   * 下发 Set-Cookie 清掉 HttpOnly 凭据 Cookie —— 两件事都完成，刷新页面后的
   * auto-login 才会真正失败；只清本地的话 Cookie 还活着，下个页面的
   * session.load() 会把会话恢复回来，退出成「假退出」。请求先于本地清理发出
   * （token 还在内存，Authorization 才带得上），后端失败也照常清本地。
   */
  function logout(): void {
    void apiRequest<unknown>('/account/auth/logout', { method: 'POST', body: {} }).catch(() => {})
    session.clear()
  }

  async function listCharacters(): Promise<CharacterItem[]> {
    const res = await apiRequest<{ list?: Record<string, unknown>[] }>('/hougong/characters')
    return (res.list || []).map(normalizeCharacterItem)
  }

  async function getCharacter(id: string | number): Promise<CharacterItem> {
    // 不 Number()：角色 id 是雪花 id（>2^53），转 number 会丢末位导致查不到（见 snowflake 约定）。
    const raw = await apiRequest<Record<string, unknown>>(`/hougong/characters/${id}`)
    return normalizeCharacterItem(raw)
  }

  // 角色创建/更新（字段对齐后端 CharacterInputData；更新时空字符串表示「不修改」）
  async function createCharacter(input: CharacterInput): Promise<CharacterItem> {
    const raw = await apiRequest<Record<string, unknown>>('/hougong/characters', { method: 'POST', body: input })
    return normalizeCharacterItem(raw)
  }

  async function updateCharacter(id: number | string, input: CharacterInput): Promise<CharacterItem> {
    const raw = await apiRequest<Record<string, unknown>>(`/hougong/characters/${id}`, { method: 'PUT', body: input })
    return normalizeCharacterItem(raw)
  }

  // 指定 / 清除角色封面（assetId=0 恢复自动：取最近作品产物），返回更新后的角色。
  async function setCharacterCover(id: number | string, assetId: number | string): Promise<CharacterItem> {
    const raw = await apiRequest<Record<string, unknown>>(`/hougong/characters/${id}/cover`, {
      method: 'PUT',
      // 同类精度问题：资产 id 是雪花 id，必须按字符串发（见 saveWorkDraft 注释）。
      body: { assetId: String(assetId || '0') }
    })
    return normalizeCharacterItem(raw)
  }

  // 删除角色：后端软删；该角色名下还有作品时会拒绝（先删作品）。
  async function deleteCharacter(id: number | string): Promise<void> {
    await apiRequest(`/hougong/characters/${id}`, { method: 'DELETE' })
  }

  // ── 演员库（平台演员，只读；收藏与复制到我的演员）──
  // 平台演员 = 运营维护的公共库（GET /hougong/actors，分页 + 服务端筛选）；
  // 我的演员 = 本账号自建/复制来的角色（沿用 /hougong/characters）。
  // 两侧 id 都按字符串收发：actor id / character id 都是雪花 id。

  /**
   * 平台演员列表。
   *
   * 筛选与分页**全部交给服务端**（分页下在前端过滤只能过滤已加载的那页）；
   * 返回 total 与 facets：total 判「到底了」，facets 给筛选面板的可选值。
   */
  async function listActors(q: ActorListQuery = {}): Promise<ActorListResult> {
    const qs = serializeActorQuery(q)
    const res = await apiRequest<{ items?: unknown[], total?: number, page?: number, pageSize?: number, facets?: unknown }>(
      `/hougong/actors${qs ? `?${qs}` : ''}`
    )
    return {
      items: (res.items || []).map(normalizeActorItem),
      total: Number(res.total) || 0,
      page: Number(res.page) || q.page || 1,
      pageSize: Number(res.pageSize) || q.pageSize || 0,
      facets: normalizeActorFacets(res.facets)
    }
  }

  /** 平台演员详情：actor + media + outfits + voice + 当前账号是否收藏。 */
  async function getActor(id: string | number): Promise<ActorDetail> {
    const res = await apiRequest<unknown>(`/hougong/actors/${id}`)
    return normalizeActorDetail(res)
  }

  /** 收藏（POST）/ 取消收藏（DELETE）平台演员，返回操作后的收藏态。 */
  async function favoriteActor(id: string | number, favorite = true): Promise<{ favorited: boolean }> {
    const res = await apiRequest<{ favorited?: boolean }>(
      `/hougong/actors/${id}/favorite`,
      { method: favorite ? 'POST' : 'DELETE' }
    )
    return { favorited: res?.favorited ?? favorite }
  }

  /** 把平台演员复制到「我的演员」，返回新建的角色 id（雪花字符串）。 */
  async function cloneActor(id: string | number): Promise<{ characterId: string }> {
    const res = await apiRequest<{ characterId?: string | number }>(
      `/hougong/actors/${id}/clone`,
      { method: 'POST' }
    )
    return { characterId: String(res?.characterId ?? '') }
  }

  // ── 演员资产生成（actor-generation）──
  // 从**一张源图**派生 4 类视觉资产：headshot / full_body / expression_sheet / three_view。
  // 音色无法从图推导，后端放在 unsupportedRoles（前端如实说明，不做假生成）。
  // 成功产物会进入 GET /characters/{id} 的 media[]（url 为现签），不需要另拉一次。

  /** 发起一次生成运行（会创建 4 个 t2i 任务，可能产生费用）。 */
  async function startActorGeneration(characterId: string | number, input: ActorGenStartInput): Promise<ActorGenRun> {
    const raw = await apiRequest<unknown>(`/hougong/characters/${characterId}/actor-generation`, {
      method: 'POST',
      body: {
        modelId: input.modelId,
        ...(input.ratio ? { ratio: input.ratio } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {})
      }
    })
    const run = normalizeActorGenRun(raw)
    if (!run) throw new Error('后端没有返回生成运行信息')
    return run
  }

  /** 该角色最近一次运行；没有跑过时返回 null（不是错误）。 */
  async function getLatestActorGeneration(characterId: string | number): Promise<ActorGenRun | null> {
    const raw = await apiRequest<unknown>(`/hougong/characters/${characterId}/actor-generation/latest`)
    return normalizeActorGenRun(raw)
  }

  /** 指定运行的状态（轮询用）。 */
  async function getActorGeneration(characterId: string | number, runId: string): Promise<ActorGenRun> {
    const raw = await apiRequest<unknown>(`/hougong/characters/${characterId}/actor-generation/${runId}`)
    const run = normalizeActorGenRun(raw)
    if (!run) throw new Error('后端没有返回生成运行信息')
    return run
  }

  /** 只对失败的 role 重试（逐 role、各自计费）。 */
  async function retryActorGeneration(characterId: string | number, runId: string): Promise<ActorGenRun> {
    const raw = await apiRequest<unknown>(`/hougong/characters/${characterId}/actor-generation/${runId}/retry`, {
      method: 'POST'
    })
    const run = normalizeActorGenRun(raw)
    if (!run) throw new Error('后端没有返回生成运行信息')
    return run
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

  // ── 集（画布·集）：画布按 ownerType=episode 挂图，集本身由产品管 ──
  async function listEpisodes(storyId: string | number): Promise<EpisodeItem[]> {
    const res = await apiRequest<{ list: EpisodeItem[] }>(`/hougong/stories/${storyId}/episodes`)
    return res.list || []
  }

  /** 新建一集：`idx` 不传 = 服务端取"这一故事下一个"，`title` 空 = "第 N 集"。 */
  async function createEpisode(storyId: string | number, body: { idx?: number, title?: string } = {}): Promise<EpisodeItem> {
    return apiRequest<EpisodeItem>(`/hougong/stories/${storyId}/episodes`, { method: 'POST', body })
  }

  /** 改一集：只改给到的字段（改名不会把状态退回 todo）。 */
  async function updateEpisode(id: string | number, body: { title?: string, status?: string, budgetCredits?: number }): Promise<EpisodeItem> {
    return apiRequest<EpisodeItem>(`/hougong/episodes/${id}`, { method: 'PUT', body })
  }

  async function deleteEpisode(id: string | number): Promise<void> {
    await apiRequest(`/hougong/episodes/${id}`, { method: 'DELETE' })
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
  /** 创作工具目录（本站已启用的工具与模板）。运营在后台停用后立刻不再下发。 */
  async function listTools(): Promise<ToolCatalogItem[]> {
    const res = await apiRequest<{ items: ToolCatalogItem[] }>('/hougong/tools')
    return res.items || []
  }

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
    /** 创作工具 code（可选）。只能传 code：预置提示词/LoRA/工作流都由服务端拼。 */
    tool?: string
    /** 工具模板 code（可选）。 */
    template?: string
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

  /** 修改作品可见性（可选一并改分级）。作者本人。 */
  async function setWorkVisibility(
    id: number | string,
    visibility: 'private' | 'unlisted' | 'public',
    contentRating?: 'sfw' | 'r15' | 'r18'
  ): Promise<WorkItem> {
    return apiRequest<WorkItem>(`/hougong/works/${id}/visibility`, {
      method: 'PUT',
      body: contentRating ? { visibility, contentRating } : { visibility }
    })
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
  /**
   * 资产库列表。
   *
   * 过滤与排序**全部交给服务端**（kind/origin/keyword/sort）：分页下在前端过滤只能过滤
   * "已加载的那几页"，翻到第 3 页才出现的一张视频，用前端页签是永远看不到的。
   * 同时返回 total——无限滚动要靠它判断"到底了"，只看 items.length 会在整页边界漏判。
   */
  async function listAssets(q: {
    hidden?: boolean
    kind?: string
    origin?: string
    /**
     * 作用域：'permanent'（我的资产，默认）/ 'temp'（临时资产）/ 'all'（不限）。
     *
     * 服务端不传时默认只返回 permanent —— 生成产物默认是临时的，不会混进「我的资产」；
     * 「临时资产」页签必须显式传 'temp' 才列得出来。
     */
    scope?: 'all' | 'permanent' | 'temp'
    keyword?: string
    sort?: 'new' | 'old' | 'large'
    /** 只看重复：内容（sha256）在库里出现多于一次的行。 */
    duplicates?: boolean
    page?: number
    pageSize?: number
  } = {}): Promise<{ items: AssetItem[], total: number }> {
    const params = new URLSearchParams()
    params.set('hidden', q.hidden ? '1' : '0')
    if (q.kind && q.kind !== 'all') params.set('kind', q.kind)
    if (q.origin && q.origin !== 'all') params.set('origin', q.origin)
    if (q.scope) params.set('scope', q.scope)
    if (q.keyword) params.set('keyword', q.keyword)
    if (q.sort) params.set('sort', q.sort)
    if (q.duplicates) params.set('duplicates', '1')
    params.set('page', String(q.page || 1))
    params.set('pageSize', String(q.pageSize || 24))
    const res = await apiRequest<{ items?: AssetItem[], total?: number }>(`/platform/asset?${params.toString()}`)
    return { items: res.items || [], total: Number(res.total) || 0 }
  }

  /**
   * 批量操作资产（删除/隐藏/恢复）。
   *
   * 一次请求做完，而不是前端循环 N 次单条接口：后者在 50 张时要 50 个往返，中途失败还会
   * 留下"删了一半"的状态，用户根本看不出删没删干净。后端逐条回报失败原因。
   */
  async function batchAssets(
    ids: string[],
    action: 'delete' | 'hide' | 'unhide'
  ): Promise<{ ok: boolean, affected: number, failed: { id: string, reason: string }[] }> {
    return apiRequest('/platform/asset/batch', { method: 'POST', body: { ids, action } })
  }
  /**
   * 清理重复素材（同内容多行）。
   *
   * 删哪些**由服务端决定**：只有它知道哪些行被生成任务快照引用过 —— 删掉被引用的那一行，
   * 历史消息里的图会变空白，而用户在下单前看不出这层依赖。服务端每组保留最新一条 +
   * 所有被引用过的行，其余软删（可恢复）。
   */
  async function dedupeAssets(dryRun = false): Promise<{
    groups: number
    deleted: number
    kept: number
    /** 被改写过引用的历史任务数（同内容的行合并到保留那条，界面看到的图不变）。 */
    mergedTasks?: number
  }> {
    return apiRequest('/platform/asset/dedupe', { method: 'POST', body: { dryRun } })
  }
  async function removeAsset(id: string): Promise<void> {
    await apiRequest(`/platform/asset/${id}`, { method: 'DELETE' })
  }
  async function setAssetHidden(id: string, hidden: boolean): Promise<void> {
    await apiRequest(`/platform/asset/${id}/hidden`, { method: 'POST', body: { hidden } })
  }
  /**
   * saveAsset 把临时生成产物「保存到我的资产」：后端把 scope 置为 permanent（幂等）。
   *
   * 返回最新资产条目（含 scope），前端据此把按钮置为已保存。**不重新上传、不重新生成**。
   * id 一律按字符串传（雪花 19 位，Number 会丢精度）。
   */
  async function saveAsset(id: string): Promise<AssetItem> {
    const res = await apiRequest<{ asset: AssetItem }>(`/platform/asset/${id}/save`, { method: 'POST' })
    return res.asset
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
  /**
   * 作品流（灵感广场）。
   *
   * `scope` 是后端**必填**参数（v:"required|in:author,owned,model,favorites,explore"）：
   * 之前这里没传，请求必然被校验拦下 —— 首页探索流因此一直只能吃 mock。
   * 另返回 total：分页要靠它判断「到底了」，只按 items.length 判断会在整页边界漏判。
   */
  async function listWorksFeed(
    page = 1,
    pageSize = 20,
    scope: 'explore' | 'owned' | 'favorites' = 'explore'
  ): Promise<{ items: PublicationWork[], total: number }> {
    const res = await apiRequest<{ items?: PublicationWork[], total?: number }>(
      `/platform/work?scope=${scope}&page=${page}&pageSize=${pageSize}`
    )
    return { items: res.items || [], total: Number(res.total) || 0 }
  }
  async function getWork(id: string): Promise<PublicationWork> {
    return apiRequest(`/platform/work/${id}`)
  }

  /**
   * 取作品编辑器（缺省 id 取当前草稿，可能为 null）。
   *
   * 后端草稿是「每个账号一份」的语义：不传 id 时返回当前草稿而不是新建，
   * 因此「打开发布框」不能假设一定有数据回来。
   */
  async function getWorkEditor(id?: string | number): Promise<WorkEditor | null> {
    const q = id ? `?id=${id}` : ''
    const res = await apiRequest<{ work: WorkEditor | null }>(`/platform/work/edit${q}`)
    return res.work || null
  }

  /**
   * 保存作品草稿（不发布）。返回 null 表示"空草稿已被丢弃"（后端按空入参丢弃）。
   *
   * 封面在这一步落库（coverAssetId），发布时才有图 —— 探索流卡片用的就是它。
   */
  async function saveWorkDraft(input: WorkSaveInput): Promise<WorkEditor | null> {
    const body: Record<string, unknown> = {}
    if (input.title !== undefined) body.title = input.title
    if (input.content !== undefined) body.content = input.content
    if (input.tagIds) body.tagIds = input.tagIds
    // 雪花 id 必须以**字符串**发：Number("1471022339713873920") 会丢精度成 …874000，
    // 后端按这个 id 查资产必然查不到（实测报「封面资产不存在或不属于当前账号」）。
    // 后端字段是 uint64，GoFrame 的 gconv 能直接把十进制字符串转成整数，不会损失精度。
    if (input.id) body.id = String(input.id)
    if (input.coverAssetId) body.coverAssetId = String(input.coverAssetId)
    if (input.contentRating) body.contentRating = input.contentRating
    const res = await apiRequest<{ work: WorkEditor | null }>('/platform/work/edit', { method: 'POST', body })
    return res.work || null
  }

  /** 发布作品（缺省 id 发布当前草稿），返回发布后的作品详情（含 coverUrl）。 */
  async function publishWork(id?: string | number): Promise<PublicationWork> {
    // 同样用字符串传 id（理由见 saveWorkDraft 的注释）。
    return apiRequest('/platform/work/publish', { method: 'POST', body: id ? { id: String(id) } : {} })
  }

  /** 取消发布（published → unpublished）。 */
  async function unpublishWork(id: string | number): Promise<void> {
    await apiRequest(`/platform/work/${id}/unpublish`, { method: 'POST', body: {} })
  }

  /** 隐藏/恢复作品（作者本人或管理员）。 */
  async function setWorkHidden(id: string | number, hidden: boolean): Promise<void> {
    await apiRequest(`/platform/work/${id}/hidden`, { method: 'POST', body: { hidden } })
  }

  /** 删除作品。 */
  async function deleteWork(id: string | number): Promise<void> {
    await apiRequest(`/platform/work/${id}`, { method: 'DELETE' })
  }

  /** 我发布的作品（scope=owned，含草稿/未发布/隐藏状态）。 */
  async function listMyPublishedWorks(page = 1, pageSize = 20): Promise<{ items: PublicationWork[], total: number }> {
    return listWorksFeed(page, pageSize, 'owned')
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
    register,
    sendAuthCode,
    resetPassword,
    getProfile,
    updateUsername,
    logout,
    listCharacters,
    getCharacter,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    setCharacterCover,
    listActors,
    getActor,
    favoriteActor,
    cloneActor,
    startActorGeneration,
    getLatestActorGeneration,
    getActorGeneration,
    retryActorGeneration,
    listWorks,
    getHougongWork,
    favoriteHougongWork,
    deleteHougongWork,
    listStories,
    getHougongStory,
    updateStoryClips,
    listEpisodes,
    createEpisode,
    updateEpisode,
    deleteEpisode,
    listTasks,
    wallet,
    uploadAsset,
    createTask,
    getTask,
    cancelTask,
    retryTask,
    createWork,
    setWorkVisibility,
    getCatalog,
    listTools,
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
    batchAssets,
    dedupeAssets,
    removeAsset,
    setAssetHidden,
    saveAsset,
    assetSelect,
    assetSelectByIds,
    assetDownloadUrl,
    createExport,
    getExport,
    listExports,
    listWorksFeed,
    getWorkEditor,
    saveWorkDraft,
    publishWork,
    unpublishWork,
    setWorkHidden,
    deleteWork,
    listMyPublishedWorks,
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
