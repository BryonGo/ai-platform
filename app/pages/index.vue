<script setup lang="ts">
import {
  EXPLORE_CATEGORIES,
  type ToolKind,
  type ContinueItem,
  type ExploreCategory,
  type ExploreWork
} from '~/data/hougong-home'
import type { HougongTask, WorkItem } from '~/composables/useHougongApi'
import { vAutoPlayVideo, videoFirstFrameSrc } from '~/composables/useAutoPlayVideo'
import { toExploreWork } from '~/utils/work-feed'

const hgApi = useHougongApi()
const session = useAuthSession()
const { openDialog } = useAuthDialog()
const { setDraft } = useComposerDraft()

/* ---------------- 输入器 ----------------
 *
 * 首页与创作页**共用同一个输入器组件**（HgChatComposer）。
 * 之前两页各写了一套（首页工具栏只有 比例/分辨率/时长，上传是正文里的方框；创作页多了
 * 参考图/LoRA/参数，发送按钮在框内），同一个动作两种交互、时长胶囊还漏了数值 —— 用户反馈
 * 「首页的交互按钮和创作页不一致」。现在状态统一由 useChatStudio 持有，两页只差一个提交动作：
 * 首页把这次输入交成**草稿**再跳创作页，创作页直接建任务。
 */
const studio = provideChatStudio()
const notice = ref('')

/* 全部工具：目录驱动（后台「创作工具」维护），分类筛选 + 搜索。
 *
 * 目录为空就**如实为空**、整块不渲染：以前空目录会回落一屏写死的示例工具，
 * 名字和入口都是编的，点进去后端只会拒绝 —— 那是拿假货撑门面。 */
const toolCatalog = useToolCatalog()

/** 统一的展示结构：目录项映射成它，模板只认这几个字段。 */
interface ToolCard {
  key: string
  to: string
  label: string
  icon: string
  cover: string
  /** 对比原图（处理前）。与 cover 成对时卡片出对比滑块。 */
  coverBefore?: string
  /**
   * 卡片循环预览视频（后台 hougong_tool.cover_video）。有值时卡片播它，
   * cover 当封面帧；没有就还是静态图。
   */
  coverVideo?: string
  kinds: ToolKind[]
  /** 一句话说明（悬停卡里显示），取后端目录的 summary。 */
  summary: string
  /**
   * 色底。快捷片的每个技能一个颜色（参考站就是这么分的）。
   *
   * 目前**由前端按序号循环取**：后端目录还没有颜色字段。等 hougong_tool 补了色值，
   * 这里换成 `tool.tint` 即可，取色逻辑只在这一处。
   */
  tint: string
}

/** 快捷片色板：按目录顺序循环取色。 */
const QUICK_TINTS = ['#ff4fc3', '#a855f7', '#4f8cff', '#2dd4bf', '#eab308', '#a3e635', '#fb923c', '#8b5cf6']

const toolCards = computed<ToolCard[]>(() => {
  const fromCatalog: ToolCard[] = toolCatalog.tools.value.map((tool, index) => ({
    key: `tool:${tool.code}`,
    to: `/tool/${tool.code}`,
    label: tool.name,
    icon: tool.icon || 'i-lucide-sparkles',
    // 封面走**后台配置**（hougong_tool.cover / cover_before），不再写死底图。
    // 原来这里固定一张 daji-three-tail-front-v1.webp：结果"脱衣"卡挂的是穿红裙的
    // 示例图，跟这个工具做什么无关；换素材还得等一次前端发版。
    cover: tool.cover || tool.coverBefore || '',
    coverBefore: tool.coverBefore || '',
    coverVideo: tool.coverVideo || '',
    kinds: [tool.category as ToolKind],
    summary: tool.summary || '',
    // 取模后一定命中，但 noUncheckedIndexedAccess 下索引结果是 string|undefined，兜一手
    tint: QUICK_TINTS[index % QUICK_TINTS.length] || '#ff4fc3'
  }))
  // 目录为空就**如实为空**，不再回落 HOME_TOOLS 那批写死的示例工具。
  //
  // 兜底会让"配置错了/站点没解析对/接口抖动"和"后台确实一个工具都没配"表现完全一样：
  // 都变成展示 10 个跟本站无关的工具卡（实测踩到过 —— 本地 Host 不对导致站点回落默认站，
  // 目录拿到 0 条，首页却"看着很正常"）。没有真数据时宁可这一块不出现。
  return fromCatalog
})

/**
 * 首页快捷片：**只铺前 8 个**（上 5 下 3），第 9 格固定是「跳转」箭头 → 技能页。
 *
 * 数量改这一个常量就够；和参考站的分法一致（多出来的技能在技能页里找）。
 */
const QUICK_COUNT = 8
const quickTools = computed(() => toolCards.value.slice(0, QUICK_COUNT))

/**
 * 按「上排 5 / 下排（其余 + 跳转格）」切成两行，行内卡片**按文字自适应宽度**。
 *
 * 卡片不再等宽（原来 `width: calc((100% - 32px) / 5)` 固定 5 列等宽）：等宽时
 * 「脱衣」两个字的卡和「裸体姿势视频」一样宽，短名字右侧空一大截，用户反馈
 * 「字的空白太多」。改成 hug 内容后整排明显更紧凑。
 *
 * 但 hug 宽度后**不能靠 flex 自然换行**决定行：换行位置取决于文案长度，
 * 会随目录内容在 6+2 / 5+3 之间跳，「上 5 下 3」的节奏就没了 —— 所以这里显式分两行。
 * 每行自身仍 flex-wrap：窄屏放不下时行内自己换，不会横向溢出。
 */
const quickRows = computed(() => [quickTools.value.slice(0, 5), quickTools.value.slice(5)])

/** 悬停卡：鼠标停在某一格上（或键盘把焦点移到它上面）时显示「封面 + 名称 + 说明」。 */
const hoverTool = ref<ToolCard | null>(null)

