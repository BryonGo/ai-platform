<script setup lang="ts">
import {
  EXPLORE_CATEGORIES,
  HOME_CONTINUE_MOCK,
  HOME_TOOLS,
  TOOL_TABS,
  exploreBatch,
  type ToolKind,
  type ContinueItem,
  type ExploreCategory,
  type ExploreWork
} from '~/data/hougong-home'
import { promptText } from '~/components/prompt/enhancement-mark'
import type { WorkItem } from '~/composables/useHougongApi'

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
 * 目录为空时回落到 HOME_TOOLS：首屏是产品的门面，一次接口抖动不该让它变空。
 * 回落数据只是**展示兜底**，点进去仍会走对应工具（后端没有该工具时会被明确拒绝）。 */
const toolCatalog = useToolCatalog()
const toolTab = ref<'all' | ToolKind>('all')
const toolQuery = ref('')

/** 统一的展示结构：目录项与兜底项都映射成它，模板只认这几个字段。 */
interface ToolCard {
  key: string
  to: string
  label: string
  icon: string
  cover: string
  kinds: ToolKind[]
}

const toolCards = computed<ToolCard[]>(() => {
  const fromCatalog: ToolCard[] = toolCatalog.tools.value.map(tool => ({
    key: `tool:${tool.code}`,
    to: `/tool/${tool.code}`,
    label: tool.name,
    icon: tool.icon || 'i-lucide-sparkles',
    // 目录不下发封面图；先用首页统一底图，后续工具接入预览图再替换
    cover: '/images/daji-three-tail-front-v1.webp',
    kinds: [tool.category as ToolKind]
  }))
  if (fromCatalog.length) return fromCatalog
  return HOME_TOOLS.map(tool => ({
    key: `mock:${tool.id}`,
    to: '/create',
    label: tool.label,
    icon: tool.icon,
    cover: tool.cover,
    kinds: tool.kinds
  }))
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

/** 进行中的任务数（来自真实作品状态；mock 兜底时按 mock 里「生成中」的条数） */
const runningWorks = ref(0)

onMounted(async () => {
  // withSessions:false —— 首页不读会话/消息，只把目录与默认模型准备好给输入器
  await studio.init({ withSessions: false })
  void toolCatalog.ensure()
  void loadContinue()
  void loadExplore(true)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

/* ---------------- 继续创作 ---------------- */

const continueItems = ref<ContinueItem[]>([])
const continueLoading = ref(true)

/**
 * 素材方向标注：竖图/方图铺满竖框（微裁，不留黑边），
 * 横图用 contain 上下留黑（通用手机短视频处理）。
 */
function markOrientation(event: Event) {
  const el = event.target as HTMLImageElement | null
  if (!el) return
  const host = el.closest('.hg-media, .media-frame')
  if (!host) return
  host.classList.toggle('is-landscape', el.naturalWidth > el.naturalHeight)
}

function relativeTime(ts: number) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const minute = 60_000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  return `${Math.floor(diff / (24 * 60 * minute))} 天前`
}

const STATUS_TEXT: Record<string, { status: ContinueItem['status'], text: string }> = {
  succeeded: { status: 'done', text: '已完成' },
  running: { status: 'running', text: '生成中' },
  queued: { status: 'running', text: '排队中' },
  failed: { status: 'edited', text: '已失败' }
}

/**
 * 提交（首页侧）：不建任务，把这次输入交成草稿并跳到创作页。
 * 真正的计费与建任务发生在创作页（首页跳转本身不产生第二次任务，见交接文档第 4 节）。
 */
function submitLanding() {
  notice.value = ''
  const text = promptText(studio.promptModel.value)
  const reference = studio.reference.value
  if (!text.trim() && !reference.file && !reference.assetId) {
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
    uploadName: reference.name,
    file: reference.file,
    // 已选模型一并交接，避免用户在对话页重选（交接文档第 4 节）
    modelId: studio.selectedModel.value?.id,
    modelChannel: studio.selectedModel.value?.channel
  })
  void navigateTo('/create')
}

async function loadContinue() {
  continueLoading.value = true
  try {
    if (!session.token.value) {
      continueItems.value = HOME_CONTINUE_MOCK
      runningWorks.value = HOME_CONTINUE_MOCK.filter(item => item.status === 'running').length
      return
    }
    const works: WorkItem[] = await hgApi.listWorks()
    runningWorks.value = works.filter(work => work.status === 'running' || work.status === 'queued').length
    continueItems.value = works.length
      ? works.slice(0, 3).map((work) => {
          const meta = STATUS_TEXT[work.status] ?? { status: 'edited' as const, text: '最近编辑' }
          return {
            id: String(work.id),
            title: work.title || `作品 ${String(work.id).slice(-6)}`,
            cover: work.imageUrl || '',
            status: meta.status,
            statusText: `${meta.text} · ${relativeTime(work.createdAt)}`
          }
        })
      : HOME_CONTINUE_MOCK
  } catch {
    continueItems.value = HOME_CONTINUE_MOCK
    runningWorks.value = HOME_CONTINUE_MOCK.filter(item => item.status === 'running').length
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

async function loadExplore(reset = false) {
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
    // 显式的异步边界：真实探索流契约落地后这里换成 listWorksFeed，
    // 失败时保留已有结果并允许重试。
    const batch = await new Promise<ExploreWork[]>((resolve) => {
      setTimeout(() => resolve(exploreBatch(exploreCategory.value, targetPage, PAGE_SIZE)), 180)
    })
    if (token !== requestId) return
    if (!batch.length) {
      exploreDone.value = true
      return
    }
    exploreItems.value = targetPage === 1 ? batch : [...exploreItems.value, ...batch]
    explorePage.value = targetPage
    if (exploreItems.value.length >= PAGE_SIZE * 8) exploreDone.value = true
  } catch {
    if (token === requestId) exploreError.value = '加载失败，请重试。'
  } finally {
    if (token === requestId) {
      exploreLoading.value = false
      exploreReady.value = true
    }
  }
}

function switchCategory(category: ExploreCategory) {
  if (exploreCategory.value === category) return
  exploreCategory.value = category
  void loadExplore(true)
}

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

function openPreview(work: ExploreWork) {
  previewSrc.value = work.cover
  previewTitle.value = work.title
  previewAuthor.value = work.author
  previewOpen.value = true
}

function openContinuePreview(item: ContinueItem) {
  previewSrc.value = item.cover
  previewTitle.value = item.title
  previewAuthor.value = ''
  previewOpen.value = true
}
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
        <!-- 人物素材：新背景素材未定稿（交接文档第 4 节），此处用已确认的妲己资产占位 -->
        <img
          src="/images/daji-three-tail-cutout-v2.webp"
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
          <div class="hg-media r16x9">
            <img
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
          <!-- 竖屏为主：9:16 容器；横屏素材等比 contain，上下留黑不裁切 -->
          <div class="hg-media r9x16 letterbox">
            <!-- 有原图时用同坐标对比滑块，而不是并排两张肖像（设计说明第 8 条） -->
            <HgCompareSlider
              v-if="item.compareBefore && item.cover"
              :before="item.compareBefore"
              :after="item.cover"
              :alt="item.title"
              :label="`${item.title} 原图与效果对比`"
            />
            <img
              v-else-if="item.cover"
              :src="item.cover"
              :alt="item.title"
              loading="lazy"
              @load="markOrientation"
            >
            <div
              v-else
              class="media-placeholder"
              aria-hidden="true"
            >
              {{ item.title.slice(0, 1) }}
            </div>
            <button
              v-if="item.cover"
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
          v-for="work in exploreItems"
          :key="work.id"
          class="hg-card explore-card"
        >
          <div class="hg-media r9x16">
            <img
              v-if="work.cover"
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
  -webkit-mask-image:
    linear-gradient(180deg, #000 40%, transparent 92%),
    linear-gradient(90deg, transparent 0%, #000 34%);
  mask-image:
    linear-gradient(180deg, #000 40%, transparent 92%),
    linear-gradient(90deg, transparent 0%, #000 34%);
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
/* 竖屏为主：竖图/方图铺满（只微小裁切），横图才上下留黑 */
.letterbox {
  background: #000;
}
.letterbox img {
  object-fit: cover;
}
.letterbox.is-landscape img {
  object-fit: contain;
}
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
