<script setup lang="ts">
import {
  EXPLORE_CATEGORIES,
  TOOL_TABS,
  type ToolKind,
  type ContinueItem,
  type ExploreCategory,
  type ExploreWork
} from '~/data/hougong-home'
import type { HougongTask, PublicationWork, WorkItem } from '~/composables/useHougongApi'
import { looksLikeVideoUrl, vAutoPlayVideo, videoFirstFrameSrc } from '~/composables/useAutoPlayVideo'

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
const toolTab = ref<'all' | ToolKind>('all')
const toolQuery = ref('')

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
}

const toolCards = computed<ToolCard[]>(() => {
  const fromCatalog: ToolCard[] = toolCatalog.tools.value.map(tool => ({
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
    kinds: [tool.category as ToolKind]
  }))
  // 目录为空就**如实为空**，不再回落 HOME_TOOLS 那批写死的示例工具。
  //
  // 兜底会让"配置错了/站点没解析对/接口抖动"和"后台确实一个工具都没配"表现完全一样：
  // 都变成展示 10 个跟本站无关的工具卡（实测踩到过 —— 本地 Host 不对导致站点回落默认站，
  // 目录拿到 0 条，首页却"看着很正常"）。没有真数据时宁可这一块不出现。
  return fromCatalog
})

const filteredTools = computed(() => {
  const keyword = toolQuery.value.trim().toLowerCase()
  return toolCards.value
    .filter(tool => toolTab.value === 'all' || tool.kinds.includes(toolTab.value))
    .filter(tool => !keyword || tool.label.toLowerCase().includes(keyword))
})

/** 视频工具未上线时不展示「视频」页签，避免空分组。 */
const toolTabs = computed(() => {
  const hasVideo = toolCards.value.some(t => t.kinds.includes('video'))
  return TOOL_TABS.filter(tab => tab.id !== 'video' || hasVideo)
})

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
    notice.value = '草稿已保留，登录后即可继续生成。'
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