/* 悬停卡是 .quick-grid 里**独立的一层**，不再挂在卡片内部。
 *
 * 挂卡片内部就只能用 `left: 50% + translateX(-50)` 居中，而浮层比单张卡片宽，
 * 窄视口（约 700-880px，此时侧栏已收起、快捷片贴着视口左边）下最左/最右一格的
 * 浮层会顶出视口 —— hover 一下凭空多出一条横向滚动条。
 * 现在位置由 placeQuickPop() 按原型的算法算好并夹进视口。 */
const quickGridEl = ref<HTMLElement | null>(null)
const quickPopEl = ref<HTMLElement | null>(null)
const quickPopStyle = ref<Record<string, string>>({})
/** 浮层当前锚定的那一格（非响应式，只在需要重量位置时读）。 */
let quickPopAnchor: HTMLElement | null = null

/** 与 .quick-pop 的 CSS 同源：离卡片 10px、离视口边缘至少 12px。 */
const QUICK_POP_GAP = 10
const QUICK_POP_MARGIN = 12

/**
 * 把悬停卡钉在那一格正上方，并**夹在视口内**。
 *
 * 原型是 `position: fixed` + `Math.max(12, Math.min(中心 - 半宽, innerWidth - 宽 - 12))`
 * （hougong-oii.html 的 showQuickPop），这里照搬那套夹取，只把坐标换算到 .quick-grid 内部：
 * 浮层因此**跟着内容一起滚**，不需要再监听 scroll 把它收起来。
 */
function placeQuickPop() {
  const anchor = quickPopAnchor
  const pop = quickPopEl.value
  const grid = quickGridEl.value
  if (!anchor || !pop || !grid) return
  const chip = anchor.getBoundingClientRect()
  const gridRect = grid.getBoundingClientRect()
  const width = pop.offsetWidth
  const height = pop.offsetHeight
  // clientWidth 不含滚动条：用 innerWidth 会把「贴着滚动条」也算成越界
  const viewWidth = document.documentElement.clientWidth
  const left = Math.max(
    QUICK_POP_MARGIN,
    Math.min(chip.left + chip.width / 2 - width / 2, viewWidth - width - QUICK_POP_MARGIN)
  )
  const top = Math.max(QUICK_POP_MARGIN, chip.top - height - QUICK_POP_GAP)
  quickPopStyle.value = {
    left: `${Math.round(left - gridRect.left)}px`,
    top: `${Math.round(top - gridRect.top)}px`
  }
}

/** 打开悬停卡（鼠标进入与键盘聚焦共用一条路径，两者看到的信息完全一致）。 */
async function openQuickPop(event: Event, tool: ToolCard) {
  hoverTool.value = tool
  quickPopAnchor = event.currentTarget as HTMLElement
  // 等浮层真正渲染出来，量到的才是它的实际宽高（说明文字行数不定，写死高度会飘）
  await nextTick()
  placeQuickPop()
}

/** 收起悬停卡。 */
function closeQuickPop() {
  quickPopAnchor = null
  hoverTool.value = null
}

/** 视口尺寸变了，夹取结果就过期了：还在悬停/聚焦时重量一次。 */
function onQuickPopResize() {
  if (quickPopAnchor) placeQuickPop()
}

/** 这一格是否已选中：视觉（active）与读屏（aria-pressed）取自同一个判断。 */
function isQuickToolActive(tool: ToolCard) {
  return studio.activeTool.value === tool.key.replace('tool:', '')
}

/**
 * 当前选中的技能卡，给**没有 hover 的设备**用的可见说明（见模板里的 .quick-selected）。
 *
 * 说明文字以前只有悬停浮层这一个出口，而浮层在 `(hover: none)` 下是 display:none ——
 * 触屏用户点选后看不到任何说明。这里按 studio.activeTool 反查目录（用 toolCards 而不是
 * quickTools：从技能页带回的选中项可能不在这 8 格里，那时也该显示写的是哪个技能），
 * 没选中或没写说明时返回 undefined，元素随之消失。
 */
const selectedToolCard = computed(() => {
  const code = studio.activeTool.value
  if (!code) return undefined
  return toolCards.value.find(tool => tool.key === `tool:${code}`)
})

/** 点快捷片 = 选中该技能；输入框上方随即出现技能胶囊（配了模板的还会有模板）。 */
function pickQuickTool(tool: ToolCard) {
  const code = tool.key.replace('tool:', '')
  studio.setTool(studio.activeTool.value === code ? '' : code)
}

/** 进行中的任务数（来自真实作品状态） */
const runningWorks = ref(0)

/**
 * 登录态。首页的「继续创作」「探索灵感」**只服务登录用户**：未登录时整块隐藏，
 * 连骨架和错误态都不出现，也不发对应请求 ——
 * 这两块的数据都要凭据，未登录请求只会换回 401 或空列表，渲染出来要么是一屏假热闹
 * （示例数据），要么是一句对访客毫无意义的「加载失败」。
 * 会话恢复是异步的（app.vue 的 onMounted 用 HttpOnly Cookie 换 token），首帧必然是
 * 未登录视角，token 到位后由下面的 watch 补拉。
 */
const loggedIn = computed(() => !!session.token.value)

onMounted(() => {
  // 首页各区块各自立刻取数，**不**排在 SDK 初始化后面。
  // studio.init 内部会 await session.load()（此刻它可能发一次 auto-login 用
  // HttpOnly Cookie 恢复会话），但拉的是目录/角色/工具，与下面两个区块互不依赖；
  // 以前那种写法会让探索流、继续创作、工具目录全部等一次网络初始化，首屏出现明显的空窗。
  void studio.init({ withSessions: false }) // withSessions:false —— 首页不读会话/消息
  void toolCatalog.ensure()
  void loadContinue()
  void loadExplore(true)
  window.addEventListener('resize', onQuickPopResize, { passive: true })
})

/**
 * 登录态一到位就补拉这两块。
 *
 * 必须补这一下：Vue 里**子页面的 onMounted 先于父组件 app.vue 的 onMounted**，
 * 而恢复会话的 session.load()（内含 cookie auto-login）挂在 app.vue 的 onMounted 上。
 * 于是上面两次取数读到的 token 永远是空的：已登录用户看不到这两块，未登录时它们本来
 * 也不该请求（见 loggedIn）。token 变空（退出登录 / 401 被清）时反向清空，
 * 免得把上一个账号的作品留在屏幕上。
 */
