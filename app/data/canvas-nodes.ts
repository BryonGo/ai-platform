/**
 * 画布（织幕）节点契约：端口类型、分组、九类节点的定义。
 *
 * 这份文件是**前后端共用的契约**，照界面原型《织幕 PROTOTYPE · AI 影剧无界画布》的节点库逐条落成：
 * 剧本（剧本输入 / 剧本拆解）、角色（角色设定）、分镜（分镜生成）、生成（关键帧生成）、
 * 视频（图生视频）、音频（配音配乐）、输出（剪辑合成 / 成片导出）—— 7 组 9 类。
 *
 * 后端对应实现见 aicodcms/docs/canvas/ZHIMU-DATA-MODEL-R2.md 第 3 节；改这里就要改那里。
 *
 * 为什么节点类型写在前端（而不是从接口拉）：
 *   参数表单、端口、图标都是一次性画好的界面，类型注册表是开发者写的，改一次上一次线；
 *   真正的**数据**（每个节点当前用什么参数、产出了哪些版本）全部来自接口。
 */

// ---------------------------------------------------------------- 端口类型

/** 数据在节点之间流动的类型。同类型才允许连线（见 canConnect）。 */
export type CanvasPortType
  = | 'text' // 纯文字
    | 'outline' // 结构化大纲
    | 'table' // 表格（分镜表：一行一镜）
    | 'image' // 图片（可多张 / 多版本）
    | 'video' // 视频片段
    | 'audio' // 音频（配音 / 配乐）
    | 'cut' // 成片
    | 'zip' // 压缩包

export interface CanvasPortMeta {
  label: string
  /** 端口颜色：前端按类型着色，后端只认类型名。 */
  color: string
  icon: string
}

export const PORT_META: Record<CanvasPortType, CanvasPortMeta> = {
  text: { label: '文字', color: 'var(--hg3-i-amber)', icon: 'i-lucide-type' },
  outline: { label: '大纲', color: 'var(--hg3-i-orange)', icon: 'i-lucide-list-tree' },
  table: { label: '分镜表', color: 'var(--hg3-i-green)', icon: 'i-lucide-table' },
  image: { label: '图片', color: 'var(--hg3-i-blue)', icon: 'i-lucide-image' },
  video: { label: '视频', color: 'var(--hg3-i-coral)', icon: 'i-lucide-film' },
  audio: { label: '音频', color: 'var(--hg3-i-green)', icon: 'i-lucide-audio-lines' },
  cut: { label: '成片', color: 'var(--hg3-i-orange)', icon: 'i-lucide-clapperboard' },
  zip: { label: '压缩包', color: 'var(--hg3-i-gray)', icon: 'i-lucide-package' }
}

export function portMeta(type: CanvasPortType): CanvasPortMeta {
  return PORT_META[type] ?? PORT_META.text
}

// ---------------------------------------------------------------- 分组

export type CanvasGroupKey = 'script' | 'cast' | 'board' | 'gen' | 'video' | 'audio' | 'out'

export interface CanvasGroupMeta {
  key: CanvasGroupKey
  label: string
  color: string
}

/** 左栏节点库的分组，顺序即显示顺序。 */
export const CANVAS_GROUPS: CanvasGroupMeta[] = [
  { key: 'script', label: '剧本', color: 'var(--hg3-i-amber)' },
  { key: 'cast', label: '角色', color: 'var(--hg3-i-coral)' },
  { key: 'board', label: '分镜', color: 'var(--hg3-i-green)' },
  { key: 'gen', label: '生成', color: 'var(--hg3-i-blue)' },
  { key: 'video', label: '视频', color: 'var(--hg3-i-orange)' },
  { key: 'audio', label: '音频', color: 'var(--hg3-i-green)' },
  { key: 'out', label: '输出', color: 'var(--hg3-i-coral)' }
]

export function groupMeta(key: CanvasGroupKey): CanvasGroupMeta {
  return CANVAS_GROUPS.find(g => g.key === key) ?? CANVAS_GROUPS[0]!
}

// ---------------------------------------------------------------- 节点类型

export type CanvasNodeKind
  = | 'script_in'
    | 'script_split'
    | 'character'
    | 'shotlist'
    | 'keyframe'
    | 'i2v'
    | 'audio'
    | 'compose'
    | 'export'

/** 参数控件的声明。表单按它渲染，不用为新节点写新组件。 */
export interface CanvasParamSpec {
  key: string
  label: string
  kind: 'text' | 'textarea' | 'number' | 'select' | 'frames'
  options?: { value: string, label: string }[]
  placeholder?: string
  hint?: string
}

