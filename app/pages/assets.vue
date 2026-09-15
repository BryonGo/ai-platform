<script setup lang="ts">
// 素材库（/assets）——「我的资产」里的素材分区。
//
// 这一版为什么整体重写，而不是在旧页面上打补丁：
//  ① 过滤/排序必须走服务端。旧页面把所有素材一次拉 100 条在前端过滤，素材一多就"只过滤
//     了已加载的那一页"，用户翻到第 3 页才发现有视频，却永远筛不出来。
//  ② 旧页面**没有多选**：导出要一个个点，删除只能一条条来；批量隐藏/删除根本没有入口，
//     而"删了没反应"正是因为它走的是单条接口、失败还没提示。
//  ③ 交互口径要和首页一致：同一个设计体系（hg3 tokens）、同一个确认弹层、同一套空态与
//     骨架屏语言，而不是浏览器原生的 window.confirm 白框。
//
// 选择态是**页面级**的：跨分页、跨筛选都保留，批量动作一次请求打完（后端逐条回报失败），
// 再统一 reload —— 中途失败不会留下"删了一半看不出来"的状态。
import { safeHref } from '~/composables/useSafeUrl'

const api = useHougongApi()
const session = useAuthSession()

useSeoMeta({ title: '素材 · 后宫' })

const PAGE_SIZE = 24

const kindTabs = [
  { id: 'all' as const, label: '全部', icon: 'i-lucide-layout-grid' },
  { id: 'image' as const, label: '图片', icon: 'i-lucide-image' },
  { id: 'video' as const, label: '视频', icon: 'i-lucide-clapperboard' }
]
const originOptions = [
  { id: 'all' as const, label: '全部来源' },
  { id: 'generated' as const, label: '生成' },
  { id: 'uploaded' as const, label: '上传' }
]
const sortOptions = [
  { id: 'new' as const, label: '最新在前' },
  { id: 'old' as const, label: '最早在前' },
  { id: 'large' as const, label: '体积大在前' }
]

const items = ref<AssetItem[]>([])
const total = ref(0)
const pageNo = ref(1)
const firstLoading = ref(true)
const loadingMore = ref(false)
const done = ref(false)
const error = ref('')
const notice = ref('')
/** 图片加载失败的 id —— 破图比空白更难看，失败就换成占位。 */
const brokenIds = ref<Record<string, boolean>>({})

const kind = ref<'all' | 'image' | 'video'>('all')
const origin = ref<'all' | 'generated' | 'uploaded'>('all')
const sort = ref<'new' | 'old' | 'large'>('new')
const keyword = ref('')
const showHidden = ref(false)

const picked = ref<string[]>([])
let lastPickedIndex = -1

const hasFilter = computed(() =>
  kind.value !== 'all' || origin.value !== 'all' || !!keyword.value.trim() || showHidden.value
)

const pickedVisible = computed(() =>
  picked.value.some(id => items.value.find(x => x.id === id && !x.hidden))
)
const pickedHidden = computed(() =>
  picked.value.some(id => items.value.find(x => x.id === id && x.hidden))
)

// ── 列表加载 ──
// seq 是竞态闸门：连续切换筛选时，先发的请求可能后到，旧结果会盖掉新结果。
let seq = 0

async function fetchPage(target: number) {
  const mine = ++seq
  try {
    const res = await api.listAssets({
      hidden: showHidden.value,
      kind: kind.value,
      origin: origin.value,
      keyword: keyword.value.trim(),
      sort: sort.value,
      page: target,
      pageSize: PAGE_SIZE
    })
    if (mine !== seq) return
    total.value = res.total
    items.value = target === 1 ? res.items : items.value.concat(res.items)
    done.value = items.value.length >= res.total || res.items.length === 0
  } catch (e: unknown) {
    if (mine !== seq) return
    error.value = e instanceof Error ? e.message : '加载失败'
    done.value = true
  } finally {
    if (mine === seq) {
      firstLoading.value = false
      loadingMore.value = false
    }
  }
}

/** reload 永远回到第 1 页：筛选条件变了还停在第 3 页，看到的是"新条件下的第 3 页"，是错的。 */
async function reload() {
  seq++ // 让在途的旧请求作废
  error.value = ''
  pageNo.value = 1
  done.value = false
  items.value = []
  firstLoading.value = true
  loadingMore.value = false
  await fetchPage(1)
}

async function loadMore() {
  if (firstLoading.value || loadingMore.value || done.value) return
  loadingMore.value = true
  pageNo.value += 1
  await fetchPage(pageNo.value)
}

// 无限滚动：哨兵进入视口就加载下一页。
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function stopObserver() {
  observer?.disconnect()
  observer = null
}

watch(sentinel, (el) => {
  stopObserver()
  if (!el || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) void loadMore()
  }, { rootMargin: '320px' })
  observer.observe(el)
})

// 筛选变化 → 重新拉第 1 页。搜索走 300ms 防抖，避免每敲一个字母打一次接口。
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void reload()
  }, 300)
})
watch([kind, origin, sort, showHidden], () => {
  void reload()
})

// ── 选择 ──
function isPicked(id: string) {
  return picked.value.includes(id)
}

