<script setup lang="ts">
/**
 * 我的画布 —— 创作者找回自己建过的画布。
 *
 * 为什么需要这一页：画布编辑器只认 `?id=` 或"最近编辑的那张"，图名在界面上也没渲染过。
 * 结果是"我新建了一张，老的只剩 id，而用户不知道 id"（2026-06 用户反馈）。
 *
 * 口径（与用户定的三条一致）：
 *   · 列表只显示**标题 + 时间**（不做缩略图：那要给 GraphSummary 加摘要字段，且图多了更慢）；
 *   · 就地改名走 `graph/rename`（只改标题、不动 revision、不刷新更新时间 —— 改名不该把图顶到最前）；
 *   · 删除是**软删**（服务端 `graph/del`），产物与会话不动 —— 图是用户资产，删图不等于删资料。
 */
const canvasApi = useCanvasApi()

interface Row { id: string, title: string, updatedAt: number, nodeCount: number, ownerType: string }

const rows = ref<Row[]>([])
const total = ref(0)
const page = ref(1)
const size = 10
const keyword = ref('')
const keywordApplied = ref('')
/** 排序与归属筛选：列表页只做这两个，够用且不引额外字段。 */
const sort = ref('updated')
const ownerFilter = ref('')
const OWNER_OPTIONS = [
  { value: '', label: '全部画布' },
  { value: 'episode', label: '挂在某一集' },
  { value: 'project', label: '挂在某个项目' },
  { value: '-', label: '自由图（没挂归属）' }
]
const loading = ref(false)
const error = ref('')
/** 正在改名的行 id 与草稿（就地编辑）。 */
const editingId = ref('')
const draft = ref('')
const busy = ref(false)

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size)))

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const { list, total: t } = await canvasApi.listGraphsPaged('hougong', {}, {
      page: page.value, size, keyword: keywordApplied.value,
      sort: sort.value, ownerType: ownerFilter.value
    })
    rows.value = list.map(g => ({
      id: String(g.id),
      title: g.title || '未命名图',
      updatedAt: g.updatedAt,
      nodeCount: g.nodeCount ?? 0,
      ownerType: (g as { ownerType?: string }).ownerType || ''
    }))
    total.value = t
  } catch (e) {
    error.value = e instanceof Error ? e.message : '列表加载失败'
  } finally {
    loading.value = false
  }
}

function search(): void {
  keywordApplied.value = keyword.value.trim()
  page.value = 1
  void load()
}

function goPage(delta: number): void {
  const next = page.value + delta
  if (next < 1 || next > pageCount.value) return
  page.value = next
  void load()
}

function open(id: string): void {
  void navigateTo(`/canvas?id=${encodeURIComponent(id)}`)
}

function startRename(row: Row): void {
  editingId.value = row.id
  draft.value = row.title
}

async function commitRename(row: Row): Promise<void> {
  const title = draft.value.trim()
  editingId.value = ''
  if (!title || title === row.title) return
  busy.value = true
  try {
    await canvasApi.renameGraph(row.id, title)
    row.title = title
  } catch (e) {
    error.value = e instanceof Error ? e.message : '改名失败'
  } finally {
    busy.value = false
  }
}