export interface CanvasPortSpec {
  /** 槽位名，连线与产物都按它归属（同一节点内唯一）。 */
  slot: string
  type: CanvasPortType
  label: string
  /** 必填输入：没选产物就不让跑（后端也要拒）。 */
  required?: boolean
  /** 允许多条入边（成片导出、剪辑合成要接 N 条视频）。 */
  multiple?: boolean
}

export interface CanvasNodeTypeSpec {
  kind: CanvasNodeKind
  group: CanvasGroupKey
  label: string
  /** 原型节点库里的副标题，原文照抄。 */
  subtitle: string
  icon: string
  width: number
  inputs: CanvasPortSpec[]
  outputs: CanvasPortSpec[]
  params: CanvasParamSpec[]
  /**
   * ready  —— 第一轮真跑（会建任务、会花钱）
   * planned —— 只立类型与端口，第一轮不实现执行，点了提示"本版未开放"
   */
  stage: 'ready' | 'planned'
  /** 跑一次大概花多少（分），仅用于界面预估；真实价格由服务端下发。 */
  estimateCredits?: number
}

/** H3 帧数网格：只接受 frames % 17 == 5、124–362；不在网格上的值会被上游静默吸附。
 *
 * 真源在服务端（overview 的 frameGrid 下发），这里是本地示例数据用的同一份值。 */
export const FRAME_GRID = [124, 141, 158, 175, 192, 209, 226, 243, 260, 277, 294, 311, 328, 345, 362] as const

/** 渲染档位：预览便宜、定稿才是交付。 */
export const RENDER_TIERS = {
  preview: { resolution: '432x768', label: '预览', note: '只看表演与运动，便宜十倍' },
  final: { resolution: '768x1344', label: '定稿', note: '原生竖屏，交付档' }
} as const

export type RenderTier = keyof typeof RENDER_TIERS