/** Shift 连选：以"上一次点的那一格"为锚点，选中区间内的**已加载**素材。 */
function togglePick(id: string, index: number, shift = false) {
  if (shift && lastPickedIndex >= 0 && lastPickedIndex !== index) {
    const [from, to] = lastPickedIndex < index ? [lastPickedIndex, index] : [index, lastPickedIndex]
    const range = items.value.slice(from, to + 1).map(x => x.id)
    const next = new Set(picked.value)
    const removing = next.has(id)
    for (const rid of range) {
      if (removing) next.delete(rid)
      else next.add(rid)
    }
    picked.value = [...next]
  } else {
    const i = picked.value.indexOf(id)
    if (i >= 0) picked.value.splice(i, 1)
    else picked.value.push(id)
  }
  lastPickedIndex = index
}

function pickAllLoaded() {
  if (picked.value.length >= items.value.length) {
    picked.value = []
    return
  }
  picked.value = items.value.map(x => x.id)
}

function clearPick() {
  picked.value = []
  lastPickedIndex = -1
}

// 触摸端长按 = 选择：手机上没有 hover，勾选框常驻又太吵。
let pressTimer: ReturnType<typeof setTimeout> | null = null
let longPressed = false

function onPressStart(a: AssetItem, index: number) {
  longPressed = false
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    longPressed = true
    togglePick(a.id, index)
  }, 550)
}
function onPressEnd() {
  if (pressTimer) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}
function onMediaClick(a: AssetItem) {
  if (longPressed) {
    longPressed = false
    return
  }
  openPreview(a)
}

// ── 预览 ──
// 图片走站内统一的完整预览组件；视频在同款遮罩里用原生播放器（要能拖进度、能全屏）。
const preview = ref<AssetItem | null>(null)
const previewOpen = ref(false)

function openPreview(a: AssetItem) {
  if (!isImage(a) && !isVideo(a)) return
  preview.value = a
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
}

// ── 单条操作（乐观更新 + 失败回滚）──
const busyId = ref('')

async function toggleHiddenOne(a: AssetItem) {
  const before = a.hidden
  a.hidden = !before
  busyId.value = a.id
  error.value = ''
  try {
    await api.setAssetHidden(a.id, !before)
    notice.value = before ? `已恢复「${displayName(a)}」` : `已隐藏「${displayName(a)}」`
    // 当前正按 hidden 过滤时，这条已经不属于本列表，直接重拉。
    if (showHidden.value === before) await reload()
  } catch (e: unknown) {
    a.hidden = before
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    busyId.value = ''
  }
}

const downloadingId = ref('')

async function download(a: AssetItem) {
  downloadingId.value = a.id
  error.value = ''
  try {
    const { url } = await api.assetDownloadUrl(a.id)
    if (!url) {
      error.value = '后端未返回下载地址'
      return
    }
    const target = safeHref(url)
    if (target) window.open(target, '_blank', 'noopener')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '获取下载地址失败'
  } finally {
    downloadingId.value = ''
  }
}

// ── 批量操作 ──
const batchBusy = ref(false)
const confirmOpen = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const pendingSingle = ref<AssetItem | null>(null)
/** 进行中的批量进度（给确认弹窗画进度条）。null = 没有进行中的批量操作。 */
const batchProgress = ref<{ done: number, total: number } | null>(null)

/**
 * 分片大小：让进度条大约推进 10 次，并保证单片不超过接口上限。
 *
 * 后端 /platform/asset/batch 一次能收 200 条（一条 UPDATE、一个事务），但整批只发一次的话
 * 进度条只能从 0% 直接跳到 100% —— 删 80 张的过程里界面没有任何变化，用户会以为卡死了。
 * 分片后每片完成即推进进度；片内仍是"一条事务 + 一条 UPDATE"，不会退化成 N 次单条接口。
 */
const MAX_BATCH_CHUNK = 200

function chunkSizeFor(total: number) {
  return Math.max(1, Math.min(MAX_BATCH_CHUNK, Math.ceil(total / 10)))
}

/** 批量条的进度百分比（隐藏/恢复没有确认弹窗，进度就在条上给）。 */
const batchPercent = computed(() => {
  const p = batchProgress.value
  if (!p || p.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((p.done / p.total) * 100)))
})

/** 分片执行批量动作，返回累计结果。进度写进 batchProgress，供弹窗进度条使用。 */
async function batchInChunks(ids: string[], action: 'delete' | 'hide' | 'unhide') {
  let affected = 0
  const failed: { id: string, reason: string }[] = []
  batchProgress.value = { done: 0, total: ids.length }
  const size = chunkSizeFor(ids.length)
  for (let i = 0; i < ids.length; i += size) {
    const slice = ids.slice(i, i + size)
    const res = await api.batchAssets(slice, action)
    affected += res.affected || 0
    if (res.failed?.length) failed.push(...res.failed)
    batchProgress.value = { done: Math.min(ids.length, i + slice.length), total: ids.length }
  }
  return { affected, failed }
}