// 探索作品与热门标签本轮为显式 mock（交接文档第 2 节允许），
// 不与真实作品混排；后端探索流契约落地后只需替换 loadExplore 的取数。
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
function toExploreWork(work: PublicationWork): ExploreWork {
  const likes = work.stats?.likes ?? 0
  const publishedMs = Number(work.publishedAt || 0) * 1000 // 后端是 Unix 秒
  const badge: ExploreWork['badge'] = likes >= 5
    ? '热门'
    : (publishedMs && Date.now() - publishedMs < 7 * 24 * 3600 * 1000 ? '最新' : undefined)
  // 视频作品的「封面」就是那段 mp4：后端现在会把 kind/videoUrl 一起下发，
  // 卡片据此走 <video>。老后端没有 kind 时退回嗅探扩展名，避免又出现坏图。
  const isVideo = work.kind === 'video'
    || (!work.kind && looksLikeVideoUrl(work.coverUrl || ''))
  const videoUrl = work.videoUrl || (isVideo ? (work.coverUrl || '') : '')
  return {
    id: String(work.id),
    title: work.title || '未命名作品',
    author: work.author?.displayName || '',
    avatar: work.author?.avatarUrl || undefined,
    // 视频不给 cover：让卡片专心走 videoUrl，免得 <img> 又拿到 mp4
    cover: isVideo ? '' : (work.coverUrl || ''),
    kind: isVideo ? 'video' : 'image',
    videoUrl: isVideo ? videoUrl : '',
    category: '推荐',
    tags: (work.tags || []).map(tag => tag.name),
    badge,
    badgeBaked: false,
    mock: false
  }
}

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
  if (work.mock) {
    // mock 作品没有真实提示词，明确提示而不是伪造一条真实生成
    notice.value = '这是展示用示例作品，暂不能创作同款。'
    return
  }
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
      <div
        class="hero-art"
        aria-hidden="true"
      >
        <span class="hero-glow" />
        <!-- 背景主视觉：妲己九尾（2048×960，由黑底 JPEG 亮度键控转出带 alpha 的 WebP）。
             构图已按安全区确认：主视觉在横向 50%~70%、纵向上 30% 以内；
             左侧渐隐区只放烟雾，下方 64% 被输入框覆盖且自身向下淡出。
             换图时保持同一构图约定即可（见 docs/HERO-BACKGROUND-SPEC.md）。 -->
        <img
          src="/images/daji-hero-alpha.webp"
          alt=""
        >
      </div>

      <h1 id="hero-title">
        今天，想创作什么？
      </h1>

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
    </section>

    <!-- 全部工具 -->
    <section
      v-if="toolCards.length"
      class="section"
      aria-labelledby="tools-title"
    >
      <header class="hg-section-head">
        <h2 id="tools-title">
          全部工具
        </h2>
        <NuxtLink
          class="hg-more"
          to="/effects"
        >
          全部工具
          <UIcon
            name="i-lucide-arrow-right"
            aria-hidden="true"
          />
        </NuxtLink>
      </header>
      <div class="tool-filter">
        <div
          class="tool-tabs"
          role="tablist"
          aria-label="工具分类"
        >
          <button
            v-for="tab in toolTabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="toolTab === tab.id"
            :class="{ active: toolTab === tab.id }"
            @click="toolTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
        <label class="tool-search">
          <UIcon
            name="i-lucide-search"
            aria-hidden="true"
          />
          <input
            v-model="toolQuery"
            type="search"
            placeholder="搜索工具"
            aria-label="搜索工具"
          >
        </label>
      </div>

      <div class="tool-grid">
        <NuxtLink
          v-for="tool in filteredTools"
          :key="tool.key"
          :to="tool.to"
          class="hg-card tool-card"
        >
          <div class="hg-media r2x3 fit-contain">
            <!-- 后台配了循环预览视频就走视频：卡片进视口静音自动播，cover 当封面帧。
                 视频优先于对比滑块 —— 有视频时那张"效果图"就是它的封面。 -->
            <video
              v-if="tool.coverVideo"
              v-auto-play-video
              class="media-fg"
              :src="tool.coverVideo"
              :poster="tool.cover || undefined"
              muted
              loop
              playsinline
              preload="none"
            />
            <!-- 后台配了「原图 + 效果图」一对就出对比滑块（/effects 与工具页同一套逻辑）；
                 只有一张就退回单图。 -->
            <HgCompareSlider
              v-else-if="tool.coverBefore && tool.cover"
              fit="contain"
              :before="tool.coverBefore"
              :after="tool.cover"
              :alt="tool.label"
              :label="`${tool.label} 原图与效果对比`"
            />
            <img
              v-else-if="tool.cover"
              class="media-fg"
              :src="tool.cover"
              :alt="tool.label"
              loading="lazy"
            >
            <span
              v-if="tool.kinds.includes('video')"
              class="media-play"
              aria-hidden="true"
            >
              <UIcon name="i-lucide-play" />
            </span>
          </div>
          <div class="card-foot">
            <span class="card-icon">
              <UIcon
                :name="tool.icon"
                aria-hidden="true"
              />
            </span>
            <span class="card-label">{{ tool.label }}</span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- 继续创作 -->
    <section
      v-if="loggedIn && (continueLoading || continueItems.length)"
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
      <div
        v-else
        class="continue-grid"
      >
        <article
          v-for="item in continueItems"
          :key="item.id"
          class="hg-card continue-card"
        >
          <!-- 固定 16:9 框，框不随素材变形；素材完整缩放显示，比例对不上的部分用
               同一张图的模糊层补背景（而不是留黑边，也不是把卡片撑长）。 -->
          <div class="hg-media r16x9">
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
        <NuxtLink
          class="hg-more"
          to="/works"
        >
          更多作品
          <UIcon
            name="i-lucide-arrow-right"
            aria-hidden="true"
          />
        </NuxtLink>
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
          <div class="hg-media r4x5">
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
        <span v-else-if="exploreDone">已经到底了，去「更多作品」看看。</span>
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
  /* 宽屏（1920 等）居中并限宽，避免卡片被拉长变形 */
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

