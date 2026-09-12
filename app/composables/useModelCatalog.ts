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
 * 账务通道。仅用于**选择正确的计费口径与路由**（交接文档 G2：积分预占与
 * cloud balance 是两套账务语义，不能把余额标成积分），不作为 UI 文案展示。
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
  /** 价格的单位：积分（credit 预占）或余额（cloud balance），不可混用 */
  priceUnit: '积分' | '余额'
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
 * 按**所选模型**报价，并返回正确单位。
 *
 * 不能只按画幅从 rates 取数：云端模型走 cloud balance（余额/张），
 * 与本地模型的积分预占是两套账务（交接文档 G2）。未选模型时返回 null，
 * UI 显示「费用待确认」—— 与效果图一致，也不编造价格。
 */
export function quoteModel(
  catalog: Catalog | null,
  option: UserModelOption | undefined,
  query: PriceQuery
): { amount: number, unit: '积分' | '余额' } | null {
  if (!option || !option.available) return null
  if (option.channel === 'cloud') {
    const model = catalog?.cloudModels?.find(item => item.id === option.id)
    if (!model) return null
    const preferred = model.capabilities?.default?.quality
    const quality = model.pricing?.qualities?.find(item => item.quality === preferred)
      ?? model.pricing?.qualities?.[0]
    if (!quality || typeof quality.balance !== 'number') return null
    // 云端按「余额/张」计价；数量上限由后端 capabilities.maxOutputs 约束
    return { amount: quality.balance * Math.max(1, query.count), unit: '余额' }
  }
  const amount = option.channel === 'video'
    ? quoteVideo(catalog, query.ratio, query.seconds)
    : quoteImage(catalog, query.ratio, query.count)
  return amount === null ? null : { amount, unit: '积分' }
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

/** 云端模型的起步余额（默认档），取不到时为 null */
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
      priceUnit: '积分' as const,
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
    priceUnit: '积分' as const,
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
      priceUnit: '余额' as const,
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
 * 视频模式的默认模型：优先 MiniMax H3（运营主推），否则第一个可用视频模型。
 * 只做「默认值」，用户切换后不会被覆盖。
 */
export function defaultVideoModel(options: UserModelOption[]): string {
  const preferred = options.find(item => item.available && /minimax\s*h3/i.test(item.name))
  return preferred?.id ?? options.find(item => item.available)?.id ?? ''
}