/** 复制一份：新图从零再跑一遍（产物引用由服务端清掉）。 */
async function duplicate(row: Row): Promise<void> {
  busy.value = true
  try {
    const { graph } = await canvasApi.duplicateGraph(row.id)
    await load()
    if (graph?.id) void navigateTo(`/canvas?id=${encodeURIComponent(String(graph.id))}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '复制失败'
  } finally {
    busy.value = false
  }
}

async function remove(row: Row): Promise<void> {
  // 软删：说清"产物还在"，否则用户会以为作品没了（服务端确实只软删图）。
  if (!window.confirm(`删除「${row.title}」？\n\n图会从列表里消失，但它的产物（图片/视频）与对话记录都会留着。`)) return
  busy.value = true
  try {
    await canvasApi.deleteGraph(row.id)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    busy.value = false
  }
}

/** 相对时间：列表里"3 分钟前"比一串时间戳好读。 */
function ago(ts: number): string {
  if (!ts) return ''
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
  return new Date(ts * 1000).toLocaleDateString()
}

onMounted(() => { void load() })
</script>

<template>
  <div class="cl-page">
    <header class="cl-head">
      <div>
        <h1>我的画布</h1>
        <p class="cl-sub">
          你建过的每一张图都在这里（最近更新的在前）。共 {{ total }} 张。
        </p>
      </div>
      <div class="cl-actions">
        <input
          v-model="keyword"
          class="cl-input"
          type="search"
          placeholder="搜标题，或粘一个画布 id…"
          @keyup.enter="search"
        >
        <select
          v-model="ownerFilter"
          class="cl-input"
          @change="search"
        >
          <option
            v-for="o in OWNER_OPTIONS"
            :key="o.value"
            :value="o.value"
          >
            {{ o.label }}
          </option>
        </select>
        <select
          v-model="sort"
          class="cl-input"
          @change="search"
        >
          <option value="updated">
            最近更新
          </option>
          <option value="created">
            最近创建
          </option>
        </select>
        <button
          type="button"
          class="cl-btn"
          @click="search"
        >
          搜索
        </button>
        <button
          type="button"
          class="cl-btn is-primary"
          @click="navigateTo('/canvas')"
        >
          新建画布
        </button>
      </div>
    </header>

    <p
      v-if="error"
      class="cl-error"
    >
      {{ error }}
    </p>

    <p
      v-if="loading"
      class="cl-muted"
    >
      加载中…
    </p>

    <p
      v-else-if="!rows.length"
      class="cl-muted"
    >
      {{ keywordApplied ? `没有标题含「${keywordApplied}」的画布（粘 id 也可以搜）` : '还没有画布，点「新建画布」开始' }}
    </p>

    <ul
      v-else
      class="cl-list"
    >
      <li
        v-for="row in rows"
        :key="row.id"
        class="cl-row"
      >
        <div class="cl-main">
          <input
            v-if="editingId === row.id"
            v-model="draft"
            class="cl-input is-inline"
            maxlength="60"
            @keyup.enter="commitRename(row)"
            @keyup.esc="editingId = ''"
            @blur="commitRename(row)"
          >
          <button
            v-else
            type="button"
            class="cl-title"
            :title="'打开这张画布'"
            @click="open(row.id)"
          >
            {{ row.title }}
          </button>
          <span class="cl-meta">
            {{ ago(row.updatedAt) }} · {{ row.nodeCount }} 个节点<template v-if="row.ownerType">
              · 挂在{{ row.ownerType === 'episode' ? '某一集' : '某个项目' }}
            </template>
          </span>
        </div>
        <div class="cl-row-actions">
          <button
            type="button"
            class="cl-btn"
            @click="open(row.id)"
          >
            打开
          </button>
          <button
            type="button"
            class="cl-btn"
            :disabled="busy"
            @click="duplicate(row)"
          >
            复制
          </button>
          <button
            type="button"
            class="cl-btn"
            :disabled="busy"
            @click="startRename(row)"
          >
            改名
          </button>
          <button
            type="button"
            class="cl-btn is-danger"
            :disabled="busy"
            @click="remove(row)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>

    <footer
      v-if="pageCount > 1"
      class="cl-pager"
    >
      <button
        type="button"
        class="cl-btn"
        :disabled="page <= 1"
        @click="goPage(-1)"
      >
        上一页
      </button>
      <span class="cl-muted">第 {{ page }} / {{ pageCount }} 页</span>
      <button
        type="button"
        class="cl-btn"
        :disabled="page >= pageCount"
        @click="goPage(1)"
      >
        下一页
      </button>
    </footer>
  </div>
</template>

<style scoped>
.cl-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 28px 18px 60px;
}

.cl-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
}

.cl-head h1 {
  margin: 0;
  font-size: 22px;
}

.cl-sub {
  margin: 6px 0 0;
  opacity: 0.65;
  font-size: 13px;
}

.cl-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.cl-input {
  padding: 7px 10px;
  border: 1px solid #333;
  border-radius: 8px;
  color: inherit;
  font: inherit;
  background: rgb(255 255 255 / 4%);
}

.cl-input.is-inline {
  min-width: 260px;
}

.cl-btn {
  padding: 7px 12px;
  border: 1px solid #333;
  border-radius: 8px;
  color: inherit;
  font: inherit;
  cursor: pointer;
  background: rgb(255 255 255 / 4%);
}

.cl-btn:hover:not(:disabled) {
  background: rgb(255 255 255 / 10%);
}

.cl-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cl-btn.is-primary {
  border-color: transparent;
  background: #2f6fed;
}

.cl-btn.is-danger:hover:not(:disabled) {
  border-color: rgb(255 120 120 / 45%);
  color: #ff9c9c;
}

.cl-error {
  margin: 14px 0 0;
  color: #ff9c9c;
}

.cl-muted {
  opacity: 0.6;
}

.cl-list {
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.cl-row {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
  border-bottom: 1px solid #282828;
}

.cl-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cl-title {
  padding: 0;
  border: 0;
  color: inherit;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  background: transparent;
}

.cl-title:hover {
  color: #7cc4ff;
}

.cl-meta {
  opacity: 0.6;
  font-size: 12px;
}

.cl-row-actions {
  display: flex;
  flex: none;
  gap: 6px;
}

.cl-pager {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
}
</style>