watch(loggedIn, (value) => {
  if (!value) {
    continueItems.value = []
    runningWorks.value = 0
    continueLoading.value = false
    exploreItems.value = []
    exploreError.value = ''
    exploreDone.value = true
    return
  }
  void loadContinue()
  void loadExplore(true)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', onQuickPopResize)
})

/* ---------------- 继续创作 ---------------- */

const continueItems = ref<ContinueItem[]>([])
const continueLoading = ref(false)

function relativeTime(ts: number) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const minute = 60_000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  return `${Math.floor(diff / (24 * 60 * minute))} 天前`
}

/**
 * 任务状态 → 卡片文案（后端契约 9 态，见 `internal/platform/task/data/task.go`）。
 *
 * ⚠️ 这张表当前**取不到值**，不是笔误：作品只在任务**成功之后**才入库
 * （`useChatStudio` 里 `createWork` 唯一一次调用就在 `status === 'succeeded'` 分支上），
 * 而 `/hougong/works` 的响应里也没有 status 字段。所以作品卡片的实际文案一律走
 * `?? '最近编辑'` 兜底 —— 对「继续创作」这个列表来说，那正是想要的文案
 * （列的是已完成的产物，不是进行中的活儿）。写成全集是为了后端哪天补了字段时
 * 每个状态都有正确文案，而不是静默落到兜底上。
 */
const STATUS_TEXT: Record<string, { status: ContinueItem['status'], text: string }> = {
  succeeded: { status: 'done', text: '已完成' },
  queued: { status: 'running', text: '排队中' },
  submitting: { status: 'running', text: '提交中' },
  running: { status: 'running', text: '生成中' },
  saving: { status: 'running', text: '保存中' },
  reconciling: { status: 'running', text: '核对中' },
  cancel_requested: { status: 'running', text: '取消中' },
  failed: { status: 'edited', text: '已失败' },
  cancelled: { status: 'edited', text: '已取消' }
}

/** 任务终态集合（与后端 Status.Terminal() 一致）。非终态 = 还在跑。 */
const TASK_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

/**
 * 提交（首页侧）：不建任务，把这次输入交成草稿并跳到创作页。
 * 真正的计费与建任务发生在创作页（首页跳转本身不产生第二次任务，见交接文档第 4 节）。
 */
function submitLanding() {
  notice.value = ''
  // 用 studio.prompt（= promptText + applyImageRefRoles）：视频模式下第 1 张是首帧，
  // 措辞必须按模式算好再交接给创作页 —— 草稿只带纯文本，过去这一步直接把 chip 的
  // 插入时措辞抄过去，编号一旦对不上模型就会改错图。
  const text = studio.prompt.value
  const references = studio.references.value
  if (!text.trim() && references.length === 0) {
    notice.value = '请先描述这一幕。'
    return
  }
  if (!session.token.value) {
    openDialog({ reason: 'generate', resume: 'composer' })
    notice.value = '当前输入已在本页面保留，登录后即可继续生成。'
    return
  }
  setDraft({
    prompt: text,
    mode: studio.mode.value,
    ratio: studio.ratio.value,
    durationSeconds: studio.seconds.value,
    uploadName: references[0]?.name || '',
    files: references.map(item => item.file).filter((f): f is File => !!f),
    // 参考图按**原顺序**整组交接：从素材库选的图没有 File，只传 files 会把它整批丢掉，
    // 而「@图1 / @图2」的编号就是靠这个顺序（素材库图 + 本地文件混排也要对得上）。
    references: references.map(item => item.file
      ? { file: item.file, name: item.name }
      : { assetId: item.assetId, url: item.preview, name: item.name }),
    // 已选模型一并交接，避免用户在对话页重选（交接文档第 4 节）
    modelId: studio.selectedModel.value?.id,
    modelChannel: studio.selectedModel.value?.channel,
    // 工具/玩法也必须交接：参考图上限由「模型 + 工具」共同决定，
    // 只交模型的话创作页的 toolNeedsImage 还是 false，图会被判成"超限"丢掉。
    toolCode: studio.activeTool.value || undefined,
    templateCode: studio.activeTemplate.value || undefined
  })
  // 工具同时走 URL（创作页 init 会读 route.query.tool/template 并按工具落位模型与参数），
  // 与草稿里的字段互为兜底：刷新页面/直接深链时 URL 仍然有效。
  const query = new URLSearchParams()
  if (studio.activeTool.value) query.set('tool', studio.activeTool.value)
  if (studio.activeTemplate.value) query.set('template', studio.activeTemplate.value)
  const suffix = query.toString()
  void navigateTo(suffix ? `/create?${suffix}` : '/create')
}

async function loadContinue() {
  // 未登录：这一块整体不出现（模板由 loggedIn 兜着），所以连骨架都不闪、请求也不发。
  if (!loggedIn.value) {
    continueItems.value = []
    runningWorks.value = 0
    continueLoading.value = false
    return
  }
  continueLoading.value = true
  // 没有作品 / 取数失败 → **如实为空**，不塞 HOME_CONTINUE_MOCK 那批示例。
  // 「继续创作」顾名思义是接着自己的活儿干，展示一批不是用户的作品只是看着热闹。
  continueItems.value = []
  runningWorks.value = 0
  try {
    const works: WorkItem[] = await hgApi.listWorks()
    // 角标「任务 (N)」数的是**在飞的任务**，所以必须去任务接口取数。
    // 以前这里筛的是作品（`works.filter(w => w.status === 'running' || 'queued')`），
    // 而作品只在任务成功后才入库（见 STATUS_TEXT 的说明）→ 恒为 0 →
    // 这个角标实际上永远不会出现。在飞状态只存在于任务接口。
    // 取数失败按 0 处理：角标是锦上添花，不该把整块「继续创作」拖成空。
    const tasks: HougongTask[] = await hgApi.listTasks().catch(() => [])
    runningWorks.value = tasks.filter(task => !TASK_TERMINAL_STATUSES.has(task.status)).length
    continueItems.value = works.slice(0, 3).map((work) => {
      // work.status 目前后端不下发（见 WorkItem.status 的说明），所以这里必然走兜底；
      // 保留查表是为了后端哪天补字段时能直接生效。
      const meta = STATUS_TEXT[work.status ?? ''] ?? { status: 'edited' as const, text: '最近编辑' }
      // 视频作品没有封面图：后端只给 videoUrl（imageUrl 为空），卡片按 kind 走
      // <video> 分支。以前这里取 imageUrl，视频作品就是一张坏图。
      const isVideo = work.kind === 'video'
      return {
        id: String(work.id),
        title: work.title || `作品 ${String(work.id).slice(-6)}`,
        cover: work.imageUrl || '',
        kind: isVideo ? 'video' as const : 'image' as const,
        videoUrl: isVideo ? (work.videoUrl || '') : '',
        status: meta.status,
        // 作品接口给的是 Unix 秒，relativeTime 按毫秒算差 —— 不乘 1000 会显示
        // 「20691 天前」（实测）。这里顺手把它对齐。
        statusText: `${meta.text} · ${relativeTime(work.createdAt * 1000)}`
      }
    })
  } catch {
    continueItems.value = []
    runningWorks.value = 0
  } finally {
    continueLoading.value = false
  }
}

