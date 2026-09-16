// 首页展示型数据的**类型与静态配置**（工具页签 / 探索分类 / 卡片结构）。
//
// 这里**不放兜底示例数据**：首页三个区块（全部工具 / 继续创作 / 探索灵感）一律以真实
// 接口为准 —— 取不到就没有内容，不再塞一批写死的示例顶上。
//
// 为什么去掉（实际踩到的代价）：兜底会让「配置错了 / 站点没解析对 / 接口抖动」和
// 「后台确实一个都没有」表现完全一样。本地 Host 不对导致站点回落默认站时，工具目录
// 拿到 0 条，首页却"看着很正常"地展示了 10 个跟本站无关的工具卡，问题被藏住。
// 展示层缺数据时**如实为空**，运营才看得到。
//
// 保留的是三样：类型、静态标签（页签 / 分类），以及类型里给真实数据用的可选字段
// （badgeBaked = 角标已烤进图里不再叠 CSS 角标；kind / videoUrl = 视频作品）。

export type ToolKind = 'image' | 'video' | 'enhance'

export const TOOL_TABS: { id: 'all' | ToolKind, label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'enhance', label: '增强' }
]

export interface ExploreWork {
  id: string
  title: string
  author: string
  avatar?: string
  cover: string
  category: string
  /** 作品标签名（真实作品来自接口，用于分类筛选） */
  tags?: string[]
  badge?: '热门' | '最新'
  badgeBaked?: boolean
  /** 视频作品的时长角标，如 00:24 */
  duration?: string
  /**
   * 媒体类型（真实作品来自接口：WorkSummary.kind）。video 时卡片用 <video> 渲染
   * `videoUrl` 并进视口自动播。
   */
  kind?: 'image' | 'video'
  /** 视频作品的播放地址（kind === 'video' 时才有）。 */
  videoUrl?: string
  mock: boolean
}

export interface ContinueItem {
  id: string
  title: string
  cover: string
  status: 'edited' | 'done' | 'running'
  statusText: string
  /** 有值即表示这是一次「原图 → 效果」的对比结果，卡片内用同坐标滑块展示 */
  compareBefore?: string
  /** 是否已完成，未完成时按第 6 条不渲染可播放产物 */
  done?: boolean
  /** 媒体类型（来自作品接口）：video 时卡片渲染 videoUrl 并进视口自动播。 */
  kind?: 'image' | 'video'
  /** 视频作品的播放地址（kind === 'video' 时才有）。 */
  videoUrl?: string
}

export const EXPLORE_CATEGORIES = ['推荐', '动画动漫', '影视创作', '产品展示'] as const
export type ExploreCategory = typeof EXPLORE_CATEGORIES[number]
