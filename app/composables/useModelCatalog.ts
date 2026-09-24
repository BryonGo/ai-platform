import type { Catalog, CatalogVideoModel, CloudModel } from './useHougongApi'

// 模型目录的「用户视图」前端半边。
//
// 交接文档第 1 节的最新模型决策：前台只给用户选模型，显示用途、能力和价格；
// **不显示 ComfyUI / 云端 API / 执行渠道分类，不另设平台选择**。因此这里
// 刻意不产出 source / engine / provider / workflow 字段，UI 也无从渲染渠道术语。
//
// 后台的「统一用户视图」（displayName / summary / examples / parameterSchema，
// 交接文档 G1）尚未落地；当前只能从既有 catalog 派生**确定的事实**：
// 名称、封面、时长档、分辨率档、画幅、是否可用、报价。一律不编造介绍文案，
// 介绍字段留空等后台提供。

export type ComposerMode = 'image' | 'video'

/**
 * 账务通道。仅用于**选择正确的取数口径与路由**（本地预占 / 云端扣款 / 视频）。
 *
 * 历史背景（交接文档 G2）：过去本地走「积分预占」、云端走「余额」，是两套账务，
 * 所以单位要分开标。2026-09-23 起全环境统一到 `coin_wallet`（1 元 = 100 分 = 1000 金币），
 * 两者已是同一个钱包，**用户可见单位只剩「金币」**；渠道差异不再体现为单位，只影响路由。
 */
export type ModelChannel = 'local' | 'cloud' | 'video'

export interface UserModelOption {
  id: string
  name: string
  mode: ComposerMode
  /** 内部路由信息，UI 不渲染成标签 */
  channel: ModelChannel
  cover?: string
  /** 由后端事实派生的能力标签，不含渠道术语 */
  tags: string[]
  /** 起步价数值；取不到时为 null，UI 显示「价格待报价」而不是编造数字 */
  fromPrice: number | null
  /** 用户可见价格的单位。全环境统一 coin_wallet 后只有「金币」一种（见 ModelChannel 注释） */
  priceUnit: '金币'
  /** 后台配置的用途介绍；后端未提供时为 undefined，UI 不显示该行 */
  summary?: string
  /**
   * 是否支持参考图 / 首帧输入。后端统一用户视图（G1）未落地前一律为
   * undefined —— UI 对 undefined 的处理是「保持可见」，只有明确 false 才隐藏
   * 上传区，避免因为拿不到能力字段就把功能砍掉。
   */
  supportsReference?: boolean
  available: boolean
  unavailableReason?: string
}

export interface PriceQuery {
  ratio: string
  seconds: number
  /** 生成数量（图片） */
  count: number
}

/** 单次生成的报价：与后端计费内核口径一致（图片按画幅，视频按时长优先、回落画幅单档） */
export function quoteImage(catalog: Catalog | null, ratio: string, count = 1): number | null {
  const unit = catalog?.rates?.image?.[ratio]
  if (typeof unit === 'number' && unit > 0) return unit * Math.max(1, count)
  return null
}

export function quoteVideo(catalog: Catalog | null, ratio: string, seconds: number): number | null {
  const rates = catalog?.rates
  const byDuration = rates?.videoByDuration?.[ratio]?.[String(seconds)]
  if (typeof byDuration === 'number' && byDuration > 0) return byDuration
  const base = rates?.video?.[ratio]
  if (typeof base === 'number' && base > 0) return base
  return null
}

export function quote(catalog: Catalog | null, mode: ComposerMode, query: PriceQuery): number | null {
  return mode === 'video'
    ? quoteVideo(catalog, query.ratio, query.seconds)
    : quoteImage(catalog, query.ratio, query.count)
}

/**
 * 按**所选模型**报价，并返回统一单位。
 *
 * 取数仍要区分渠道：云端模型取 `pricing.qualities[].balance`，本地/视频取站点 rates
 * （两套取数口径不同），但**展示单位统一为「金币」**——全环境已并入 coin_wallet。
 * 未选模型时返回 null，UI 显示「费用待确认」，不编造价格。
 */
export function quoteModel(
  catalog: Catalog | null,
  option: UserModelOption | undefined,
  query: PriceQuery
): { amount: number, unit: '金币' } | null {
  if (!option || !option.available) return null
  if (option.channel === 'cloud') {
    const model = catalog?.cloudModels?.find(item => item.id === option.id)
    if (!model) return null
    const preferred = model.capabilities?.default?.quality
    const quality = model.pricing?.qualities?.find(item => item.quality === preferred)
      ?? model.pricing?.qualities?.[0]
    if (!quality || typeof quality.balance !== 'number') return null
    // 云端按「每张金币」计价；数量上限由后端 capabilities.maxOutputs 约束
    return { amount: quality.balance * Math.max(1, query.count), unit: '金币' }
  }
  const amount = option.channel === 'video'
    ? quoteVideo(catalog, query.ratio, query.seconds)
    : quoteImage(catalog, query.ratio, query.count)
  return amount === null ? null : { amount, unit: '金币' }
}

