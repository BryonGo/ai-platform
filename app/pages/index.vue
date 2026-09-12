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
import { buildModelOptions, durationOptions, quoteModel, type ComposerMode } from '~/composables/useModelCatalog'
import { RATIO_OPTIONS, RESOLUTIONS, ratioIcon } from '~/data/image-options'
import type { Catalog, CharacterItem, WorkItem } from '~/composables/useHougongApi'

const hgApi = useHougongApi()
const session = useAuthSession()
const { openDialog } = useAuthDialog()
const { setDraft } = useComposerDraft()
const { onGlowPointerMove } = useGlowPointer()

/* ---------------- 输入器 ---------------- */

/** 当前就地展开的选项行（'' 表示都收起）：不再用浮层遮挡输入框 */
const pickerOpen = ref<'' | 'ratio' | 'resolution' | 'duration'>('')
function togglePicker(key: 'ratio' | 'resolution' | 'duration') {
  pickerOpen.value = pickerOpen.value === key ? '' : key
}
const mode = ref<ComposerMode>('image')
const prompt = ref('')
const ratio = ref('16:9')
const seconds = ref(5)
const count = ref(1)
/** 输出分辨率 1K / 2K（即梦口径） */
const resolution = ref('1K')
const modelId = ref('')
const catalog = ref<Catalog | null>(null)
const notice = ref('')
const uploadFile = ref<File | null>(null)
const uploadPreview = ref('')
const uploadName = ref('')

const modelOptions = computed(() => buildModelOptions(catalog.value, mode.value))
const selectedModel = computed(() => modelOptions.value.find(item => item.id === modelId.value))
/** 当前视频模型支持的比例（用于置灰，避免下发后端不认的尺寸） */
const supportedVideoRatios = computed(() => (catalog.value?.videoModels?.find(item => item.id === modelId.value)?.resolutions ?? []).map(item => item.ratio))
const durationList = computed(() => durationOptions(selectedModel.value, catalog.value))

// 报价跟着**所选模型**走：本地按积分、云端按余额，单位不能混（交接文档 G2）。
// 未选模型时显示「费用待确认」，不编造价格（首页设计说明 §5.3）。
const cost = computed(() => quoteModel(catalog.value, selectedModel.value, { ratio: ratio.value, seconds: seconds.value, count: count.value }))
const costText = computed(() => cost.value === null ? '费用待确认' : `${cost.value.amount} ${cost.value.unit}`)

// 上传区按所选模型能力显示。后端「统一用户视图」的能力字段（交接文档 G1）
// 尚未落地，因此只有模型明确声明不支持参考图时才隐藏；未选模型时保持可见，
// 与效果图一致。
const referenceAllowed = computed(() => mode.value === 'video' || selectedModel.value?.channel === 'cloud')
const showUpload = computed(() => referenceAllowed.value)

/* 全部工具：分类筛选 + 搜索（标注图） */
const toolTab = ref<'all' | ToolKind>('all')
const toolQuery = ref('')
const filteredTools = computed(() => {
  const keyword = toolQuery.value.trim().toLowerCase()
  return HOME_TOOLS
    .filter(tool => toolTab.value === 'all' || tool.kinds.includes(toolTab.value))
    .filter(tool => !keyword || tool.label.toLowerCase().includes(keyword))
})

/** 进行中的任务数（来自真实作品状态；mock 兜底时按 mock 里「生成中」的条数） */
const runningWorks = ref(0)

const ratioList = RATIO_OPTIONS

onMounted(async () => {
  session.load()
  try {
    catalog.value = await hgApi.getCatalog()
  } catch {
    catalog.value = null
  }
  void loadContinue()
  void loadCharacters()
  void loadExplore(true)
})

onBeforeUnmount(() => {
  if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)
  observer?.disconnect()
})

// 目录加载完成后若处于视频模式且没选模型，补默认值（幂等，用户选过就不动）
watch(modelOptions, (list) => {
  if (list.some(item => item.id === modelId.value)) return
  // 图片默认 Krea 2 Turbo，视频默认 MiniMax H3
  const pattern = mode.value === 'video' ? /mini\s*max/i : /krea\s*2\s*turbo/i
  const preferred = list.find(model => model.available && pattern.test(model.name))
  const fallback = list.find(model => model.available)
  modelId.value = preferred?.id ?? fallback?.id ?? ''
})

function switchMode(next: ComposerMode) {
  if (mode.value === next) return
  mode.value = next
  notice.value = ''
  // 切换模式不自动生成、不自动扣费；不兼容的模型就地收敛到该模式的默认值
  // （视频默认 MiniMax H3）
  if (!modelOptions.value.some(item => item.id === modelId.value)) {
    const list = modelOptions.value
    const pattern = next === 'video' ? /mini\s*max/i : /krea\s*2\s*turbo/i
    modelId.value = (list.find(item => item.available && pattern.test(item.name)) ?? list.find(item => item.available))?.id ?? ''
  }
  if (!durationList.value.includes(seconds.value)) seconds.value = durationList.value[0] ?? 5
}

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)
  uploadPreview.value = URL.createObjectURL(file)
  uploadName.value = file.name
  uploadFile.value = file
}