export const CANVAS_NODE_TYPES: CanvasNodeTypeSpec[] = [
  {
    kind: 'script_in',
    group: 'script',
    label: '剧本输入',
    subtitle: '导入或粘贴剧本文字',
    icon: 'i-lucide-scroll-text',
    width: 236,
    inputs: [],
    outputs: [{ slot: 'text', type: 'text', label: '剧本文本' }],
    params: [
      { key: 'text', label: '剧本', kind: 'textarea', placeholder: '把剧本贴进来，或点右上角上传 .txt / .md' }
    ],
    stage: 'ready',
    estimateCredits: 0
  },
  {
    kind: 'script_split',
    group: 'script',
    label: '剧本拆解',
    subtitle: '拆解为分镜大纲',
    icon: 'i-lucide-split',
    width: 236,
    inputs: [{ slot: 'text', type: 'text', label: '剧本文本', required: true }],
    outputs: [{ slot: 'outline', type: 'outline', label: '分镜大纲' }],
    params: [
      { key: 'granularity', label: '拆解粒度', kind: 'select', options: [{ value: 'shot', label: '按镜头（默认）' }, { value: 'scene', label: '按场次' }] },
      { key: 'note', label: '补充要求', kind: 'text', placeholder: '例如：每镜不超过 6 秒' }
    ],
    stage: 'ready',
    estimateCredits: 5
  },
  {
    kind: 'character',
    group: 'cast',
    label: '角色设定',
    subtitle: '三视图角色参考',
    icon: 'i-lucide-user-round',
    width: 236,
    inputs: [{ slot: 'outline', type: 'outline', label: '分镜大纲' }],
    outputs: [{ slot: 'image', type: 'image', label: '三视图' }],
    params: [
      { key: 'name', label: '角色名', kind: 'text', placeholder: '例如：林知遥' },
      { key: 'appearance', label: '外观锚点', kind: 'textarea', placeholder: '红衣、长发、左眉有疤——写清可复用的外观特征' },
      { key: 'views', label: '出图视角', kind: 'select', options: [{ value: '3', label: '正 / 侧 / 背 三视图' }, { value: '1', label: '只出正面' }] }
    ],
    stage: 'ready',
    estimateCredits: 24
  },
  {
    kind: 'shotlist',
    group: 'board',
    label: '分镜生成',
    subtitle: '生成镜头列表',
    icon: 'i-lucide-list-video',
    width: 268,
    inputs: [{ slot: 'outline', type: 'outline', label: '分镜大纲', required: true }],
    outputs: [{ slot: 'table', type: 'table', label: '分镜表' }],
    params: [
      { key: 'shotsPerScene', label: '每场镜头数', kind: 'number', hint: '默认 5，多了图会挤' },
      { key: 'frames', label: '默认帧数', kind: 'frames', hint: '单镜可按需在表格里改' }
    ],
    stage: 'ready',
    estimateCredits: 8
  },
  {
    kind: 'keyframe',
    group: 'gen',
    label: '关键帧生成',
    subtitle: '文生图生成关键帧',
    icon: 'i-lucide-image-plus',
    width: 248,
    inputs: [
      { slot: 'shot', type: 'table', label: '分镜表', required: true },
      { slot: 'ref', type: 'image', label: '角色参考' }
    ],
    outputs: [{ slot: 'image', type: 'image', label: '候选关键帧' }],
    params: [
      { key: 'modelId', label: '模型', kind: 'select', options: [] },
      { key: 'prompt', label: '画面提示词', kind: 'textarea', placeholder: '不填则用分镜里的关键帧提示词' },
      { key: 'count', label: '一次出几张', kind: 'select', options: [{ value: '3', label: '3 张（默认）' }, { value: '1', label: '1 张' }] }
    ],
    stage: 'ready',
    estimateCredits: 12
  },
  {
    kind: 'i2v',
    group: 'video',
    label: '图生视频',
    subtitle: '关键帧驱动生成视频',
    icon: 'i-lucide-clapperboard',
    width: 248,
    inputs: [{ slot: 'firstFrame', type: 'image', label: '首帧关键帧', required: true }],
    outputs: [{ slot: 'video', type: 'video', label: '视频片段' }],
    params: [
      { key: 'tier', label: '档位', kind: 'select', options: [{ value: 'preview', label: '预览 · 432x768 · 便宜十倍' }, { value: 'final', label: '定稿 · 768x1344 · 交付档' }] },
      { key: 'frames', label: '帧数', kind: 'frames' },
      { key: 'h3Prompt', label: '运动描述', kind: 'textarea', placeholder: '镜头怎么动、声音是什么' }
    ],
    stage: 'ready',
    estimateCredits: 96
  },
  {
    kind: 'audio',
    group: 'audio',
    label: '配音配乐',
    subtitle: '配音与背景音乐',
    icon: 'i-lucide-audio-lines',
    width: 236,
    inputs: [
      { slot: 'table', type: 'table', label: '分镜表' },
      { slot: 'video', type: 'video', label: '视频片段', multiple: true }
    ],
    outputs: [{ slot: 'audio', type: 'audio', label: '配音与配乐' }],
    params: [
      { key: 'voice', label: '音色', kind: 'select', options: [{ value: 'warm', label: '温和女声' }, { value: 'cold', label: '冷冽女声' }, { value: 'deep', label: '低沉男声' }] },
      { key: 'bgm', label: '背景音乐', kind: 'text', placeholder: '整集统一铺，逐镜不铺' }
    ],
    stage: 'planned',
    estimateCredits: 30
  },
  {
    kind: 'compose',
    group: 'out',
    label: '剪辑合成',
    subtitle: '自动为镜头成片',
    icon: 'i-lucide-scissors',
    width: 236,
    inputs: [
      { slot: 'video', type: 'video', label: '视频片段', required: true, multiple: true },
      { slot: 'audio', type: 'audio', label: '配音配乐' }
    ],
    outputs: [{ slot: 'cut', type: 'cut', label: '成片' }],
    params: [
      { key: 'transition', label: '转场', kind: 'select', options: [{ value: 'cut', label: '硬切' }, { value: 'fade', label: '淡入淡出' }] }
    ],
    stage: 'planned',
    estimateCredits: 40
  },
  {
    kind: 'export',
    group: 'out',
    label: '成片导出',
    subtitle: '导出成片链接',
    icon: 'i-lucide-download',
    width: 236,
    inputs: [{ slot: 'video', type: 'video', label: '视频片段', required: true, multiple: true }],
    outputs: [{ slot: 'zip', type: 'zip', label: '压缩包' }],
    params: [
      { key: 'nameRule', label: '命名规则', kind: 'text', hint: 'E{集号}-S{镜号}.mp4，镜号补零位数按本集最大镜号' }
    ],
    stage: 'ready',
    estimateCredits: 0
  }
]

export function nodeTypeSpec(kind: CanvasNodeKind): CanvasNodeTypeSpec {
  const spec = CANVAS_NODE_TYPES.find(t => t.kind === kind)
  if (!spec) throw new Error(`未知节点类型：${kind}`)
  return spec
}

/** 连线合法性：同类型才允许连。 */
export function canConnect(from: CanvasPortType, to: CanvasPortType): boolean {
  return from === to
}

/** 帧数 → 时长（24fps）。 */
export function framesToSeconds(frames: number): number {
  return Math.round((frames / 24) * 100) / 100
}

/** 分 → ¥（平台 100 分 = 1 元）。 */
export function creditsToYuan(credits: number): string {
  return `¥${(credits / 100).toFixed(2)}`
}