/* ---------- 创作区 ---------- */

/* 创作区几何全部来自参考图实测（1003px 视口）：
   标题 y101-168（44px）、输入框 x190-890 / y218-406（700x188）、
   上传框 78x90、工具条 y350-390、生成按钮在框外右侧 x900-980 / y348-384。 */
.hero {
  position: relative;
  padding-top: 45px;
}
.hero h1 {
  position: relative;
  z-index: 1;
  margin: 0 0 8px;
  text-align: center;
  font-size: clamp(28px, 4.4vw, 44px);
  font-weight: 800;
  line-height: 1.5;
  letter-spacing: -0.5px;
}
/* 人物作为背景层：随视口缩放（cover，不拉伸），左侧与底部渐隐，
   输入器居中叠在上面——参照即梦首页。 */
.hero-art {
  position: absolute;
  top: -10px;
  right: 0;
  bottom: 0;
  z-index: 0;
  width: min(54%, 820px);
  overflow: hidden;
  pointer-events: none;
}
.hero-art img {
  display: block;
  width: 100%;
  height: 100%;
  /* 背景化：等比 cover 取景到头部+上身，绝不拉伸 */
  object-fit: cover;
  object-position: 58% 0%;
  /* 两级渐隐：纵向把底边切断处藏掉（素材是半身像，底边是硬切）；
     横向只做很轻的一段（素材本身已是带 alpha 的抠像，左侧烟雾是画面内容，
     压太狠会把烟雾吃掉；34% 的硬渐隐是给不透底素材用的）；
     右侧/顶部/左侧的收口已经**烘焙进素材自身**（见 docs 的素材说明）：
     CSS 渐隐在到达 box 边界前仍留有可观不透明度，素材右缘又恰有较亮的烟雾与星点，
     结果会在内容列右边界留下一条可见竖缝；把 smoothstep 做进 alpha 才能精确收到 0。 */
  -webkit-mask-image:
    linear-gradient(180deg, #000 40%, transparent 92%),
    linear-gradient(90deg, transparent 0%, #000 12%);
  mask-image:
    linear-gradient(180deg, #000 40%, transparent 92%),
    linear-gradient(90deg, transparent 0%, #000 12%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}
.hero-glow {
  position: absolute;
  top: -70px;
  right: -60px;
  width: 430px;
  height: 430px;
  border-radius: 999px;
  background: radial-gradient(circle, var(--hg3-glow), transparent 62%);
  filter: blur(46px);
  opacity: 0.7;
}

/* 输入框 + 框外生成按钮：整行宽度＝参考图的 790px（700 + 10 + 约 78） */
.composer-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  /* 对话框在首页居中；比例参照即梦：宽 ≈ 内容 92%、上限 1180 */
  width: min(1180px, 92%);
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

.section {
  position: relative;
}

.tool-filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.tool-tabs {
  display: flex;
  gap: 18px;
}
.tool-tabs button {
  position: relative;
  padding: 0 0 8px;
  border: 0;
  background: transparent;
  color: var(--hg3-muted);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.tool-tabs button.active {
  color: var(--hg3-ink);
  font-weight: 600;
}
.tool-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--hg3-accent);
  content: '';
}
.tool-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 200px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-faint);
}
.tool-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  outline: none;
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
.tool-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
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
.card-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--hg3-tile);
  color: var(--hg3-ink);
}
.card-label {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: linear-gradient(160deg, #26272c, #17181b);
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
  background: rgb(255 255 255 / 8%);
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

/* 参考图在 1003px 视口下就是 5 列工具 / 4 列探索 / 3 列继续创作，
   因此断点压到 900 以下才降列，避免比效果图更早换行。 */
@media (max-width: 900px) {
  .hero-art {
    width: 210px;
    opacity: 0.55;
  }
  .tool-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .explore-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .continue-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  /* 手机端两列 9:16 竖版封面（交互图面板 02） */
  .tool-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .explore-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .continue-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