function videoTags(model: CatalogVideoModel): string[] {
  const tags: string[] = []
  const durations = model.durations?.map(item => item.seconds).filter(n => typeof n === 'number') ?? []
  if (durations.length) tags.push(`${Math.min(...durations)}-${Math.max(...durations)} 秒`)
  if (model.resolutions?.length) tags.push(model.resolutions.map(item => item.label).join(' / '))
  if (model.maxSeconds && !durations.length) tags.push(`最长 ${model.maxSeconds} 秒`)
  return tags
}

function cloudTags(model: CloudModel): string[] {
  const tags: string[] = []
  const qualities = model.pricing?.qualities?.map(item => item.quality).filter(Boolean) ?? []
  if (qualities.length) tags.push(qualities.join(' / '))
  const outputs = model.capabilities?.maxOutputs
  if (typeof outputs === 'number' && outputs > 1) tags.push(`最多 ${outputs} 张`)
  const refs = model.capabilities?.maxInputs
  if (typeof refs === 'number' && refs > 0) tags.push('支持参考图')
  return tags
}

/** 云端模型的起步金币价（默认档），取不到时为 null */
function cloudFromPrice(model: CloudModel): number | null {
  const preferred = model.capabilities?.default?.quality
  const quality = model.pricing?.qualities?.find(item => item.quality === preferred)
    ?? model.pricing?.qualities?.[0]
  return typeof quality?.balance === 'number' ? quality.balance : null
}

/** 该视频模型支持的时长档（秒） */
export function durationOptions(model: UserModelOption | undefined, catalog: Catalog | null): number[] {
  if (!model) return [5, 10]
  const raw = catalog?.videoModels?.find(item => item.id === model.id)
  const list = raw?.durations?.map(item => item.seconds).filter(n => typeof n === 'number') ?? []
  if (list.length) return [...new Set(list)].sort((a, b) => a - b)
  return [5, 10]
}

/**
 * 构建用户可选的模型清单。
 *
 * 与既有创作页保持一致：图片模式 = 本地模型 + **状态可用的云端模型**，
 * 视频模式 = catalog.videoModels。此前只取本地模型会直接丢掉云端能力，
 * 因此这里必须合并（交接文档：不因允许 mock 而砍已可用业务）。
 */
export function buildModelOptions(catalog: Catalog | null, mode: ComposerMode): UserModelOption[] {
  if (!catalog) return []
  if (mode === 'video') {
    return (catalog.videoModels ?? []).map(model => ({
      id: model.id,
      name: model.name,
      mode: 'video' as const,
      channel: 'video' as const,
      tags: videoTags(model),
      fromPrice: quoteVideo(catalog, '9:16', model.defaultSeconds || 5),
      priceUnit: '金币' as const,
      summary: model.summary ?? model.note,
      available: model.available && model.selectable,
      unavailableReason: reasonFor(model.available && model.selectable, model.unavailableReason)
    }))
  }
  const local: UserModelOption[] = (catalog.models ?? []).map(model => ({
    id: model.id,
    name: model.name,
    mode: 'image' as const,
    channel: 'local' as const,
    cover: model.cover,
    tags: [model.family].filter(Boolean) as string[],
    fromPrice: quoteImage(catalog, '16:9', 1),
    priceUnit: '金币' as const,
    summary: model.summary,
    available: model.available && model.selectable,
    unavailableReason: reasonFor(model.available && model.selectable, model.unavailableReason)
  }))
  const cloud: UserModelOption[] = (catalog.cloudModels ?? [])
    .filter(model => model.state === 'available')
    .map(model => ({
      id: model.id,
      name: model.name,
      mode: 'image' as const,
      channel: 'cloud' as const,
      cover: model.cover || undefined,
      tags: cloudTags(model),
      fromPrice: cloudFromPrice(model),
      priceUnit: '金币' as const,
      summary: model.excerpt,
      available: true
    }))
  return [...local, ...cloud]
}

/**
 * 不可用原因：**优先用后端文案**（后台停用原因原文 / 文件未就绪 / 家族无工作流），
 * 后端没给时才回落通用文案。反过来（前端自己编原因）会把「已下线」和「没配好」
 * 说成同一件事，用户看到的信息是错的。
 */
function reasonFor(usable: boolean, backendReason?: string): string | undefined {
  if (usable) return undefined
  const text = (backendReason || '').trim()
  return text || '暂不可用'
}

/**
 * 视频输出尺寸：只认**模型自带**的分辨率表（catalog.videoModels[].resolutions）。
 * 模型没声明的比例一律返回 null —— 由 UI 置灰，而不是下发一个会被后端拒绝的尺寸。
 */
export function videoSizeFor(catalog: Catalog | null, modelId: string, ratio: string): [number, number] | null {
  const model = catalog?.videoModels?.find(item => item.id === modelId)
  const hit = model?.resolutions?.find(item => item.ratio === ratio)
  return hit ? [hit.width, hit.height] : null
}

/** 该视频模型支持哪些比例 */
export function videoRatios(catalog: Catalog | null, modelId: string): string[] {
  const model = catalog?.videoModels?.find(item => item.id === modelId)
  return model?.resolutions?.map(item => item.ratio) ?? []
}