function askDelete(one?: AssetItem) {
  pendingSingle.value = one || null
  if (one) {
    confirmTitle.value = '删除这个素材？'
    confirmMessage.value = `「${displayName(one)}」将被删除，引用它的作品可能失效。此操作不可撤销。`
  } else {
    confirmTitle.value = `删除选中的 ${picked.value.length} 个素材？`
    confirmMessage.value = `选中的 ${picked.value.length} 个素材将被删除，引用它们的作品可能失效。此操作不可撤销。`
  }
  confirmOpen.value = true
}

async function doDelete() {
  const one = pendingSingle.value
  const ids = one ? [one.id] : [...picked.value]
  if (!ids.length) {
    confirmOpen.value = false
    return
  }
  batchBusy.value = true
  error.value = ''
  try {
    const res = await batchInChunks(ids, 'delete')
    reportBatch('删除', res)
    picked.value = picked.value.filter(id => !ids.includes(id))
    pendingSingle.value = null
    confirmOpen.value = false
  } catch (e: unknown) {
    // 分片删除没有回滚可言：已删掉的那些就是删掉了，必须说清楚，不能让用户以为整批都没动。
    const done = batchProgress.value?.done || 0
    const tail = done > 0 ? `（前 ${done} 个可能已删除，不会回滚）` : ''
    error.value = (e instanceof Error ? e.message : '删除失败') + tail
    confirmOpen.value = false
    pendingSingle.value = null
    picked.value = []
  } finally {
    batchBusy.value = false
    batchProgress.value = null
    // 无论成败都以服务端为准重拉：部分失败时列表必须显示"实际还剩什么"。
    await reload()
  }
}

async function runBatch(action: 'hide' | 'unhide') {
  const ids = [...picked.value]
  if (!ids.length) return
  batchBusy.value = true
  error.value = ''
  // 乐观更新：先按预期改本地，失败再 reload 回权威状态。
  const snapshot = items.value.map(x => ({ id: x.id, hidden: x.hidden }))
  for (const it of items.value) {
    if (ids.includes(it.id)) it.hidden = action === 'hide'
  }
  try {
    const res = await batchInChunks(ids, action)
    reportBatch(action === 'hide' ? '隐藏' : '恢复', res)
    clearPick()
    // 一律以服务端为准重拉：隐藏/恢复都会改变"当前这个列表该有哪些行"——
    // 在可用列表里隐藏、在隐藏列表里恢复，都必须让移出/移入立刻反映出来；
    // 靠本地乐观值猜"要不要重拉"必然有分支漏掉（曾漏掉"可用列表里隐藏"这一支，
    // 结果列表数字不变，看起来像没生效）。
    await reload()
  } catch (e: unknown) {
    const byId = new Map(snapshot.map(s => [s.id, s.hidden]))
    for (const it of items.value) {
      const was = byId.get(it.id)
      if (was !== undefined) it.hidden = was
    }
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    batchBusy.value = false
    batchProgress.value = null
  }
}

/** 批量结果必须报清楚"成了几个、哪几个没成、为什么"，否则用户只知道"点了没反应"。 */function reportBatch(verb: string, res: { affected: number, failed: { id: string, reason: string }[] }) {
  const failed = res.failed?.length || 0
  if (!failed) {
    notice.value = `${verb}成功 ${res.affected} 个`
    return
  }
  const head = res.failed.slice(0, 3).map(f => `#${f.id}（${f.reason}）`).join('、')
  notice.value = `${verb}：成功 ${res.affected} 个，失败 ${failed} 个 —— ${head}${failed > 3 ? ' 等' : ''}`
}

// ── 发布到社区 ──
// 走 platform 的 publication 模型（work/edit → work/publish）：首页「探索」流读的就是它。
// 与 /hougong/works（生成结果入库）是两套模型，这里只负责"发布"这一步。
const publishOpen = ref(false)
const publishPending = ref(false)
/** 发布用的封面资产：选中的第一张图片，没有图片就用第一个选中项。 */
const publishCover = ref<AssetItem | null>(null)

function askPublish() {
  const selected = picked.value
    .map(id => items.value.find(x => x.id === id))
    .filter((x): x is AssetItem => !!x)
  if (!selected.length) return
  publishCover.value = selected.find(a => isImage(a)) || selected[0] || null
  publishOpen.value = true
}

/**
 * 提交发布。两步是后端契约决定的：先 work/edit 落草稿（封面在这一步写库），
 * 再 work/publish 置为 published —— 合成一步会在"草稿/发布"之间丢掉状态。
 */
async function submitPublish(payload: { mode: 'draft' | 'publish', title: string, content: string, contentRating: string }) {
  if (publishPending.value) return
  publishPending.value = true
  error.value = ''
  try {
    const cover = publishCover.value
    const editor = await api.saveWorkDraft({
      title: payload.title,
      content: payload.content,
      coverAssetId: cover?.id,
      contentRating: payload.contentRating || undefined
    })
    if (payload.mode === 'draft') {
      notice.value = '已保存草稿，可在「我的发布」里继续编辑并发布'
      publishOpen.value = false
      return
    }
    if (!editor?.id) throw new Error('保存草稿失败：后端未返回作品 id')
    const work = await api.publishWork(editor.id)
    notice.value = `已发布《${work.title}》，首页探索流即可看到`
    publishOpen.value = false
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '发布失败'
  } finally {
    publishPending.value = false
  }
}