/* ---------------- 探索灵感（无限滚动） ---------------- */

// 探索作品**只有真实数据**：取数走后端 `listWorksFeed(scope=explore)`（全站已发布），
// 没有 mock 条目、也不和示例作品混排 —— 取不到就整块不渲染（模板的 v-if 兜着）。
const exploreCategory = ref<ExploreCategory>('推荐')
const exploreItems = ref<ExploreWork[]>([])
const explorePage = ref(1)
const exploreLoading = ref(false)
const exploreDone = ref(false)
const exploreError = ref('')
const exploreReady = ref(false)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
// 请求令牌：切分类 / 重试会让在途请求作废，避免旧批次覆盖新列表
let requestId = 0

const PAGE_SIZE = 4

/**
 * 后端作品 → 首页展示结构。
 *
 * 角标是**推导**出来的，不是后端字段：有互动量算「热门」，否则七天内的作品算「最新」，
 * 都没有就不打角标 —— 不打无意义的角标比硬凑一个诚实。
 * 时长角标这里给不出（作品摘要没有时长字段），留给真正带视频元数据的接口。
 */

async function loadExplore(reset = false) {
  // 未登录：整块不出现，也不发请求 —— 没有凭据的探索流只会换回 401，再被渲染成
  // 「加载失败，请重试。」，对访客来说那是一句没有意义也没法照做的报错。
  if (!loggedIn.value) return
  if (reset) {
    requestId += 1
  } else if (exploreLoading.value || exploreDone.value || !exploreReady.value) {
    return
  }
  const token = requestId
  const targetPage = reset ? 1 : explorePage.value + 1
  exploreLoading.value = true
  exploreError.value = ''
  if (reset) {
    explorePage.value = 1
    exploreDone.value = false
    exploreItems.value = []
  }
  try {
    const { items, total } = await hgApi.listWorksFeed(targetPage, PAGE_SIZE, 'explore')
    if (token !== requestId) return
    const batch = items.map(toExploreWork)
    exploreItems.value = targetPage === 1 ? batch : [...exploreItems.value, ...batch]
    explorePage.value = targetPage
    // 「到底了」按接口给的 total 判断（只按 items.length 判断会在整页边界漏判）
    if (!batch.length || exploreItems.value.length >= total || exploreItems.value.length >= PAGE_SIZE * 8) {
      exploreDone.value = true
    }
    // 全站还没有已发布作品（或首次请求失败）时**如实为空**，不再塞 EXPLORE_FIRST_BATCH。
    // 示例条目会让"探索流是空的"看起来像"有内容"，而这恰恰是运营最该看到的信号。
    exploreDone.value = true
  } catch {
    if (token === requestId) {
      exploreError.value = '加载失败，请重试。'
      exploreItems.value = []
      exploreDone.value = true
    }
  } finally {
    if (token === requestId) {
      exploreLoading.value = false
      exploreReady.value = true
    }
  }
}

/**
 * 分类切换：**只筛已加载的内容，不重新取数**。
 * 后端 explore 流只支持 scope/page/pageSize，没有分类/标签参数，重新请求拿到的还是同一批；
 * 假装"服务端按分类过滤"只会让用户以为筛过了。真正的服务端筛选需要后端给 feed 加 tag 参数。
 */
function switchCategory(category: ExploreCategory) {
  exploreCategory.value = category
}

/** 展示用列表：分类按标签名匹配（「推荐」= 全部）。 */
const exploreVisible = computed(() => {
  if (exploreCategory.value === '推荐') return exploreItems.value
  const target = exploreCategory.value
  return exploreItems.value.filter(item =>
    item.category === target || item.tags?.some(tag => tag === target)
  )
})

onMounted(() => {
  if (!sentinel.value) return
  observer = new IntersectionObserver((entries) => {
    // 首屏加载完成前不触发追加，避免空列表时哨兵可见导致第一批被跳过
    if (entries.some(entry => entry.isIntersecting) && exploreReady.value && !exploreDone.value && !exploreError.value) {
      void loadExplore()
    }
  }, { rootMargin: '240px' })
  observer.observe(sentinel.value)
})

function remixWork(work: ExploreWork) {
  // 作品流里已经没有 mock 条目（一律来自后端「全站已发布」），不必再分叉提示。
  navigateTo(`/create?remix=${encodeURIComponent(work.id)}`)
}

/* ---------------- 完整预览 ---------------- */

// 单击结果只预览，不改变下一步对象（设计说明 §4 对话页与 §6.2 完整预览）
const previewOpen = ref(false)
const previewSrc = ref('')
const previewTitle = ref('')
const previewAuthor = ref('')
/** 预览的媒体类型：视频要用 <video> 播（HgMediaPreview 的 kind 分支）。 */
const previewKind = ref<'image' | 'video'>('image')