/**
 * 云端模型支持的清晰度档：来自模型行 capabilities（后台可配）。
 *
 * 为什么不能写死 1K/2K：后台可以新建任意模型（Nano Banana、grok…），
 * 它们支持的档位由运营在后台填。写死会让用户选到模型不支持的档，
 * 后端（建单查表后）会直接拒绝该请求 —— 用户看到的是「点不动」而不是「没这个选项」。
 */
export function cloudQualities(catalog: Catalog | null, modelId: string): string[] {
  const model = catalog?.cloudModels?.find(item => item.id === modelId)
  const params = model?.capabilities?.parameters ?? []
  return params.map(item => item.quality).filter((q): q is string => !!q)
}

/**
 * 云端模型在指定清晰度下支持的比例**及其像素尺寸**。
 *
 * 与 cloudRatios 的区别：那个只回比例字符串（给禁用判断用），这个连 size 一起回，
 * 因为面板上要显示"这个比例在这个档位下实际出多大" —— 用户选 9:16 时想知道的是
 * 1600×2848 而不是"9:16"。
 *
 * 各家比例集合差别很大，所以必须按模型取，不能用一个全局表：
 *   Seedream 5 / GPT Image 2   5 个
 *   Nano Banana (Gemini 3 Pro) 10 个（多 3:4 4:3 4:5 5:4 21:9）
 *   本地 comfy                  8 个（见 app/data/image-options.ts）
 */
export function cloudRatioOptions(
  catalog: Catalog | null,
  modelId: string,
  quality: string
): { ratio: string, size: string }[] {
  const model = catalog?.cloudModels?.find(item => item.id === modelId)
  const params = model?.capabilities?.parameters ?? []
  if (!params.length) return []
  const pick = params.find(item => item.quality === quality) ?? params[0]
  return (pick?.ratios ?? [])
    .map(item => ({ ratio: String(item?.ratio ?? ''), size: String(item?.size ?? '') }))
    .filter(item => !!item.ratio)
}

/** 后台声明的默认清晰度（为空时调用方回落到第一档）。 */
export function cloudDefaultQuality(catalog: Catalog | null, modelId: string): string {
  const model = catalog?.cloudModels?.find(item => item.id === modelId)
  return model?.capabilities?.default?.quality || ''
}

/**
 * 后台声明的默认画幅（为空时调用方回落到竖屏）。
 *
 * 这个字段以前**前端从来没读过** —— 换模型时只把画幅收敛到 list[0]，而 list[0] 是
 * "1:1"（比例表就是按 1:1 打头排的），于是默认落在方图上。产品里"竖屏"只有一种口径
 * （首页探索流 hg-media r9x16、视频报价 quoteVideo(catalog,'9:16',…)），图片输入器
 * 却从 16:9 横屏起步、收敛后变 1:1 —— 跟哪儿都不一致。
 *
 * 走后台字段而不是写死：运营改一次 capabilities.default.ratio 就能换默认画幅，不用发版。
 */
export function cloudDefaultRatio(catalog: Catalog | null, modelId: string): string {
  const model = catalog?.cloudModels?.find(item => item.id === modelId)
  return model?.capabilities?.default?.ratio || ''
}

/**
 * portraitFallback 竖屏兜底画幅。
 *
 * 模型没声明默认、或声明的那个当前档不支持时用它。9:16 与首页探索流容器、
 * 视频报价同一条口径；再不行才轮到 supported[0]。
 */
export const PORTRAIT_RATIO = '9:16'

/**
 * pickRatio 选默认画幅：模型声明的 → 竖屏兜底 → 支持列表第一个。
 *
 * 顺序不能反：先信后台声明（运营配的才算数），再信产品的竖屏约定，
 * 最后才退到"列表里随便挑一个能用"。
 */
export function pickRatio(supported: string[], preferred: string): string {
  if (!supported.length) return preferred || PORTRAIT_RATIO
  if (preferred && supported.includes(preferred)) return preferred
  if (supported.includes(PORTRAIT_RATIO)) return PORTRAIT_RATIO
  return supported[0] ?? preferred
}

/** 云端模型在指定清晰度下支持的比例（该档没声明比例时返回空数组=不限制）。 */
export function cloudRatios(catalog: Catalog | null, modelId: string, quality: string): string[] {
  const model = catalog?.cloudModels?.find(item => item.id === modelId)
  const params = model?.capabilities?.parameters ?? []
  const pick = params.find(item => item.quality === quality) ?? params[0]
  return (pick?.ratios ?? []).map(item => item.ratio).filter((r): r is string => !!r)
}

/**
 * 视频模式的默认模型：优先 MiniMax H3（运营主推），否则第一个可用视频模型。
 * 只做「默认值」，用户切换后不会被覆盖。
 */
export function defaultVideoModel(options: UserModelOption[]): string {
  const preferred = options.find(item => item.available && /minimax\s*h3/i.test(item.name))
  return preferred?.id ?? options.find(item => item.available)?.id ?? ''
}