// ── 导出（工程包）──
// 选中若干资产 → POST /platform/export 打成 ZIP（**异步**）→ 轮询到终态取 downloadUrl。
const exporting = ref(false)
const exportTask = ref<ExportTask | null>(null)
const exportError = ref('')

function extOf(mime: string) {
  const m = (mime || '').toLowerCase()
  for (const [k, v] of [['png', 'png'], ['jpeg', 'jpg'], ['jpg', 'jpg'], ['webp', 'webp'],
    ['gif', 'gif'], ['mp4', 'mp4'], ['webm', 'webm'], ['zip', 'zip']] as const) {
    if (m.includes(k)) return v
  }
  const sub = m.split('/')[1] || ''
  return sub.replace(/[^a-z0-9]/g, '') || 'bin'
}

// relPath **必填**：后端打包用 archive.sanitizeEntryPath 净化条目名，空路径直接报
// "empty path" 并计入 failures —— 尽管 API 文档写的是「缺省落在根目录」。
// 所以这里给每条资产一个确定的相对路径，按来源分目录、用资产 id 防重名。
function relPathOf(a: AssetItem) {
  return `${a.origin || 'asset'}/${a.id}.${extOf(a.mimeType)}`
}

async function runExport() {
  if (!picked.value.length || exporting.value) return
  exporting.value = true
  exportError.value = ''
  exportTask.value = null
  try {
    const reqItems = picked.value.map((id) => {
      const a = items.value.find(x => x.id === id)
      return { assetId: id, relPath: a ? relPathOf(a) : `asset/${id}.bin` }
    })
    const { exportId } = await api.createExport(reqItems, 'hougong_assets')
    // 异步任务：轮询到终态。失败也要留存 task，好把 failures 展示出来。
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1500))
      const res = await api.getExport(exportId)
      if (!res.found || !res.task) break
      exportTask.value = res.task
      if (res.task.status === 'succeeded' || res.task.status === 'failed') break
    }
    if (exportTask.value?.status === 'succeeded') {
      notice.value = `工程包已生成（${exportTask.value.done} 个文件）`
    }
  } catch (e: unknown) {
    exportError.value = e instanceof Error ? e.message : '导出失败'
  } finally {
    exporting.value = false
  }
}

// ── 展示辅助 ──
const KIND_LABEL: Record<string, string> = {
  image: '图片', video: '视频', audio: '音频', zip: '压缩包', manifest: '清单', file: '文件'
}

function typeLabel(a: AssetItem) {
  return KIND_LABEL[a.kind || ''] || '素材'
}
function isImage(a: AssetItem) {
  return (a.kind || '').startsWith('image') || (a.mimeType || '').startsWith('image/')
}
function isVideo(a: AssetItem) {
  return (a.kind || '') === 'video' || (a.mimeType || '').startsWith('video/')
}

/** 老数据没有文件名（生成产物本来就没有），退回「类型 · 日期」，不要显示一串 id。 */
function displayName(a: AssetItem) {
  const n = (a.name || '').trim()
  return n || `${typeLabel(a)} · ${dateText(a.createdAt)}`
}