function openPreview(work: ExploreWork) {
  // 视频作品没有封面图，要播的是 videoUrl —— 拿 cover 去预览只会是空白
  previewKind.value = work.kind === 'video' ? 'video' : 'image'
  previewSrc.value = work.kind === 'video' ? (work.videoUrl || '') : work.cover
  previewTitle.value = work.title
  previewAuthor.value = work.author
  previewOpen.value = true
}

function openContinuePreview(item: ContinueItem) {
  previewKind.value = item.kind === 'video' ? 'video' : 'image'
  previewSrc.value = item.kind === 'video' ? (item.videoUrl || '') : item.cover
  previewTitle.value = item.title
  previewAuthor.value = ''
  previewOpen.value = true
}

/**
 * 签名地址过期自愈：首页挂满一小时，卡片上的图/视频地址就全过期了，
 * 再加载一次（重新解码、视频续传）就是 403。
 * 收到自愈信号（加载失败或从后台切回来）就重跑这三个区块换新地址 ——
 * 只是重新签名，不重新生成、不重新计费。见 ~/composables/useMediaRefresh。
 */
useMediaAutoRefresh(() => Promise.all([
  loadContinue(),
  loadExplore(true),
  toolCatalog.refresh()
]))
</script>

<template>
  <div class="home">
    <!-- 创作区 -->
    <section
      class="hero"
      aria-labelledby="hero-title"
    >
      <div class="creation-guide">
        <h1 id="hero-title">
          今天，想创作什么？
        </h1>
      </div>

      <div class="composer-row">
        <div class="h3-composer">
          <HgChatComposer
            variant="landing"
            @submit="submitLanding"
          />

          <p
            v-if="notice"
            class="h3-composer-notice"
            role="status"
          >
            {{ notice }}
          </p>
        </div>
      </div>

      <!-- 技能快捷片：**紧贴输入框正下方**（不是另起一个带标题的区块），
           上排 5 个 + 下排 3 个 + 第 9 格一个跳转箭头 → 技能页。
           卡片**按文字自适应宽度**（等宽时短名字右侧空一大截），两行由 quickRows 显式切好。
           鼠标停在哪一格、或键盘聚焦到哪一格，就浮一张「封面 + 名称 + 说明」的卡。
           为什么不用 grid：grid 做不到「不满的那一行居中」，这里必须 flex。 -->
      <div
        v-if="quickTools.length"
        ref="quickGridEl"
        class="quick-grid"
      >
        <div
          v-for="(row, rowIndex) in quickRows"
          :key="`quick-row-${rowIndex}`"
          class="quick-row"
        >
          <button
            v-for="tool in row"
            :key="tool.key"
            type="button"
            class="quick-chip"
            :class="{ active: isQuickToolActive(tool) }"
            :style="{ '--tint': tool.tint }"
            :aria-pressed="isQuickToolActive(tool)"
            :aria-describedby="tool.summary ? `quick-summary-${tool.key.replace('tool:', '')}` : undefined"
            @click="pickQuickTool(tool)"
            @mouseenter="openQuickPop($event, tool)"
            @mouseleave="closeQuickPop"
            @focus="openQuickPop($event, tool)"
            @blur="closeQuickPop"
          >
            <img
              v-if="tool.cover"
              class="quick-thumb"
              :src="tool.cover"
              alt=""
              loading="lazy"
            >
            <span
              v-else
              class="quick-thumb quick-thumb-fallback"
            >
              <UIcon
                :name="tool.icon"
                aria-hidden="true"
              />
            </span>
            <span class="quick-name">{{ tool.label }}</span>
          </button>

          <!-- 跳转格跟最后一排一起居中（不足一排时也居中，正是当初不用 grid 的原因）。 -->
          <NuxtLink
            v-if="rowIndex === quickRows.length - 1"
            class="quick-jump"
            to="/effects"
            aria-label="查看全部技能"
          >
            <UIcon
              name="i-lucide-arrow-right"
              aria-hidden="true"
            />
          </NuxtLink>
        </div>

        <!-- 技能说明的等价副本：浮层只在 :hover 出现，触屏上整套 (hover: none) 规则把它藏了，
             只留一个按钮名等于把说明丢掉。这里给读屏/触屏一份（由卡片的 aria-describedby 引用；
             放在卡片外面，免得这段文字被算进按钮名）。
             为什么要这样而不是直接读浮层：浮层是 aria-hidden 的装饰层，且挂在按钮里时
             其文字会被拼进 accessible name。 -->
        <template
          v-for="tool in quickTools"
          :key="`desc-${tool.key}`"
        >
          <span
            v-if="tool.summary"
            :id="`quick-summary-${tool.key.replace('tool:', '')}`"
            class="hg-sr"
          >{{ tool.summary }}</span>
        </template>

        <!-- 悬停卡：整排共用一层，由 placeQuickPop() 定位并夹在视口内（见脚本里的说明）。 -->
        <span
          v-if="hoverTool"
          ref="quickPopEl"
          class="quick-pop"
          :style="quickPopStyle"
          aria-hidden="true"
        >
          <img
            v-if="hoverTool.cover"
            :src="hoverTool.cover"
            alt=""
          >
          <strong>{{ hoverTool.label }}</strong>
          <small>{{ hoverTool.summary }}</small>
        </span>
      </div>

      <!-- 无 hover 设备（触屏）的可见说明：浮层在上面那条 (hover: none) 规则里被藏了，
           点选后屏幕上就只剩一个高亮的按钮，看不到这个技能是干什么的。
           只在 CSS 里对 `(hover: hover)` 隐藏 —— 桌面/键盘用户已经有浮层，不必再来一行。
           读屏侧这段说明已由卡片的 aria-describedby 念过一次，这里 aria-hidden 去重。 -->
      <p
        v-if="selectedToolCard && selectedToolCard.summary"
        class="quick-selected"
        :style="{ '--tint': selectedToolCard.tint }"
        aria-hidden="true"
      >
        <strong>{{ selectedToolCard.label }}</strong>
        <span>{{ selectedToolCard.summary }}</span>
      </p>
    </section>

    <!-- 继续创作 -->
    <section
      v-if="loggedIn && (continueLoading || continueItems.length || runningWorks)"
      class="section"
      aria-labelledby="continue-title"
    >
      <header class="hg-section-head">
        <h2 id="continue-title">
          继续创作
        </h2>
        <div class="head-right">
          <span
            v-if="runningWorks"
            class="task-chip"
          >
            <i aria-hidden="true" />任务 ({{ runningWorks }})
          </span>
          <NuxtLink
            class="hg-more"
            to="/create"
          >
            全部
            <UIcon
              name="i-lucide-arrow-right"
              aria-hidden="true"
            />
          </NuxtLink>
        </div>
      </header>
      <p
        v-if="continueLoading"
        class="hg-empty"
      >
        正在加载最近的创作…
      </p>
      <!-- 有在飞任务但还没有完成的作品（新用户的第一单就是这个状态）：
           整块不能只因为"没有作品"就消失 —— 那会让用户以为提交的活儿没发生。
           此时角标「任务 (N)」正好是屏幕上看得到的唯一反馈。 -->
      <p
        v-else-if="!continueItems.length"
        class="hg-empty"
      >
        {{ runningWorks ? `有 ${runningWorks} 个任务正在生成，完成后会出现在这里。` : '还没有作品。' }}
      </p>
      <div
        v-else
        class="continue-grid"
      >
        <article
          v-for="item in continueItems"
          :key="item.id"
          class="hg-card continue-card"
        >
          <!-- 原站作品以竖版为主，固定 3:4 框；视频仍完整等比显示。 -->
          <div class="hg-media r3x4">
            <!-- 视频作品：没有封面图，进视口静音循环播；首帧用 #t=0.1 垫着，
                 免得自动播放起效前是一块黑框。 -->
            <video
              v-if="item.kind === 'video' && item.videoUrl"
              v-auto-play-video
              class="media-fg"
              :src="videoFirstFrameSrc(item.videoUrl)"
              muted
              loop
              playsinline
              preload="metadata"
            />
            <!-- 有原图时用同坐标对比滑块，而不是并排两张肖像（设计说明第 8 条） -->
            <template v-else-if="item.compareBefore && item.cover">
              <HgCompareSlider
                :before="item.compareBefore"
                :after="item.cover"
                :alt="item.title"
                :label="`${item.title} 原图与效果对比`"
              />
            </template>
            <img
              v-else-if="item.cover"
              class="media-fg"
              :src="item.cover"
              :alt="item.title"
              loading="lazy"
            >
            <div
              v-else
              class="media-placeholder"
              aria-hidden="true"
            >
              {{ item.title.slice(0, 1) }}
            </div>
            <button
              v-if="item.cover || (item.kind === 'video' && item.videoUrl)"
              type="button"
              class="media-zoom"
              :aria-label="`完整预览 ${item.title}`"
              @click="openContinuePreview(item)"
            >
              <UIcon name="i-lucide-maximize-2" />
            </button>
          </div>
          <div class="card-foot column">
            <div class="continue-title">
              <strong>{{ item.title }}</strong>
              <button
                type="button"
                class="more-button"
                aria-label="更多操作"
              >
                <UIcon name="i-lucide-ellipsis" />
              </button>
            </div>
            <p class="continue-status">
              <UIcon
                v-if="item.status === 'done'"
                name="i-lucide-circle-check"
                class="status-done"
                aria-hidden="true"
              />
              <UIcon
                v-else-if="item.status === 'running'"
                name="i-lucide-loader-circle"
                class="status-run"
                aria-hidden="true"
              />
              {{ item.statusText }}
            </p>
          </div>
        </article>
      </div>
    </section>

    <!-- 探索灵感 -->
    <section
      v-if="loggedIn && (exploreItems.length || exploreError)"
      id="explore"
      class="section"
      aria-labelledby="explore-title"
    >
      <header class="hg-section-head">
        <h2 id="explore-title">
          探索灵感
        </h2>
        <button
          type="button"
          class="hg-more"
          :disabled="exploreLoading || exploreDone"
          @click="loadExplore()"
        >
          {{ exploreDone ? '已经到底了' : (exploreLoading ? '加载中…' : '加载更多') }}
          <UIcon
            name="i-lucide-arrow-down"
            aria-hidden="true"
          />
        </button>
      </header>

      <div
        class="explore-tabs"
        role="tablist"
        aria-label="作品分类"
      >
        <button
          v-for="category in EXPLORE_CATEGORIES"
          :key="category"
          type="button"
          role="tab"
          :aria-selected="exploreCategory === category"
          :class="{ active: exploreCategory === category }"
          @click="switchCategory(category)"
        >
          {{ category }}
        </button>
      </div>

      <div class="explore-grid">
        <article
          v-for="work in exploreVisible"
          :key="work.id"
          class="hg-card explore-card"
        >
          <div class="hg-media r3x4">
            <!-- 视频作品：进视口静音循环播（后端 kind=video 时才有 videoUrl）。
                 首帧用 #t=0.1 垫着，自动播放被拒/还没进视口时也不是黑框。 -->
            <video
              v-if="work.kind === 'video' && work.videoUrl"
              v-auto-play-video
              class="media-fg"
              :src="videoFirstFrameSrc(work.videoUrl)"
              muted
              loop
              playsinline
              preload="metadata"
            />
            <img
              v-else-if="work.cover"
              class="media-fg"
              :src="work.cover"
              :alt="work.title"
              loading="lazy"
            >
            <span
              v-if="work.badge && !work.badgeBaked"
              class="hg-badge"
            >{{ work.badge }}</span>
            <span
              v-if="work.duration"
              class="duration-badge"
            >{{ work.duration }}</span>
            <!-- 悬停操作蒙版渐显（交互图面板 01）；触摸端常显，不能只靠 hover 才能发现 -->
            <div class="hg-actions">
              <button
                type="button"
                class="action"
                @click="openPreview(work)"
              >
                <UIcon
                  name="i-lucide-eye"
                  aria-hidden="true"
                />预览
              </button>
              <button
                type="button"
                class="action"
                @click="remixWork(work)"
              >
                <UIcon
                  name="i-lucide-copy"
                  aria-hidden="true"
                />创作同款
              </button>
            </div>
          </div>
          <div class="card-foot column">
            <strong class="explore-title">{{ work.title }}</strong>
            <p
              v-if="work.author"
              class="explore-author"
            >
              <span
                v-if="work.avatar"
                class="author-avatar"
              >
                <img
                  :src="work.avatar"
                  alt=""
                >
              </span>
              {{ work.author }}
            </p>
            <button
              type="button"
              class="remix-button"
              @click="remixWork(work)"
            >
              <UIcon
                name="i-lucide-copy"
                aria-hidden="true"
              />创作同款
            </button>
          </div>
        </article>
      </div>

      <div
        ref="sentinel"
        class="explore-status"
        role="status"
      >
        <span v-if="exploreLoading">正在加载更多作品…</span>
        <button
          v-else-if="exploreError"
          type="button"
          class="hg-more"
          @click="loadExplore()"
        >
          {{ exploreError }} 点击重试
        </button>
        <span v-else-if="exploreDone">已经到底了。</span>
        <button
          v-else
          type="button"
          class="hg-more"
          @click="loadExplore()"
        >
          加载更多
        </button>
      </div>
    </section>

    <HgMediaPreview
      v-model:open="previewOpen"
      :src="previewSrc"
      :title="previewTitle"
      :author="previewAuthor"
      :kind="previewKind"
    />
  </div>
