/**
 * 画布（织幕）假数据与领域常量。
 *
 * 这一版**只做前端**：先把节点、状态机、审核卡点、成本口径用假数据跑通，
 * 等界面与交互定稿后，后端照这份数据结构实现接口（字段名即契约）。
 *
 * 术语与阶段编号对齐《织幕方案B实施方案 v0.1》：
 *   S1–S3 剧本与分镜 → S4 角色/场景资产 → S5 关键帧 → S6 预览渲染 →
 *   S7 定稿渲染 → S8 超分 → S9 合成与 AI 标识
 */

/** H3 只接受 frames % 17 == 5 的帧数，训练范围 124–362（方案 §4.1 校验器第 1 条）。
 *
 * 这份枚举必须与后端校验器、ComfyUI 工作流共用同一份 —— 不在这张表里的帧数
 * 会被上游**静默向上吸附**，不报错也不提示，是分镜环节最容易踩的坑。 */
export const FRAME_GRID = [124, 141, 158, 175, 192, 209, 226, 243, 260, 277, 294, 311, 328, 345, 362] as const

/** 帧数 → 时长（24fps）。 */
export function framesToSeconds(frames: number): number {
  return Math.round((frames / 24) * 100) / 100
}

/** 渲染档位：预览便宜、定稿才是交付。 */
export const RENDER_TIERS = {
  preview: { resolution: '432x768', label: '预览', note: '只看表演与运动，便宜十倍' },
  final: { resolution: '768x1344', label: '定稿', note: '原生竖屏，交付档' }
} as const

export type RenderTier = keyof typeof RENDER_TIERS

/** 镜头状态机。
 *
 * 卡点的意义：只有 approved 才允许进下一步（图片几毛钱，一次定稿渲染却要占几分钟 GPU）。
 * rejected 不删除任何东西，只表示"这批候选都不可用，重跑"。 */
export type ShotStatus
  = | 'draft' // 还没出关键帧
    | 'keyframe_ready' // 有候选关键帧，等导演选
    | 'preview_rendered' // 预览已出，等判断是否进定稿
    | 'approved' // 定稿已选，可以进合成
    | 'rejected' // 候选被驳回，等待重跑

export const SHOT_STATUS: Record<ShotStatus, { label: string, tone: 'muted' | 'run' | 'warn' | 'ok' | 'bad' }> = {
  draft: { label: '待生成', tone: 'muted' },
  keyframe_ready: { label: '待选片', tone: 'warn' },
  preview_rendered: { label: '待确认', tone: 'run' },
  approved: { label: '已定稿', tone: 'ok' },
  rejected: { label: '已驳回', tone: 'bad' }
}

export interface ShotCandidate {
  id: string
  /** 关键帧（图）/ 预览（视频）/ 定稿（视频） */
  stage: 'keyframe' | 'preview' | 'final'
  url: string
  /** 竖屏素材标注，用于卡片上显示比例徽标 */
  note?: string
  picked?: boolean
}

export interface ShotDialogue {
  speaker: string
  lang: string
  start: string
  line: string
}

export interface CanvasShot {
  id: string
  index: number
  shotSize: string
  camera: string
  frames: number
  scene: string
  characters: { speaker: string, asset: string, views: string[] }[]
  dialogue: ShotDialogue[]
  keyframePrompt: string
  h3Prompt: { description: string, soundscape: string, music: string }
  status: ShotStatus
  candidates: ShotCandidate[]
  /** 本镜已花费（分，与平台余额同单位） */
  costCredits: number
  /** 已渲染次数（含返工） */
  renders: number
  updatedAt: string
}

export interface CostBucket {
  stage: string
  credits: number
}

export interface CanvasEpisode {
  id: string
  title: string
  /** 本集预算（分） */
  budgetCredits: number
  shots: CanvasShot[]
  costs: CostBucket[]
}

export interface CanvasSeries {
  id: string
  title: string
  logline: string
  episodes: { id: string, title: string, status: 'done' | 'running' | 'todo' }[]
}

const IMG = ['/mock/home/explore-01.png', '/mock/home/explore-02.png', '/mock/home/explore-03.png', '/mock/home/explore-04.png']

/** 安全取图：索引越界时回到第一张（示例数据不该因为取图崩掉）。 */
function pic(i: number): string {
  return IMG[i % IMG.length] ?? IMG[0] ?? ''
}