function dateText(ts: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function sizeText(b: number) {
  if (!b) return '—'
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(b / 1024))} KB`
}

function dimsOf(a: AssetItem) {
  return a.width && a.height ? `${a.width}×${a.height}` : '—'
}

function onImgError(id: string) {
  brokenIds.value = { ...brokenIds.value, [id]: true }
}

// Esc：先关预览，再清选择。两件事都不该逼用户去点叉。
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (previewOpen.value) {
    previewOpen.value = false
    return
  }
  if (picked.value.length) clearPick()
}

onMounted(async () => {
  await session.load()
  document.addEventListener('keydown', onKeydown)
  if (!session.token.value) {
    void navigateTo('/auth/login')
    return
  }
  void reload()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (searchTimer) clearTimeout(searchTimer)
  if (pressTimer) clearTimeout(pressTimer)
  stopObserver()
})
</script>

<template>
  <div
    class="assets-page"
    :class="{ 'has-pick': picked.length > 0 }"
  >
    <AssetSectionNav />

    <header class="assets-head">
      <div class="assets-head__text">
        <p class="assets-kicker">
          我的资产
        </p>
        <h1>素材</h1>
        <p class="assets-sub">
          这里是你上传与生成的全部图片、视频。勾选多个素材可以批量隐藏、恢复到可用状态，
          也可以打成工程包一次带走。
        </p>
      </div>
      <!-- 加载中不显示上一次的数字：切筛选时旧数字会让人以为筛选没生效 -->
      <div class="assets-head__stat">
        <strong>{{ firstLoading ? '…' : total }}</strong>
        <span>{{ showHidden ? '个已隐藏' : '个可用素材' }}</span>
      </div>
    </header>

    <!-- 筛选：全部走服务端，翻页后依然准 -->
    <section
      class="assets-toolbar"
      aria-label="素材筛选"
    >
      <div
        class="assets-tabs"
        role="group"
        aria-label="素材类型"
      >
        <button
          v-for="t in kindTabs"
          :key="t.id"
          type="button"
          class="assets-tab"
          :class="{ active: kind === t.id }"
          :aria-pressed="kind === t.id"
          @click="kind = t.id"
        >
          <UIcon :name="t.icon" />
          {{ t.label }}
        </button>
      </div>

      <div class="assets-filters">
        <label class="assets-search">
          <UIcon name="i-lucide-search" />
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索文件名或资产 ID"
            aria-label="搜索素材"
          >
        </label>

        <label class="assets-select">
          <span>来源</span>
          <select
            v-model="origin"
            aria-label="来源筛选"
          >
            <option
              v-for="o in originOptions"
              :key="o.id"
              :value="o.id"
            >
              {{ o.label }}
            </option>
          </select>
        </label>

        <label class="assets-select">
          <span>排序</span>
          <select
            v-model="sort"
            aria-label="排序方式"
          >
            <option
              v-for="s in sortOptions"
              :key="s.id"
              :value="s.id"
            >
              {{ s.label }}
            </option>
          </select>
        </label>

        <label class="assets-switch">
          <input
            v-model="showHidden"
            type="checkbox"
          >
          <span>只看已隐藏</span>
        </label>
      </div>
    </section>

    <p
      v-if="error"
      class="assets-alert"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-else-if="notice"
      class="assets-note"
    >
      {{ notice }}
    </p>

    <!-- 导出状态：异步任务，成功给下载链接，失败/部分失败必须显示原因 -->
    <div
      v-if="exportError"
      class="assets-alert"
      role="alert"
    >
      导出失败：{{ exportError }}
    </div>
    <div
      v-if="exportTask"
      class="export-panel"
    >
      <div class="export-panel__head">
        <strong>工程包</strong>
        <span class="export-panel__state">{{ exportTask.status }}</span>
        <span class="export-panel__count">{{ exportTask.done }}/{{ exportTask.total }} · 失败 {{ exportTask.failed }}</span>
      </div>
      <a
        v-if="exportTask.status === 'succeeded' && exportTask.downloadUrl"
        :href="safeHref(exportTask.downloadUrl)"
        class="assets-btn assets-btn--primary"
        download
      >下载 ZIP</a>
      <span
        v-else-if="exportTask.status === 'failed'"
        class="export-panel__err"
      >{{ exportTask.errorMessage || exportTask.errorCode }}</span>
      <ul
        v-if="exportTask.failures?.length"
        class="export-failures"
      >
        <li
          v-for="f in exportTask.failures"
          :key="f.path + f.reason"
        >
          <code>{{ f.path }}</code> —— {{ f.reason }}
        </li>
      </ul>
    </div>

    <!-- 骨架屏：首屏结构与真实网格一致，避免"先空一块再跳出来" -->
    <div
      v-if="firstLoading"
      class="assets-grid"
      aria-hidden="true"
    >
      <div
        v-for="i in 8"
        :key="i"
        class="asset-card asset-card--skeleton"
      >
        <div class="asset-card__media" />
        <div class="asset-card__body">
          <span class="sk-line" />
          <span class="sk-line sk-line--short" />
        </div>
      </div>
    </div>

    <div
      v-else-if="items.length"
      class="assets-grid"
    >
      <article
        v-for="(a, index) in items"
        :key="a.id"
        class="asset-card"
        :class="{ 'is-picked': isPicked(a.id), 'is-hidden': a.hidden }"
      >
        <div
          class="asset-card__media"
          @click="onMediaClick(a)"
          @touchstart.passive="onPressStart(a, index)"
          @touchend="onPressEnd"
          @touchmove="onPressEnd"
        >
          <img
            v-if="isImage(a) && !brokenIds[a.id]"
            class="media-fg"
            :src="a.url"
            :alt="displayName(a)"
            loading="lazy"
            @error="onImgError(a.id)"
          >
          <video
            v-else-if="isVideo(a)"
            :src="a.url"
            muted
            playsinline
            preload="metadata"
          />
          <div
            v-else
            class="asset-card__file"
          >
            <UIcon :name="isImage(a) ? 'i-lucide-image-off' : 'i-lucide-file'" />
          </div>

          <button
            type="button"
            class="asset-card__pick"
            :aria-pressed="isPicked(a.id)"
            :aria-label="isPicked(a.id) ? `取消选择 ${displayName(a)}` : `选择 ${displayName(a)}`"
            @click.stop="togglePick(a.id, index, $event.shiftKey)"
          >
            <UIcon :name="isPicked(a.id) ? 'i-lucide-check' : 'i-lucide-plus'" />
          </button>

          <span
            v-if="isVideo(a)"
            class="asset-card__play"
            aria-hidden="true"
          ><UIcon name="i-lucide-play" /></span>
          <span
            v-if="a.hidden"
            class="asset-card__flag"
          >已隐藏</span>
        </div>

        <div class="asset-card__body">
          <strong :title="displayName(a)">{{ displayName(a) }}</strong>
          <p class="asset-card__meta">
            <span class="asset-card__tag">{{ typeLabel(a) }}</span>
            <span>{{ dimsOf(a) }}</span>
            <span>{{ sizeText(a.bytes) }}</span>
          </p>
          <p class="asset-card__date">
            {{ a.origin === 'generated' ? '生成' : '上传' }} · {{ dateText(a.createdAt) }}
          </p>
        </div>

        <div class="asset-card__actions">
          <button
            type="button"
            :disabled="downloadingId === a.id"
            @click="download(a)"
          >
            {{ downloadingId === a.id ? '获取中…' : '下载' }}
          </button>
          <button
            type="button"
            :disabled="busyId === a.id"
            @click="toggleHiddenOne(a)"
          >
            {{ a.hidden ? '恢复' : '隐藏' }}
          </button>
          <button
            type="button"
            class="danger"
            @click="askDelete(a)"
          >
            删除
          </button>
        </div>
      </article>
    </div>

    <!-- 三种空态各不相同：没素材 / 筛选没结果 / 隐藏区是空的。给的动作也不一样。 -->
    <div
      v-else
      class="assets-empty"
    >
      <UIcon
        class="assets-empty__icon"
        :name="hasFilter ? 'i-lucide-search-x' : (showHidden ? 'i-lucide-eye-off' : 'i-lucide-image-plus')"
      />
      <template v-if="showHidden">
        <h2>还没有隐藏的素材</h2>
        <p>被隐藏的素材不会出现在创作时的选择器里，但依然保存在这里。</p>
      </template>
      <template v-else-if="hasFilter">
        <h2>没有符合条件的素材</h2>
        <p>换个类型、来源或关键词再试试。</p>
        <button
          type="button"
          class="assets-btn"
          @click="kind = 'all'; origin = 'all'; keyword = ''; showHidden = false"
        >
          清除筛选条件
        </button>
      </template>
      <template v-else>
        <h2>还没有素材</h2>
        <p>在创作页上传参考图，或生成一张作品，产物会自动出现在这里。</p>
        <NuxtLink
          to="/create"
          class="assets-btn assets-btn--primary"
        >
          去创作
        </NuxtLink>
      </template>
    </div>

    <!-- 无限滚动哨兵 -->
    <div
      ref="sentinel"
      class="assets-sentinel"
      aria-hidden="true"
    />
    <p
      v-if="loadingMore"
      class="assets-more"
    >
      加载中…
    </p>
    <p
      v-else-if="items.length && done"
      class="assets-more"
    >
      已经到底了 · 共 {{ total }} 个素材
    </p>

    <!-- 批量操作条：有选择才出现，固定在底部，不遮住最后一行 -->
    <Transition name="batchbar">
      <div
        v-if="picked.length"
        class="asset-batchbar"
        role="region"
        aria-label="批量操作"
      >
        <span class="asset-batchbar__count">
          <template v-if="batchBusy && batchProgress">
            处理中 <strong>{{ batchProgress.done }}</strong>/{{ batchProgress.total }}
          </template>
          <template v-else>
            已选 <strong>{{ picked.length }}</strong> 个
          </template>
        </span>
        <!-- 隐藏/恢复没有确认弹窗，进度就在批量条上显示 -->
        <span
          v-if="batchBusy && batchProgress && batchProgress.total > 1"
          class="asset-batchbar__track"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="batchProgress.total"
          :aria-valuenow="batchProgress.done"
        ><span :style="{ width: `${batchPercent}%` }" /></span>
        <div class="asset-batchbar__acts">
          <button
            type="button"
            class="assets-btn"
            :disabled="batchBusy"
            @click="pickAllLoaded"
          >
            {{ picked.length >= items.length ? '取消全选' : '全选已加载' }}
          </button>
          <button
            v-if="pickedVisible"
            type="button"
            class="assets-btn"
            :disabled="batchBusy"
            @click="runBatch('hide')"
          >
            隐藏
          </button>
          <button
            v-if="pickedHidden"
            type="button"
            class="assets-btn"
            :disabled="batchBusy"
            @click="runBatch('unhide')"
          >
            恢复
          </button>
          <button
            type="button"
            class="assets-btn"
            :disabled="batchBusy"
            @click="askPublish"
          >
            发布作品
          </button>
          <button
            type="button"
            class="assets-btn"
            :disabled="exporting"
            @click="runExport"
          >
            {{ exporting ? '打包中…' : '导出 ZIP' }}
          </button>
          <button
            type="button"
            class="assets-btn assets-btn--danger"
            :disabled="batchBusy"
            @click="askDelete()"
          >
            删除
          </button>
          <button
            type="button"
            class="assets-btn assets-btn--quiet"
            :disabled="batchBusy"
            @click="clearPick"
          >
            取消选择
          </button>
        </div>
      </div>
    </Transition>

    <HgConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      confirm-text="删除"
      danger
      :pending="batchBusy"
      :progress="batchProgress"
      @confirm="doDelete"
    />

    <HgPublishDialog
      v-model:open="publishOpen"
      :cover-url="publishCover?.url || ''"
      :cover-name="publishCover ? displayName(publishCover) : ''"
      :pending="publishPending"
      @submit="submitPublish"
    />

    <HgMediaPreview
      v-if="preview && isImage(preview)"
      v-model:open="previewOpen"
      :src="preview.url"
      :title="displayName(preview)"
      :author="`${typeLabel(preview)} · ${dimsOf(preview)} · ${sizeText(preview.bytes)}`"
      kind="image"
    />

    <div
      v-if="preview && isVideo(preview) && previewOpen"
      class="video-mask"
      @click.self="closePreview"
    >
      <figure class="video-stage">
        <header>
          <strong>{{ displayName(preview) }}</strong>
          <button
            type="button"
            class="assets-btn assets-btn--quiet"
            @click="closePreview"
          >
            关闭
          </button>
        </header>
        <!-- 视频用原生播放器：进度、音量、全屏都交给浏览器，自己造一个只会更难用 -->
        <video
          :src="preview.url"
          controls
          autoplay
          playsinline
        />
      </figure>
    </div>
  </div>
</template>

<style scoped>
.assets-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 8px;
}
/* 批量条固定在底部，留出空间免得盖住最后一行卡片 */
.assets-page.has-pick {
  padding-bottom: 96px;
}

/* ---------- 页头 ---------- */
.assets-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}
.assets-kicker {
  margin: 0 0 6px;
  color: var(--hg3-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.assets-head h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 800;
}
.assets-sub {
  margin: 8px 0 0;
  max-width: 62ch;
  color: var(--hg3-muted);
  font-size: 13.5px;
  line-height: 1.7;
}
.assets-head__stat {
  display: grid;
  gap: 2px;
  text-align: right;
}
.assets-head__stat strong {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
}
.assets-head__stat span {
  color: var(--hg3-faint);
  font-size: 12px;
}

/* ---------- 筛选条 ---------- */
.assets-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--hg3-line);
  border-radius: var(--hg3-radius-card);
  background: var(--hg3-card);
}
.assets-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: var(--hg3-well);
}
.assets-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}
.assets-tab:hover {
  color: var(--hg3-ink);
}
.assets-tab.active {
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
}
.assets-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.assets-search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  background: var(--hg3-well);
  color: var(--hg3-faint);
}
.assets-search:focus-within {
  border-color: var(--hg3-accent-line);
}
.assets-search input {
  width: 190px;
  border: 0;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 13px;
  outline: none;
}
.assets-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  background: var(--hg3-well);
  color: var(--hg3-faint);
  font-size: 12px;
}
.assets-select select {
  border: 0;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  cursor: pointer;
}
.assets-select select option {
  background: var(--hg3-card);
  color: var(--hg3-ink);
}
.assets-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px 0 10px;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  background: var(--hg3-well);
  color: var(--hg3-muted);
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
}
.assets-switch input {
  accent-color: var(--hg3-accent);
  cursor: pointer;
}

/* ---------- 提示 ---------- */
.assets-alert,
.assets-note {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
}
.assets-alert {
  border: 1px solid rgb(255 112 122 / 40%);
  background: rgb(255 112 122 / 10%);
  color: #ffb3ba;
}
.assets-note {
  border: 1px solid var(--hg3-line);
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-muted);
}

/* ---------- 导出面板 ---------- */
.export-panel {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--hg3-line);
  border-radius: 12px;
  background: rgb(255 255 255 / 3%);
  font-size: 13px;
}
.export-panel__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.export-panel__state {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
  font-size: 12px;
}
.export-panel__count {
  color: var(--hg3-faint);
  font-size: 12px;
}
.export-panel__err {
  color: #ffb3ba;
}
.export-failures {
  margin: 0;
  padding-left: 18px;
  color: #ffb3ba;
  font-size: 12px;
  line-height: 1.7;
}

/* ---------- 网格 ---------- */
.assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(186px, 1fr));
  gap: 14px;
}
.asset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid transparent;
  border-radius: var(--hg3-radius-card);
  background: var(--hg3-card);
  overflow: hidden;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.asset-card:hover {
  border-color: var(--hg3-accent-line);
}
.asset-card.is-picked {
  border-color: var(--hg3-accent);
  box-shadow: 0 0 0 1px var(--hg3-accent);
}
.asset-card.is-hidden .asset-card__media {
  opacity: 0.45;
}
.asset-card__media {
  position: relative;
  aspect-ratio: 1;
  background: #1b1d21;
  cursor: zoom-in;
}
.asset-card__media img,
.asset-card__media video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 180ms ease;
}
.asset-card:hover .asset-card__media img {
  transform: scale(1.03);
}
.asset-card__file {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--hg3-faint);
  font-size: 30px;
}
.asset-card__pick {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: 8px;
  background: rgb(12 13 15 / 62%);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 140ms ease, background 140ms ease, border-color 140ms ease;
}
.asset-card:hover .asset-card__pick,
.asset-card.is-picked .asset-card__pick,
.assets-page.has-pick .asset-card__pick {
  opacity: 1;
}
/* 触摸端没有 hover，勾选框必须常驻 */
@media (hover: none) {
  .asset-card__pick {
    opacity: 1;
  }
}
.asset-card.is-picked .asset-card__pick {
  border-color: transparent;
  background: var(--hg3-accent);
  color: var(--hg3-accent-ink);
}
.asset-card__play {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgb(12 13 15 / 62%);
  color: #fff;
  font-size: 14px;
}
.asset-card__flag {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgb(12 13 15 / 70%);
  color: var(--hg3-muted);
  font-size: 11px;
}
.asset-card__body {
  display: grid;
  gap: 4px;
  padding: 10px 12px 8px;
}
.asset-card__body strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--hg3-muted);
  font-size: 11.5px;
}
.asset-card__tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgb(255 255 255 / 7%);
  color: var(--hg3-ink);
}
.asset-card__date {
  margin: 0;
  color: var(--hg3-faint);
  font-size: 11.5px;
}
.asset-card__actions {
  display: flex;
  gap: 6px;
  padding: 0 12px 12px;
}
.asset-card__actions button {
  flex: 1;
  height: 28px;
  padding: 0;
  border: 1px solid var(--hg3-line);
  border-radius: 8px;
  background: transparent;
  color: var(--hg3-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease;
}
.asset-card__actions button:hover:not(:disabled) {
  border-color: var(--hg3-accent);
  color: var(--hg3-accent-hi);
}
.asset-card__actions button:disabled {
  opacity: 0.5;
  cursor: default;
}
.asset-card__actions button.danger:hover {
  border-color: #ff707a;
  color: #ff707a;
}

/* 骨架屏 */
.asset-card--skeleton .asset-card__media {
  background: rgb(255 255 255 / 5%);
}
.sk-line {
  display: block;
  height: 10px;
  border-radius: 6px;
  background: rgb(255 255 255 / 6%);
}
.sk-line--short {
  width: 55%;
}

/* ---------- 空态 ---------- */
.assets-empty {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 56px 20px;
  border: 1px dashed var(--hg3-line-strong);
  border-radius: var(--hg3-radius-card);
  text-align: center;
  color: var(--hg3-muted);
}
.assets-empty > svg,
.assets-empty__icon {
  font-size: 30px;
  color: var(--hg3-faint);
}
.assets-empty h2 {
  margin: 0;
  color: var(--hg3-ink);
  font-size: 17px;
}
.assets-empty p {
  margin: 0;
  max-width: 46ch;
  font-size: 13px;
  line-height: 1.7;
}

/* ---------- 哨兵与按钮 ---------- */
.assets-sentinel {
  height: 1px;
}
.assets-more {
  margin: 0;
  color: var(--hg3-faint);
  font-size: 12.5px;
  text-align: center;
}
.assets-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 10px;
  background: rgb(255 255 255 / 5%);
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
}
.assets-btn:hover:not(:disabled) {
  border-color: var(--hg3-accent);
  color: var(--hg3-accent-hi);
}
.assets-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.assets-btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, var(--hg3-accent-hi), var(--hg3-accent));
  color: var(--hg3-accent-ink);
  font-weight: 800;
}
.assets-btn--primary:hover:not(:disabled) {
  color: var(--hg3-accent-ink);
  filter: brightness(1.06);
}
.assets-btn--danger {
  border-color: rgb(255 112 122 / 45%);
  color: #ff8f96;
}
.assets-btn--danger:hover:not(:disabled) {
  border-color: #ff707a;
  color: #ff8f96;
  background: rgb(255 112 122 / 12%);
}
.assets-btn--quiet {
  border-color: transparent;
  background: transparent;
  color: var(--hg3-muted);
}

/* ---------- 批量条 ---------- */
.asset-batchbar {
  position: fixed;
  z-index: 60;
  bottom: 18px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: calc(100vw - 32px);
  padding: 10px 14px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 16px;
  background: rgb(28 30 34 / 96%);
  box-shadow: 0 18px 48px rgb(0 0 0 / 45%);
  backdrop-filter: blur(10px);
  transform: translateX(-50%);
  flex-wrap: wrap;
}
.asset-batchbar__count {
  color: var(--hg3-muted);
  font-size: 13px;
  white-space: nowrap;
}
.asset-batchbar__count strong {
  color: var(--hg3-ink);
  font-size: 15px;
}
.asset-batchbar__acts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.asset-batchbar__track {
  position: relative;
  flex: 1 1 120px;
  min-width: 90px;
  height: 6px;
  border-radius: 999px;
  background: rgb(255 255 255 / 10%);
  overflow: hidden;
}
.asset-batchbar__track > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--hg3-accent), var(--hg3-accent-hi));
  transition: width 220ms ease;
}
.batchbar-enter-active,
.batchbar-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.batchbar-enter-from,
.batchbar-leave-to {
  opacity: 0;
  transform: translate(-50%, 14px);
}

/* ---------- 视频预览 ---------- */
.video-mask {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(6 7 9 / 84%);
  backdrop-filter: blur(4px);
}
.video-stage {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(1000px, 100%);
  margin: 0;
}
.video-stage header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--hg3-ink);
}
.video-stage video {
  width: 100%;
  max-height: calc(100dvh - 140px);
  border-radius: 12px;
  background: #000;
}

@media (max-width: 900px) {
  .assets-head h1 {
    font-size: 24px;
  }
  .assets-head__stat {
    text-align: left;
  }
  .assets-toolbar {
    padding: 10px;
  }
  .assets-search input {
    width: 120px;
  }
  .assets-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }
  .asset-batchbar {
    right: 16px;
    left: 16px;
    justify-content: space-between;
    transform: none;
  }
  .batchbar-enter-from,
  .batchbar-leave-to {
    opacity: 0;
    transform: translateY(14px);
  }
}
</style>
