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
  badge?: '热门' | '最新'
  badgeBaked?: boolean
  /** 视频作品的时长角标，如 00:24 */
  duration?: string
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

/** 后续批次用项目内已有的模型封面真图，避免无限滚动时反复出现同样 4 张 */
const COVER_POOL = [
  '00751fe7-8569-4afa-a6f6-f479bdfce472.avif',
  '0a2261f3-167e-4aae-8037-37102dcbed20.avif',
  '13394b76-0835-4438-b142-15451456c41e.avif',
  '20f18646-82f8-421f-ba17-fc214ebdfba2.avif',
  '2b602dff-e21b-4fd7-9a81-946692b3e1b0.avif',
  '31780670-b797-420e-8206-be7adf49efcd.avif',
  '39460a16-6513-49e2-9ca7-f92f1f6f64e2.avif',
  '417545ae-57e5-480a-8313-63293b5ec78f.avif',
  '492ccab1-2f41-4bd3-9525-077c7b0d0bb7.avif',
  '531e2d91-8254-4245-941f-e098f15d6efe.avif',
  '5b487e67-40ef-4c8d-b054-0051a57cf32d.avif',
  '5ebee605-f034-46ec-b861-66e37a4eeda5.avif',
  '656d09af-d211-45fc-89c5-e2bf6ed65b0c.avif',
  '6ddb565f-5ea9-44b9-ac9c-fa1842716afc.avif',
  '7882381e-44bf-4ff3-bdbf-cc79b50eb1c5.avif',
  '7f32c2e3-dfee-40d9-b0a5-70f6f33bfc9d.avif',
  '871e7e10-ee32-41c5-9bdd-f511cd84e7b0.avif',
  '91cb626d-f083-4610-bb94-48d01ecf42ba.avif',
  '9b22782a-d9f3-4df2-9be9-20deecdfbfd1.avif',
  'a20ac0f6-4a5b-487b-b15b-a43bf9243285.avif',
  'a9d6f187-fa71-4515-9e61-c5f0663f9aaa.avif',
  'aebabb24-0968-45ae-ae63-30f2574d82f1.avif',
  'bb3663d6-16d7-4434-a64f-72d26606b724.avif',
  'c3354215-d700-4e06-9f49-007538b09bde.avif',
  'cb1b073c-de70-4c65-9608-b54a535d31f9.avif',
  'd50a0b9b-6261-4ef7-a7e8-b09190f8ed5a.avif',
  'deeb9ccb-58d5-4146-98cf-eb4f203a543b.avif',
  'e5f9f9a4-d2cb-4c08-8ebc-f6294ddbfce3.avif',
  'f071148d-b40e-48ae-ab67-e081ef08589f.avif',
  'f51a34a3-2e8f-45c2-8ec6-7e558513409d.avif',
  'fd88e25d-2816-4800-a254-a9aa4632bcfc.avif'
]

const FILLER_AUTHORS = ['镜中月', '拾光者', '一只狐狸', '夜航船', '木子设计', '青岚', '南风工作室', '秋声']
const FILLER_TITLES = ['雨停之后', '城市的夜', '她的侧影', '旧梦如画', '雪落长安', '海与灯塔', '黄昏车站', '归途', '琉璃时光', '风起时', '月下独行', '沉默的夏天']

/**
 * 生成探索流的第 n 批（n ≥ 2）。纯展示 mock，分页语义与真实接口一致：
 * 追加返回、空数组表示没有更多。
 */
export function exploreBatch(category: ExploreCategory, page: number, size = 4): ExploreWork[] {
  if (page < 2) return EXPLORE_FIRST_BATCH
  const offset = ((page - 2) * size) % COVER_POOL.length
  return Array.from({ length: size }, (_, index) => {
    const cursor = offset + index
    const cover = COVER_POOL[cursor % COVER_POOL.length]!
    return {
      id: `mock-${category}-${page}-${index}`,
      title: FILLER_TITLES[cursor % FILLER_TITLES.length]!,
      author: FILLER_AUTHORS[cursor % FILLER_AUTHORS.length]!,
      cover: `/model-covers/${cover}`,
      category,
      badge: page % 2 === 0 ? '热门' as const : '最新' as const,
      duration: index % 3 === 0 ? '00:18' : undefined,
      mock: true
    }
  })
}
