<script setup lang="ts">
const api = useHougongApi()
const session = useAuthSession()

const items = ref<AssetItem[]>([])
const loading = ref(true)
const error = ref('')
const showHidden = ref(false)
const busy = ref('')

// ── 导出（工程包）──
// 选中若干资产 → POST /platform/export 打成 ZIP（**异步**）→ 轮询到 succeeded 取 downloadUrl。
const picked = ref<string[]>([])
const exporting = ref(false)
const exportTask = ref<ExportTask | null>(null)
const exportError = ref('')

function togglePick(id: string) {
  const i = picked.value.indexOf(id)
  if (i >= 0) picked.value.splice(i, 1)
  else picked.value.push(id)
}

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
    if (exportTask.value?.status === 'succeeded') picked.value = []
  } catch (e: unknown) {
    exportError.value = e instanceof Error ? e.message : '导出失败'
  } finally {
    exporting.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const list = await api.listAssets(showHidden.value, 1, 100)
    items.value = list
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleHidden(a: AssetItem) {
  busy.value = a.id
  try {
    await api.setAssetHidden(a.id, !a.hidden)
    await load()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    busy.value = ''
  }
}

async function remove(a: AssetItem) {
  if (!window.confirm('删除该素材？删除后引用它的作品可能失效。')) return
  busy.value = a.id
  try {
    await api.removeAsset(a.id)
    await load()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    busy.value = ''
  }
}

// download 取原图下载地址（后端签发限时 URL）后直接打开。
// 与列表里的 a.url 区别：列表 url 是展示用的（可能已转码/压缩），这里是原图。
const downloading = ref('')

async function download(a: AssetItem) {
  downloading.value = a.id
  error.value = ''
  try {
    const { url } = await api.assetDownloadUrl(a.id)
    if (!url) {
      error.value = '后端未返回下载地址'
      return
    }
    window.open(url, '_blank', 'noopener')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '获取下载地址失败'
  } finally {
    downloading.value = ''
  }
}

function originLabel(o: string) {
  return o === 'generated' ? '生成' : '上传'
}

function sizeText(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
}

onMounted(() => {
  session.load()
  if (!session.token.value) {
    navigateTo('/auth/login')
    return
  }
  load()
})
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          素材库
        </p>
        <h1>我的素材</h1>
        <p>上传的参考图与生成产物都在这里；隐藏后可避免出现在创作台素材选择器中。</p>
      </div>
      <div class="asset-actions">
        <button
          type="button"
          class="btn-primary"
          :disabled="!picked.length || exporting"
          @click="runExport"
        >
          {{ exporting ? '导出中…' : `导出选中（${picked.length}）` }}
        </button>
        <button
          v-if="picked.length"
          type="button"
          class="btn-ghost"
          :disabled="exporting"
          @click="picked = []"
        >
          清空选择
        </button>
        <button
          type="button"
          class="btn-ghost"
          @click="showHidden = !showHidden; load()"
        >
          {{ showHidden ? '查看可用素材' : '查看已隐藏' }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="empty-tip"
    >
      加载失败：{{ error }}
    </p>

    <!-- 导出状态：异步任务，成功给下载链接，失败/部分失败必须显示原因 -->
    <div
      v-if="exportError"
      class="empty-tip"
    >
      导出失败：{{ exportError }}
    </div>
    <div
      v-if="exportTask"
      class="export-panel"
    >
      <span>
        工程包：<code>{{ exportTask.status }}</code>
        （{{ exportTask.done }}/{{ exportTask.total }}，失败 {{ exportTask.failed }}）
      </span>
      <a
        v-if="exportTask.status === 'succeeded' && exportTask.downloadUrl"
        :href="exportTask.downloadUrl"
        class="btn-primary"
        download
      >下载 ZIP</a>
      <span
        v-else-if="exportTask.status === 'failed'"
        class="muted"
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

    <div class="asset-grid">
      <div
        v-for="a in items"
        :key="a.id"
        class="asset-cell"
        :class="{ dim: a.hidden, picked: picked.includes(a.id) }"
      >
        <button
          type="button"
          class="asset-pick"
          :aria-pressed="picked.includes(a.id)"
          :title="picked.includes(a.id) ? '取消选择' : '选择以导出'"
          @click="togglePick(a.id)"
        >
          <span
            class="asset-pick-box"
            aria-hidden="true"
          >{{ picked.includes(a.id) ? '✓' : '' }}</span>
        </button>
        <img
          :src="a.url"
          :alt="a.id"
          loading="lazy"
        >
        <div class="asset-cell-meta">
          <span>{{ originLabel(a.origin) }} · {{ a.width }}×{{ a.height }}</span>
          <small class="muted">{{ sizeText(a.bytes) }} · {{ new Date(a.createdAt * 1000).toLocaleDateString() }}</small>
        </div>
        <div class="asset-cell-actions">
          <button
            type="button"
            class="composer2-btn-sm"
            :disabled="downloading === a.id"
            @click="download(a)"
          >
            {{ downloading === a.id ? '获取中…' : '下载原图' }}
          </button>
          <button
            type="button"
            class="composer2-btn-sm"
            :disabled="busy === a.id"
            @click="toggleHidden(a)"
          >
            {{ a.hidden ? '取消隐藏' : '隐藏' }}
          </button>
          <button
            type="button"
            class="composer2-btn-sm danger"
            :disabled="busy === a.id"
            @click="remove(a)"
          >
            删除
          </button>
        </div>
      </div>
    </div>
    <p
      v-if="!loading && !items.length"
      class="empty-tip"
    >
      {{ showHidden ? '没有已隐藏的素材' : '还没有素材。去创作页上传参考图或生成作品吧。' }}
    </p>
    <p
      v-if="loading"
      class="empty-tip"
    >
      加载中…
    </p>
  </div>
</template>

<style scoped>
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.9rem;
  margin-top: 1rem;
}
.asset-cell {
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 1rem;
  overflow: hidden;
  background: var(--hg-card);
  display: grid;
  gap: 0;
}
.asset-cell.dim {
  opacity: 0.65;
}
.asset-cell.picked {
  outline: 2px solid var(--hg-accent, #b08a4f);
  outline-offset: -2px;
}
.asset-pick {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  z-index: 1;
  width: 1.5rem;
  height: 1.5rem;
  display: grid;
  place-items: center;
  border-radius: 0.4rem;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.asset-cell {
  position: relative;
}
.asset-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.export-panel {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.8rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 0.8rem;
  font-size: 0.82rem;
}
.export-failures {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.76rem;
  color: #b91c1c;
}
.muted {
  color: var(--hg-muted, #666);
}
.asset-cell img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
.asset-cell-meta {
  display: grid;
  gap: 0.1rem;
  padding: 0.5rem 0.6rem 0.2rem;
  font-size: 0.76rem;
  color: var(--ink);
  font-weight: 600;
}
.asset-cell-meta small {
  font-weight: 400;
}
.asset-cell-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.3rem;
  padding: 0.4rem 0.6rem 0.6rem;
}
.composer2-btn-sm {
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--hg-line, #e2e4ea);
  background: transparent;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  color: var(--hg-muted, #666);
}
.composer2-btn-sm:hover {
  border-color: var(--hg-accent, #b08a4f);
  color: var(--hg-accent, #b08a4f);
}
.composer2-btn-sm:disabled {
  opacity: 0.5;
  cursor: default;
}
.danger {
  color: #b91c1c;
}
.danger:hover {
  border-color: #b91c1c;
  color: #b91c1c;
}
</style>
