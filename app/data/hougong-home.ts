// 首页展示型数据（工具目录 / 探索作品流 / 继续创作兜底）
//
// 边界（交接文档第 2 节）：探索作品、热门标签、工具展示目录**允许 mock**；
// 账号、报价、生成、任务、产物不得以 mock 冒充。因此本文件只覆盖展示层，
// 且每条 mock 都显式标注 mock: true，真实接口可用时不走这里。
//
// 缩略图来源说明：public/mock/home/*.png 是从设计效果图
// docs/design/references/homepage-v3.png 按卡片几何逐像素裁出的展示素材，
// 用来保证首页与效果图 1:1 一致；接入真实作品后应整体替换。
// 其中 badgeBaked 表示「热门」角标已经烤在图片里，此时不再叠加 CSS 角标，
// 避免出现两个角标（探索流后续批次用 public/model-covers 真图，仍走 CSS 角标）。

export type ToolKind = 'image' | 'video' | 'enhance'

export interface ToolEntry {
  id: string
  label: string
  icon: string
  cover: string
  /** 筛选分类（标注图：全部 / 图片 / 视频 / 增强），一个工具可属于多类 */
  kinds: ToolKind[]
  badgeBaked?: boolean
}

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
   * `videoUrl` 并进视口自动播；示例作品（mock）没有这个字段，按图片处理。
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

/** 首页「全部工具」展示目录（11 项中的 10 项，与效果图一致） */
export const HOME_TOOLS: ToolEntry[] = [
  { id: 'text2img', label: '文生图', icon: 'i-lucide-image-plus', cover: '/mock/home/tool-01-text2img.png', kinds: ['image'], badgeBaked: true },
  { id: 'edit', label: '图片编辑', icon: 'i-lucide-wand-sparkles', cover: '/mock/home/tool-02-edit.png', kinds: ['image', 'enhance'], badgeBaked: true },
  { id: 'i2v', label: '首帧生视频', icon: 'i-lucide-clapperboard', cover: '/mock/home/tool-03-i2v.png', kinds: ['video'], badgeBaked: true },
  { id: 'faceimg', label: '图片换脸', icon: 'i-lucide-user-round', cover: '/mock/home/tool-04-faceimg.png', kinds: ['image'], badgeBaked: true },
  { id: 'facevid', label: '视频换脸', icon: 'i-lucide-users', cover: '/mock/home/tool-05-facevid.png', kinds: ['video'], badgeBaked: true },
  { id: 'bg', label: '背景替换', icon: 'i-lucide-mountain', cover: '/mock/home/tool-06-bg.png', kinds: ['image', 'enhance'] },
  { id: 'outfit', label: '服饰替换', icon: 'i-lucide-shirt', cover: '/mock/home/tool-07-outfit.png', kinds: ['image', 'enhance'] },
  { id: 'upscale', label: '高清修复', icon: 'i-lucide-sparkles', cover: '/mock/home/tool-08-upscale.png', kinds: ['enhance'] },
  { id: 'motion', label: '动作特效', icon: 'i-lucide-person-standing', cover: '/mock/home/tool-09-motion.png', kinds: ['video'] },
  { id: 'camera', label: '运镜特效', icon: 'i-lucide-video', cover: '/mock/home/tool-10-camera.png', kinds: ['video'] }
]

/** 「继续创作」兜底：未登录 / 真实作品为空时展示，不冒充真实作品 */
export const HOME_CONTINUE_MOCK: ContinueItem[] = [
  {
    id: 'mock-continue-1',
    title: '雨夜回眸',
    cover: '/mock/home/continue-01-rain.png',
    status: 'edited',
    statusText: '最近编辑 · 10 分钟前'
  },
  {
    id: 'mock-continue-2',
    title: '角色立绘',
    cover: '/mock/home/continue-02-portrait.png',
    status: 'done',
    statusText: '已完成 · 3 小时前',
    done: true,
    // 「原图」层由同一张效果图降采样得到（同一画面坐标的真实派生，
    // 不是另画一张）。接入真实产物后用后端返回的源资产替换。
    compareBefore: '/mock/home/continue-02-portrait-before.png'
  },
  {
    id: 'mock-continue-3',
    title: '产品照片',
    cover: '/mock/home/continue-03-product.png',
    status: 'running',
    statusText: '生成中 · 约 2 分钟剩余'
  }
]

export const EXPLORE_CATEGORIES = ['推荐', '动画动漫', '影视创作', '产品展示'] as const
export type ExploreCategory = typeof EXPLORE_CATEGORIES[number]

/** 探索流首屏：与效果图同款 4 张（角标已烤入图内） */
export const EXPLORE_FIRST_BATCH: ExploreWork[] = [
  { id: 'mock-1', title: '春日列车·去见更好的自己', author: '夏目奈', cover: '/mock/home/explore-01.png', category: '推荐', badge: '热门', badgeBaked: true, mock: true },
  { id: 'mock-2', title: '风之誓约', author: '白夜不眠', cover: '/mock/home/explore-02.png', category: '推荐', badge: '热门', badgeBaked: true, mock: true },
  { id: 'mock-3', title: '云海之上', author: '山川记录者', cover: '/mock/home/explore-03.png', category: '推荐', badge: '热门', badgeBaked: true, duration: '00:24', mock: true },
  { id: 'mock-4', title: '光与香的诗', author: 'Lily 设计', cover: '/mock/home/explore-04.png', category: '推荐', badge: '热门', badgeBaked: true, duration: '00:34', mock: true }
]

/**
 * 生成探索流的第 n 批（n ≥ 2）。纯展示 mock，分页语义与真实接口一致：
 * 追加返回、空数组表示没有更多。
 */