function shot(
  index: number,
  shotSize: string,
  camera: string,
  frames: number,
  status: ShotStatus,
  cost: number,
  renders: number,
  scene = 'SC-破庙-夜',
  keyframePrompt = '破庙内烛火摇曳，红衣女子回头望向门口，冷色调电影布光，竖构图',
  line = '你不是已经死了吗？'
): CanvasShot {
  const candidates: ShotCandidate[] = []
  if (status !== 'draft') {
    candidates.push(
      { id: `E01-S${index}-k1`, stage: 'keyframe', url: pic(index), note: '候选 1' },
      { id: `E01-S${index}-k2`, stage: 'keyframe', url: pic(index + 1), note: '候选 2' },
      { id: `E01-S${index}-k3`, stage: 'keyframe', url: pic(index + 2), note: '候选 3' }
    )
  }
  if (status === 'preview_rendered' || status === 'approved') {
    candidates.push({ id: `E01-S${index}-p1`, stage: 'preview', url: pic(index + 1), note: '432×768' })
  }
  if (status === 'approved') {
    candidates.push({ id: `E01-S${index}-f1`, stage: 'final', url: pic(index), note: '768×1344', picked: true })
  }
  return {
    id: `E01-S${String(index).padStart(2, '0')}`,
    index,
    shotSize,
    camera,
    frames,
    scene,
    characters: [{ speaker: 'S1', asset: 'CH-林知遥', views: ['正面', '侧面'] }],
    dialogue: [{ speaker: 'S1', lang: '中文', start: '00:03.500', line }],
    keyframePrompt,
    h3Prompt: {
      description: '破庙内烛火摇曳。红衣女子缓缓回头，眼神由警惕转为震惊。',
      soundscape: '风穿过破窗的呼啸，烛芯噼啪，远处一声闷雷',
      music: ''
    },
    status,
    candidates,
    costCredits: cost,
    renders,
    updatedAt: '2026-09-15 22:10'
  }
}

/** 一集 15 镜的样例：故意覆盖全部五种状态，方便看清状态机与卡点。 */
export const MOCK_SHOTS: CanvasShot[] = [
  shot(1, '远景', '固定', 124, 'approved', 268, 2),
  shot(2, '全景', '缓慢推近', 158, 'approved', 251, 1),
  shot(3, '中景', '跟拍', 158, 'preview_rendered', 232, 1),
  shot(4, '近景', '缓慢推近', 175, 'keyframe_ready', 78, 2),
  shot(5, '特写', '固定', 124, 'keyframe_ready', 66, 3),
  shot(6, '中景', '横移', 192, 'keyframe_ready', 54, 1),
  shot(7, '近景', '缓慢推近', 158, 'preview_rendered', 240, 2),
  shot(8, '全景', '环绕', 226, 'draft', 0, 0),
  shot(9, '中景', '固定', 158, 'draft', 0, 0),
  shot(10, '特写', '缓慢推近', 124, 'rejected', 96, 3),
  shot(11, '近景', '跟拍', 175, 'draft', 0, 0),
  shot(12, '中景', '固定', 158, 'draft', 0, 0),
  shot(13, '全景', '横移', 192, 'draft', 0, 0),
  shot(14, '近景', '缓慢推近', 158, 'draft', 0, 0),
  shot(15, '特写', '固定', 124, 'draft', 0, 0)
]

export const MOCK_COSTS: CostBucket[] = [
  { stage: 'S1–S3 剧本与分镜', credits: 151 },
  { stage: 'S4 角色与场景资产', credits: 117 },
  { stage: 'S5 关键帧', credits: 402 },
  { stage: 'S6/S7 渲染', credits: 1012 },
  { stage: 'S8–S9 超分与合成', credits: 79 }
]

export const MOCK_SERIES: CanvasSeries = {
  id: 'SR-001',
  title: '破庙新娘',
  logline: '她在自己婚礼的夜里死去，七天后又在同一座破庙里醒来。',
  episodes: [
    { id: 'E01', title: '第 1 集 · 回魂夜', status: 'running' },
    { id: 'E02', title: '第 2 集 · 借尸', status: 'todo' },
    { id: 'E03', title: '第 3 集 · 换命', status: 'todo' }
  ]
}

export const MOCK_EPISODE: CanvasEpisode = {
  id: 'E01',
  title: '第 1 集 · 回魂夜',
  budgetCredits: 2800,
  shots: MOCK_SHOTS,
  costs: MOCK_COSTS
}

/** 本集总花费（分）。 */
export function totalCost(shots: CanvasShot[]): number {
  return shots.reduce((sum, s) => sum + s.costCredits, 0)
}

/** 需要人处理的数量（卡点）：待选片 + 待确认 + 已驳回。 */
export function pendingCount(shots: CanvasShot[]): number {
  return shots.filter(s => s.status === 'keyframe_ready' || s.status === 'preview_rendered' || s.status === 'rejected').length
}

/** 分 → ¥（平台 100 分 = 1 元）。 */
export function creditsToYuan(credits: number): string {
  return `¥${(credits / 100).toFixed(2)}`
}