</template>

<style scoped>
.home {
  display: grid;
  gap: 46px;
  padding-top: 72px;
  /* 宽屏（1920 等）居中并限宽，避免卡片被拉长变形 */
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

/* ---------- 创作区 ---------- */

/* 点阵背景由 app 壳统一绘制，首页不另叠一层。 */
.hero {
  width: min(calc(100% - clamp(32px, 5vw, 88px)), 800px);
  margin: 0 auto;
  position: relative;
}
.creation-guide {
  margin: 0 auto 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.hero h1 {
  margin: 0;
  text-align: center;
  font-size: 24px;
  font-weight: 650;
  line-height: 1.15;
  color: #fafafa;
}

/* 输入框 + 框外生成按钮：整行宽度＝参考图的 790px（700 + 10 + 约 78） */
.composer-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  /* hero 已经限成 800px 居中了，输入框跟着 hero 通栏走，不再单独 max-width */
  width: 100%;
  margin: 0 auto;
}
.h3-composer {
  flex: 1 1 auto;
  min-width: 0;
}

/* 正文里已经有图时，图片与文字之间加一条分隔线（用户要求：不加线就分不清哪块是可点的文本） */

/* 图片上传框：参照即梦是方形「＋」按钮（不再带文字标签） */

.editor textarea,

/* 工具条：距上传框底 18px，高 40px（参考图 y350-390） */

.pop-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: max-content;
  max-width: 300px;
  padding: 10px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 14px;
  background: #1c1d21;
  box-shadow: 0 18px 44px #0009;
}
/* 横向 chip：选项多时自动换行，不再竖着排一长条遮挡输入框 */
.pop-list button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.pop-list button:hover {
  border-color: rgb(255 255 255 / 22%);
}
.pop-list button.active {
  border-color: var(--hg3-accent-line);
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
}
.pop-list button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.mention-list button:hover,