function clearUpload() {
  if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)
  uploadPreview.value = ''
  uploadName.value = ''
  uploadFile.value = null
}

// 未登录：生成／发布前弹登录，草稿保留，登录后回到费用确认（不自动扣费）
function submit() {
  notice.value = ''
  if (!prompt.value.trim()) {
    notice.value = '请先描述这一幕。'
    return
  }
  if (!session.token.value) {
    openDialog({ reason: 'generate', resume: 'composer' })
    notice.value = '草稿已保留，登录后即可继续生成。'
    return
  }
  setDraft({
    prompt: prompt.value,
    mode: mode.value,
    ratio: ratio.value,
    durationSeconds: seconds.value,
    uploadName: uploadName.value,
    file: uploadFile.value,
    // 已选模型一并交接，避免用户在对话页重选（交接文档第 4 节）
    modelId: selectedModel.value?.id,
    modelChannel: selectedModel.value?.channel
  })
  navigateTo('/create')
}

/* ---------------- @ 引用面板 ---------------- */

const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionIndex = ref(0)
const characters = ref<CharacterItem[]>([])
const mentionInput = ref<HTMLTextAreaElement | null>(null)

const mentionItems = computed(() => {
  const keyword = mentionQuery.value.trim().toLowerCase()
  return characters.value
    .filter(item => !keyword || item.name.toLowerCase().includes(keyword))
    .slice(0, 8)
})

// 输入框上方的镜像层：把 @引用 渲染成 chip，和 textarea 完全同字号同内边距，
// 保证文字像素对齐。用分段渲染而不是 v-html，避免注释注入。
const promptSegments = computed(() => {
  const segments: { text: string, mention: boolean }[] = []
  const pattern = /@[^\s@]{1,24}/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(prompt.value)) !== null) {
    if (match.index > cursor) segments.push({ text: prompt.value.slice(cursor, match.index), mention: false })
    segments.push({ text: match[0], mention: true })
    cursor = match.index + match[0].length
  }
  if (cursor < prompt.value.length) segments.push({ text: prompt.value.slice(cursor), mention: false })
  return segments
})
function openMention() {
  mentionQuery.value = ''
  mentionIndex.value = 0
  mentionOpen.value = true
}

function onPromptInput() {
  const tail = prompt.value.slice(-1)
  if (tail === '@') {
    openMention()
    return
  }
  if (mentionOpen.value) {
    const match = /@([^\s@]*)$/.exec(prompt.value)
    if (!match) {
      mentionOpen.value = false
      return
    }
    mentionQuery.value = match[1] ?? ''
    mentionIndex.value = 0
  }
}

function insertMention(name: string) {
  prompt.value = prompt.value.replace(/@[^\s@]*$/, `@${name} `)
  mentionOpen.value = false
  mentionInput.value?.focus()
}

function onPromptKeydown(event: KeyboardEvent) {
  if (!mentionOpen.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    mentionIndex.value = Math.min(mentionIndex.value + 1, Math.max(0, mentionItems.value.length - 1))
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    mentionIndex.value = Math.max(mentionIndex.value - 1, 0)
  } else if (event.key === 'Enter') {
    const hit = mentionItems.value[mentionIndex.value]
    if (hit) {
      event.preventDefault()
      insertMention(hit.name)
    }
  } else if (event.key === 'Escape') {
    mentionOpen.value = false
  }
}