.h3-composer-notice {
  margin: 10px 0 0;
  color: var(--hg3-warn);
  font-size: 12px;
}

/* ---------------- 技能快捷片：卡片按文字收窄，两行都居中 ---------------- */
.quick-grid {
  /* 与输入框同宽同位置；行本身在 .quick-row 里居中。 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 12px auto 0;
  /* 把整排卡片 + 悬停浮层提成一个比输入框（z-index:1）更高的层，
     否则 hover 时新建的堆叠上下文会把浮层关在输入框下面 */
  position: relative;
  z-index: 2;
}
/* 一行快捷片：**hug 文字宽度**（不再 5 列等宽），整行居中；
   窄屏放不下时行内自己换行，不会横向溢出。 */
.quick-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  width: 100%;
}
.quick-chip {
  /* 色底 = 该技能的颜色叠在深底上；没有 --tint 时回落中性白（--tint 由脚本注入） */
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  /* 宽度 = 缩略图 + 文字 + 内边距，字短就窄 —— 等宽时「脱衣」右侧空一大截（用户反馈） */
  flex: 0 0 auto;
  height: 40px;
  padding: 4px 12px 4px 6px;
  border: 1px solid color-mix(in srgb, var(--tint, #fff) 30%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--tint, #fff) 13%, #141414);
  color: var(--hg3-ink);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s, border-color 0.18s;
}
/* hover 只变色，**不位移**：原来 translateY(-1px) 会让这张卡比左右邻居高出 1px，
   边框跟整排对不齐（用户反馈「外面的框和里面的框对不上」）。 */
.quick-chip:hover {
  background: color-mix(in srgb, var(--tint, #fff) 22%, #141414);
  border-color: color-mix(in srgb, var(--tint, #fff) 62%, transparent);
}
.quick-chip.active {
  border-color: color-mix(in srgb, var(--tint, var(--hg3-accent)) 85%, transparent);
  background: color-mix(in srgb, var(--tint, var(--hg3-accent)) 26%, #141414);
}
/* 方形小图：参考站那排是小方块，不是 16:9 缩略图 */
.quick-thumb {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 9px;
  object-fit: cover;
  border: 1px solid #282828;
}
.quick-thumb-fallback {
  display: grid;
  place-items: center;
  background: #1e1e1e;
  color: color-mix(in srgb, var(--tint, #fff) 80%, #fff);
  font-size: 16px;
}
.quick-name {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 第九格只放跳转箭头，随第二排一起居中。 */
.quick-jump {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 40px;
  flex: none;
  border: 0;
  background: none;
  color: var(--hg3-faint);
  cursor: pointer;
  transition: color 0.18s;
}
.quick-jump:hover {
  color: var(--hg3-ink);
}
/* 悬停卡：left/top 由脚本写（placeQuickPop 夹进视口），不再是 CSS 居中 —— 见脚本里的说明。
   容器是 .quick-grid（position: relative），所以浮层跟着内容一起滚。 */
.quick-pop {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* 宽度**跟着内容走**（图铺满内容宽，见下面 img 的说明）：原来 236px 是被标题/说明
     撑出来的，比 150px 的图宽一截；收窄到 176 后图、文字、外框三者同宽，
     浮层高度也回到 ~290px，不再顶到上面的标题。 */
  width: 176px;
  /* 兜底：视口比浮层还窄时不撑出横向滚动条（脚本量到的宽也会跟着变小） */
  max-width: calc(100vw - 24px);
  padding: 8px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 14px;
  background: rgb(26 26 26 / 95%);
  box-shadow: 0 12px 32px rgb(0 0 0 / 80%);
  pointer-events: none;
}
/* 轻量入场：只做 6px 上浮 + 淡入，不做缩放/回弹（React Bits 那类细腻反馈的最小版）。
   元素是 v-if 新建的，每次打开都会重放一次。 */
@media (prefers-reduced-motion: no-preference) {
  .quick-pop {
    animation: quick-pop-in 140ms ease-out;
  }
}
@keyframes quick-pop-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}
.quick-pop img {
  display: block;
  /* **铺满浮层内容宽**：原来 `min(100%, 150px)` 让图比下面的标题/说明窄一截、
     还靠左放，看着就是「外面的框和里面的框对不上、下面的文字把框撑宽了」。 */
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 9px;
  object-fit: cover;
}
.quick-pop strong {
  font-size: 13px;
  color: var(--hg3-ink);
}
.quick-pop small {
  font-size: 11px;
  line-height: 17px;
  color: var(--hg3-muted);
}
/* 触屏没有 hover，浮层只会挡住自己。说明的等价信息见卡片里的 .hg-sr（aria-describedby）。 */
@media (hover: none) {
  .quick-pop { display: none; }
}
/* 触屏点选后的可见说明（模板里的 .quick-selected）：沿用该技能自己的色底，
   与快捷片同一套变量；这行只在没有 hover 的设备上出现。 */
.quick-selected {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  margin: 8px auto 0;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--tint, #fff) 30%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tint, #fff) 13%, #141414);
  font-size: 11px;
  line-height: 17px;
  color: var(--hg3-muted);
}
.quick-selected strong {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--hg3-ink);
  white-space: nowrap;
}
@media (hover: hover) {
  .quick-selected { display: none; }
}
.section {
  position: relative;
}

.media-play {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgb(10 11 13 / 68%);
  color: #fff;
  font-size: 12px;
}
.duration-badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 5px;
  background: rgb(10 11 13 / 72%);
  color: #fff;
  font-size: 10px;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.task-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgb(101 198 251 / 14%);
  color: var(--hg3-run);
  font-size: 11px;
}
.task-chip i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentcolor;
}
.card-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}
.card-foot.column {
  display: grid;
  gap: 6px;
  padding: 12px 14px 14px;
}

.continue-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
/* 媒体适配（前景层铺满、左上角起裁）走全站统一规则，见 hougong3.css 的 img.media-fg */
.media-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(160deg, #26272c, #171717);
  color: var(--hg3-accent);
  font-size: 34px;
  font-weight: 800;
}
/* 媒体区完整预览入口（继续创作卡片） */
.media-zoom {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: rgb(10 11 13 / 62%);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 180ms ease;
}
.hg-card:hover .media-zoom,
.media-zoom:focus-visible {
  opacity: 1;
}
.continue-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.continue-title strong {
  font-size: 15px;
  font-weight: 600;
}
.more-button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted);
  cursor: pointer;
}
.more-button:hover {
  background: #282828;
}
.continue-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--hg3-muted);
  font-size: 12px;
}
.status-done {
  color: var(--hg3-ok);
}
.status-run {
  color: var(--hg3-run);
}

.explore-tabs {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--hg3-line);
}
.explore-tabs button {
  position: relative;
  padding: 0 0 12px;
  border: 0;
  background: transparent;
  color: var(--hg3-muted);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.explore-tabs button.active {
  color: var(--hg3-ink);
  font-weight: 600;
}
.explore-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--hg3-accent);
  content: '';
}

.explore-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

/* 悬停操作蒙版：渐显、不改变卡片外框（交互图面板 01）。
   手机没有 hover，用 (hover: none) 常显，避免关键入口只能靠悬停发现。 */
.hg-actions {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 26px 10px 12px;
  background: linear-gradient(180deg, transparent, rgb(8 9 11 / 78%));
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 180ms ease, transform 180ms ease;
}
.hg-card:hover .hg-actions,
.hg-card:focus-within .hg-actions {
  opacity: 1;
  transform: none;
}
@media (hover: none) {
  .hg-actions {
    opacity: 1;
    transform: none;
  }
  .media-zoom {
    opacity: 1;
  }
}
.hg-actions .action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 999px;
  background: rgb(18 19 22 / 88%);
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.hg-actions .action:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
.explore-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.explore-author {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: var(--hg3-muted);
  font-size: 12px;
}
.author-avatar {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  overflow: hidden;
}
.author-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.remix-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 36px;
  margin-top: 4px;
  border: 0;
  border-radius: 10px;
  background: var(--hg3-card-soft);
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.remix-button:hover {
  background: var(--hg3-tile);
}

.explore-status {
  padding: 22px 0 6px;
  color: var(--hg3-faint);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 900px) {
  .explore-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .continue-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .home { padding-top: 95px; }
  /* 手机端两列竖版封面 */
  .explore-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .continue-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 触屏：粗指针下没有 hover 也没有精确落点，28px / 24px 的角标按钮按不准
   （WCAG 2.5.8 要求点击目标 ≥24px，Apple HIG 建议 44px）。这里放大到 34px，
   图标本身不缩放，视觉重量不变；页签同时加高内边距，让整条更好按。 */
@media (pointer: coarse) {
  .media-zoom {
    width: 34px;
    height: 34px;
  }
  .more-button {
    width: 34px;
    height: 34px;
  }
  .explore-tabs button {
    padding: 6px 0 12px;
  }
}

/* 用户要求减少动态效果：颜色/边框反馈保留，位移与入场动画关掉。 */
@media (prefers-reduced-motion: reduce) {
  .quick-chip,
  .quick-jump,
  .media-zoom,
  .hg-actions {
    transition: none;
  }
}
</style>