async function loadCharacters() {
  if (!session.token.value) {
    characters.value = []
    return
  }
  characters.value = await hgApi.listCharacters().catch(() => [] as CharacterItem[])
}

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
          <!-- 图片／视频创作切换在输入框外上方（首页设计说明第 1 条批注） -->
          <div
            class="mode-switch hg-material-quick"
            role="tablist"
            aria-label="创作类型"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'image'"
              :class="{ active: mode === 'image' }"
              @click="switchMode('image')"
            >
              <UIcon
                name="i-lucide-image"
                aria-hidden="true"
              />图片创作
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'video'"
              :class="{ active: mode === 'video' }"
              @click="switchMode('video')"
            >
              <UIcon
                name="i-lucide-video"
                aria-hidden="true"
              />视频创作
            </button>
          </div>

          <div
            class="h3-composer-box hg-glow hg-material-input"
            @pointermove="onGlowPointerMove"
          >
            <div class="h3-composer-body">
              <label
                v-if="showUpload"
                class="h3-upload-box"
                :class="{ filled: !!uploadPreview }"
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="上传参考图片"
                  @change="handleUpload"
                >
                <img
                  v-if="uploadPreview"
                  :src="uploadPreview"
                  :alt="uploadName"
                >
                <UIcon
                  v-else
                  name="i-lucide-plus"
                  aria-hidden="true"
                />
                <button
                  v-if="uploadPreview"
                  type="button"
                  class="h3-upload-clear"
                  aria-label="移除参考图"
                  @click.prevent.stop="clearUpload"
                >
                  <UIcon name="i-lucide-x" />
                </button>
              </label>

              <div class="editor">
                <div
                  class="editor-mirror"
                  aria-hidden="true"
                >
                  <template
                    v-for="(segment, index) in promptSegments"
                    :key="index"
                  >
                    <mark v-if="segment.mention">{{ segment.text }}</mark>
                    <template v-else>
                      {{ segment.text }}
                    </template>
                  </template>
                </div>
                <textarea
                  ref="mentionInput"
                  v-model="prompt"
                  rows="2"
                  aria-label="创作描述"
                  :placeholder="mode === 'video' ? '描述你想生成的视频画面…' : '描述你想创作的画面…'"
                  @input="onPromptInput"
                  @keydown="onPromptKeydown"
                />
              </div>
            </div>

            <div class="toolbar">
              <button
                type="button"
                class="at-button"
                aria-label="引用素材或角色"
                :aria-expanded="mentionOpen"
                @click="mentionOpen ? mentionOpen = false : openMention()"
              >
                @
              </button>

              <HgModelPicker
                v-model="modelId"
                :options="modelOptions"
                :mode="mode"
              />

              <button
                type="button"
                class="hg-chip"
                :aria-expanded="pickerOpen === 'ratio'"
                aria-label="选择画幅"
                @click="togglePicker('ratio')"
              >
                <UIcon
                  :name="ratio === '9:16' ? 'i-lucide-smartphone' : 'i-lucide-monitor'"
                  aria-hidden="true"
                />
                <span>{{ ratio }}</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="hg-chevron"
                  :class="{ up: pickerOpen === 'ratio' }"
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                class="hg-chip"
                :aria-expanded="pickerOpen === 'resolution'"
                aria-label="选择分辨率"
                @click="togglePicker('resolution')"
              >
                <UIcon
                  name="i-lucide-aperture"
                  aria-hidden="true"
                />
                <span>{{ resolution }}</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="hg-chevron"
                  :class="{ up: pickerOpen === 'resolution' }"
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                class="hg-chip"
                :aria-expanded="pickerOpen === 'duration'"
                aria-label="选择时长"
                @click="togglePicker('duration')"
              >
                <UIcon
                  name="i-lucide-clock-3"
                  aria-hidden="true"
                />
                <span>{{ '' }}</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="hg-chevron"
                  :class="{ up: pickerOpen === 'duration' }"
                  aria-hidden="true"
                />
              </button>
            </div>

            <HgOptionRow
              v-if="pickerOpen === 'ratio'"
              title="比例"
              :value="ratio"
              :options="ratioList.map(item => ({ value: item.value, label: item.label, icon: ratioIcon(item.shape), disabled: mode === 'video' && !!modelId && !supportedVideoRatios.includes(item.value), title: mode === 'video' && !!modelId && !supportedVideoRatios.includes(item.value) ? '当前视频模型不支持该比例' : undefined }))"
              @select="ratio = $event"
              @close="pickerOpen = ''"
            />
            <HgOptionRow
              v-if="pickerOpen === 'resolution'"
              title="分辨率"
              :value="resolution"
              :options="RESOLUTIONS.map(item => ({ value: item.value, label: item.label, icon: 'i-lucide-aperture', disabled: mode === 'video' && item.value === '2K', title: mode === 'video' && item.value === '2K' ? '当前视频模型只提供一档分辨率' : undefined }))"
              @select="resolution = $event"
              @close="pickerOpen = ''"
            />
            <HgOptionRow
              v-if="pickerOpen === 'duration' && mode === 'video'"
              title="时长"
              :value="String(seconds)"
              :options="durationList.map(item => ({ value: String(item), label: `${item} 秒` }))"
              @select="seconds = Number($event)"
              @close="pickerOpen = ''"
            />

            <!-- @ 引用面板：可搜索、方向键选择、Enter 确认、Esc 关闭 -->
            <div
              v-if="mentionOpen"
              class="mention-panel"
            >
              <input
                v-model="mentionQuery"
                type="search"
                placeholder="搜索角色资产"
                aria-label="搜索引用对象"
                @keydown.esc="mentionOpen = false"
              >
              <div class="mention-list">
                <button
                  v-for="(item, index) in mentionItems"
                  :key="item.id"
                  type="button"
                  :class="{ active: index === mentionIndex }"
                  @click="insertMention(item.name)"
                >
                  <UIcon
                    name="i-lucide-user-round"
                    aria-hidden="true"
                  />
                  <span>{{ item.name }}</span>
                </button>
                <p
                  v-if="!mentionItems.length"
                  class="mention-empty"
                >
                  {{ session.token.value ? '还没有角色资产，去「角色资产」创建一个。' : '登录后可引用你的角色资产。' }}
                </p>
              </div>
            </div>

            <p
              v-if="notice"
              class="h3-composer-notice"
              role="status"
            >
              {{ notice }}
            </p>
          </div>
        </div>
        <div class="send-col">
          <button
            type="button"
            class="hg-btn-primary h3-generate"
            @click="submit"
          >
            <UIcon
              name="i-lucide-sparkles"
              aria-hidden="true"
            />生成
          </button>
          <small class="cost-note">{{ costText }}</small>
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
            v-for="tab in TOOL_TABS"
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
        <article
          v-for="tool in filteredTools"
          :key="tool.id"
          class="hg-card tool-card"
        >
          <div class="hg-media r16x9">
            <img
              :src="tool.cover"
              :alt="tool.label"
              loading="lazy"
            >
            <span
              v-if="!tool.badgeBaked"
              class="hg-badge"
            >热门</span>
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
        </article>
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
.send-col {
  display: grid;
  flex: 0 0 88px;
  gap: 4px;
  justify-items: stretch;
}
.h3-generate {
  height: 36px;
  padding: 0 12px;
  font-size: 14px;
}
.cost-note {
  color: var(--hg3-faint);
  font-size: 11px;
  text-align: center;
}

.mode-switch {
  display: inline-flex;
  /* 快捷入口：暗流红材质 */
  gap: 6px;
  padding: 3px;
  margin-bottom: 12px;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
}
.mode-switch button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.mode-switch button.active {
  border-color: var(--hg3-accent-line);
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
  font-weight: 600;
}

.h3-composer-box {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 170px;
  padding: 18px 18px 14px;
  border: 1px solid var(--hg3-accent-line);
  border-radius: var(--hg3-radius-input);
  box-shadow:
    0 0 0 1px rgb(217 131 77 / 6%) inset,
    0 18px 50px rgb(0 0 0 / 45%),
    0 0 70px rgb(233 150 84 / 9%);
}
.h3-composer-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
/* 图片上传框：参照即梦是方形「＋」按钮（不再带文字标签） */
.h3-upload-box {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 14px;
  background: rgb(255 255 255 / 5%);
  color: var(--hg3-ink);
  font-size: 20px;
  cursor: pointer;
}
.h3-upload-box:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-ink);
}
.h3-upload-box input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.h3-upload-box img {
  width: 100%;
  height: 100%;
  border-radius: 11px;
  object-fit: cover;
}
.h3-upload-box.filled {
  border-style: solid;
  border-color: var(--hg3-accent-line);
}
.h3-upload-clear {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: rgb(0 0 0 / 62%);
  color: #fff;
  cursor: pointer;
}
.editor {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 96px;
}
.editor textarea,
.editor-mirror {
  width: 100%;
  margin: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.editor textarea {
  position: relative;
  z-index: 1;
  height: 92px;
  resize: none;
  outline: none;
}
.editor textarea::placeholder {
  color: var(--hg3-faint);
}
.editor-mirror {
  position: absolute;
  inset: 0;
  color: transparent;
  pointer-events: none;
}
.editor-mirror :deep(mark) {
  padding: 2px 6px;
  border: 1px solid var(--hg3-accent-line);
  border-radius: 7px;
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
}

/* 工具条：距上传框底 18px，高 40px（参考图 y350-390） */
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  min-height: 40px;
  flex-wrap: wrap;
}
.at-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 16px;
  cursor: pointer;
}
.at-button:hover {
  border-color: var(--hg3-line-strong);
}

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

.mention-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 16px;
  z-index: 20;
  width: min(300px, 100%);
  padding: 10px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 14px;
  background: #1c1d21;
  box-shadow: 0 20px 50px #000a;
}
.mention-panel input {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 9px;
  background: #141519;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 13px;
  outline: none;
}
.mention-list {
  display: grid;
  gap: 2px;
  max-height: 220px;
  margin-top: 8px;
  overflow-y: auto;
}
.mention-list button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.mention-list button:hover,
.mention-list button.active {
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
}
.mention-empty {
  padding: 18px 8px;
  color: var(--hg3-faint);
  font-size: 12px;
  text-align: center;
}
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
  .h3-composer-body {
    flex-direction: column;
  }
  .h3-upload-box {
    width: 100%;
    height: 64px;
  }
}
</style>
