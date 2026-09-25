<script setup lang="ts">
import type { StudioMessage } from '~/composables/useChatStudio'
import { safeHref } from '~/composables/useSafeUrl'

// 任务卡：状态、任务 ID、等待时长、进度、产物与操作。
// 约束（交接文档第 4 节 / 第 6 条修正）：
// - 排队中／生成中不出现可播放按钮，只有已完成且有真实地址的视频才渲染播放器；
// - 取消按执行器真实返回，不在 UI 上直接标记已取消；
// - 重试是**新建任务并重新计费**，文案必须写明。
const props = defineProps<{ message: StudioMessage }>()
const studio = useChatStudio()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const isRunning = computed(() => !!props.message.status && ['creating', 'queued', 'running', 'reconciling'].includes(props.message.status))
const elapsed = computed(() => {
  const ms = Math.max(0, now.value - props.message.time)
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
})

onMounted(() => {
  timer = setInterval(() => {
    if (isRunning.value) now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const assets = computed(() => props.message.assets ?? [])

/**
 * 当前正在右侧面板预览的产物下标（不在预览 / 不是本卡片时为 -1）。
 * 用途：给对应缩略图描边，让"哪张正在右侧看"一目了然（也方便关掉面板后再找回来）。
 */
const activeIndex = computed(() => {
  if (!studio.previewOpen.value) return -1
  if (studio.previewMessage.value?.id !== props.message.id) return -1
  return studio.previewIndex.value
})

/** 点缩略图 = 在右侧面板打开大图（用户预期：图能点，不是只有小图标能点）。 */
function openAsset(index: number) {
  studio.openPreview(props.message.id, index)
}
const kindLabel = computed(() => {
  const meta = props.message.meta
  // 用了工具就报工具名：用户点的是"高清放大"，卡片上写"图片生成"等于不承认这件事
  if (meta?.toolName) return meta.templateName ? `${meta.toolName} · ${meta.templateName}` : meta.toolName
  return meta?.mode === 'video' ? '视频生成' : '图片生成'
})
const paramsLine = computed(() => {
  const meta = props.message.meta
  if (!meta) return ''
  return [
    meta.modelName,
    meta.ratio,
    meta.mode === 'video' && meta.seconds ? `${meta.seconds} 秒` : '',
    meta.count > 1 ? `${meta.count} 张` : ''
  ].filter(Boolean).join(' · ')
})

const STATUS_CLASS: Record<string, string> = {
  creating: 'pending',
  queued: 'pending',
  running: 'running',
  reconciling: 'running',
  succeeded: 'ok',
  failed: 'bad',
  cancelled: 'muted'
}

function download(assetId: string) {
  void (async () => {
    try {
      const res = await useHougongApi().assetDownloadUrl(assetId)
      const target = safeHref(res.url)
      if (target) window.open(target, '_blank', 'noopener')
    } catch {
      studio.notice.value = '下载地址获取失败'
    }
  })()
}

/**
 * 「保存到我的资产」状态（按产物 id 记），语义与 HgAssetPanel 保持一致：
 *   · savedIds  —— 已永久（后端返回 permanent，或本次保存成功）；**只置 true 不置 false**；
 *   · savingIds —— 正在保存（按钮显示"保存中…"）。
 * 判定"已保存"**只认 scope === 'permanent'**：scope 可能缺省（老数据/接口未下发），
 * 缺省一律当作**未保存**，否则用户会以为临时产物已经进了资产库。
 */
const savedIds = ref<Record<string, boolean>>({})
const savingIds = ref<Record<string, boolean>>({})

watch(assets, (list) => {
  for (const asset of list) {
    if (asset.scope === 'permanent' && !savedIds.value[asset.id]) {
      savedIds.value = { ...savedIds.value, [asset.id]: true }
    }
  }
}, { immediate: true })

/** 任务成功且确有产物时才提供「保存到我的资产」入口（排队中/失败/无产物不显示）。 */
const canSave = computed(() => props.message.status === 'succeeded' && assets.value.length > 0)
/** 本任务全部产物是否都已保存（全部已保存则按钮置灰）。 */
const allSaved = computed(() => assets.value.length > 0 && assets.value.every(a => savedIds.value[a.id]))
/** 是否有产物正在保存。 */
const saving = computed(() => assets.value.some(a => savingIds.value[a.id]))
const saveLabel = computed(() =>
  saving.value ? '保存中…' : (allSaved.value ? '已保存到我的资产' : '保存到我的资产')
)

/**
 * 保存本任务的**全部**产物到「我的资产」。
 *
 * 逐个调用 saveAsset（幂等，只改服务端 scope），**不重新上传、不重新生成**；
 * 失败的产物保留临时态并提示，用户再点一次只会重试未保存的那些。
 * 成功后把 scope 回写到 message.assets 上的同一个对象，右侧预览面板（读同一份 assets）
 * 的「已保存」态会跟着同步。
 */
async function saveAssets() {
  const todo = assets.value.filter(a => !savedIds.value[a.id] && !savingIds.value[a.id])
  if (!todo.length) return
  const api = useHougongApi()
  let failed = 0
  for (const asset of todo) {
    savingIds.value = { ...savingIds.value, [asset.id]: true }
    try {
      const saved = await api.saveAsset(String(asset.id))
      // 接口成功即已置 permanent；返回里带 scope 时以它为准
      asset.scope = saved?.scope ?? 'permanent'
      savedIds.value = { ...savedIds.value, [asset.id]: asset.scope !== 'temp' }
    } catch {
      failed += 1
    } finally {
      const next = { ...savingIds.value }
      delete next[asset.id]
      savingIds.value = next
    }
  }
  studio.notice.value = failed
    ? `有 ${failed} 个产物保存失败，可再点一次重试`
    : '已保存到我的资产'
}
</script>

<template>
  <article
    class="task-card"
    :aria-label="`${kindLabel}任务`"
  >
    <header>
      <span class="task-kind">
        <UIcon
          :name="message.meta?.mode === 'video' ? 'i-lucide-clapperboard' : 'i-lucide-image'"
          aria-hidden="true"
        />{{ kindLabel }}
      </span>
      <span
        v-if="paramsLine"
        class="task-params"
      >{{ paramsLine }}</span>
    </header>

    <p
      v-if="message.taskId"
      class="task-id"
    >
      任务 ID：{{ message.taskId }}
    </p>

    <div class="task-state">
      <span
        class="status-badge"
        :class="STATUS_CLASS[message.status || 'queued']"
      >{{ studio.statusLabel(message.status) }}</span>
      <span
        v-if="isRunning"
        class="task-wait"
      >已等 {{ elapsed }}</span>
      <span
        v-if="message.progress"
        class="task-wait"
      >{{ message.progress }}%</span>
    </div>

    <div
      v-if="isRunning"
      class="task-progress"
      role="progressbar"
      :aria-valuenow="message.progress || 0"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <i :style="{ width: `${Math.max(4, message.progress || 0)}%` }" />
    </div>

    <p
      v-if="message.error"
      class="task-error"
    >
      {{ message.error }}
    </p>

    <!-- 多结果属于同一任务组，每张都能独立预览与下载 -->
    <div
      v-if="assets.length"
      class="task-results"
      :class="{ single: assets.length === 1 }"
    >
      <figure
        v-for="(asset, index) in assets"
        :key="asset.id"
        :class="{ active: activeIndex === index }"
      >
        <!-- 图片本身可点开大图；视频要留给原生控件，不能整块包进 button -->
        <button
          v-if="asset.kind === 'image'"
          type="button"
          class="result-open"
          :aria-label="`查看第 ${index + 1} 个产物`"
          title="点击在右侧查看大图"
          @click="openAsset(index)"
        >
          <img
            :src="asset.url"
            alt=""
            loading="lazy"
          >
        </button>
        <video
          v-else
          :src="asset.url"
          controls
          playsinline
          preload="metadata"
        />
        <div class="result-actions">
          <button
            type="button"
            :aria-label="`预览第 ${index + 1} 个产物`"
            @click="studio.openPreview(message.id, index)"
          >
            <UIcon name="i-lucide-maximize-2" />
          </button>
          <button
            type="button"
            :aria-label="`下载第 ${index + 1} 个产物`"
            @click="download(asset.id)"
          >
            <UIcon name="i-lucide-download" />
          </button>
        </div>
      </figure>
      <p
        v-if="assets.length > 1"
        class="result-count"
      >
        共 {{ assets.length }} 个产物
      </p>
    </div>

    <footer class="task-actions">
      <button
        v-if="assets.length"
        type="button"
        @click="studio.openPreview(message.id, 0)"
      >
        <UIcon
          name="i-lucide-eye"
          aria-hidden="true"
        />查看产物
      </button>
      <button
        v-if="canSave"
        type="button"
        class="save"
        :class="{ saved: allSaved }"
        :disabled="saving || allSaved"
        :aria-busy="saving"
        @click="saveAssets"
      >
        <UIcon
          :name="allSaved ? 'i-lucide-check' : (saving ? 'i-lucide-loader-circle' : 'i-lucide-bookmark-plus')"
          aria-hidden="true"
          :class="{ spin: saving }"
        />{{ saveLabel }}
      </button>
      <button
        v-if="isRunning && message.taskId"
        type="button"
        @click="studio.cancel(message)"
      >
        <UIcon
          name="i-lucide-circle-slash"
          aria-hidden="true"
        />取消
      </button>
      <button
        v-if="message.status === 'failed' || message.status === 'cancelled'"
        type="button"
        @click="studio.retry(message)"
      >
        <UIcon
          name="i-lucide-rotate-ccw"
          aria-hidden="true"
        />重试（新建任务并重新计费）
      </button>
    </footer>
  </article>
</template>

<style scoped>
.task-card {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--hg3-line);
  border-radius: 14px;
  background: var(--hg3-card);
}
.task-card header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.task-kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.task-params,
.task-id,
.task-wait {
  color: var(--hg3-muted);
  font-size: 12px;
}
.task-state {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.status-badge {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
}
.status-badge.pending {
  background: rgb(255 180 84 / 16%);
  color: var(--hg3-warn);
}
.status-badge.running {
  background: rgb(101 198 251 / 16%);
  color: var(--hg3-run);
}
.status-badge.ok {
  background: rgb(46 223 154 / 16%);
  color: var(--hg3-ok);
}
.status-badge.bad {
  background: rgb(255 112 122 / 16%);
  color: var(--hg3-i-coral);
}
.status-badge.muted {
  background: #282828;
  color: var(--hg3-muted);
}
.task-progress {
  height: 4px;
  border-radius: 999px;
  background: #282828;
  overflow: hidden;
}
.task-progress i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--hg3-accent), var(--hg3-accent-hi));
  transition: width 400ms ease;
}
.task-error {
  margin: 0;
  color: var(--hg3-i-coral);
  font-size: 12px;
}
.task-results {
  display: grid;
  /* 一行最多 4 张，超过折行。auto-fit + 容器限宽：张数少时每张自动变宽（2 张各占一半），
     不会像写死 repeat(4,1fr) 那样把 2 张图缩进两个 1/4 格里。
     4 × 150 + 3 × 8 = 624，取 640 保证宽屏最多 4 列。 */
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  max-width: 640px;
  margin-top: 2px;
}
.task-results.single {
  grid-template-columns: minmax(0, 1fr);
}
.task-results figure {
  position: relative;
  margin: 0;
  border-radius: 10px;
  overflow: hidden;
  background: #0d0d0d;
}
/* 正在右侧预览的那一张：描边，方便关掉面板后一眼找回 */
.task-results figure.active {
  outline: 2px solid var(--hg3-accent);
  outline-offset: -2px;
}
/* 缩略图点击区：整张图都是热区，光标示意可放大 */
.result-open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}
/* 产物按原始比例等比缩放：不裁切、不拉伸（交接文档：完整预览不裁主体） */
.task-results img,
.task-results video {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: 320px;
  margin: 0 auto;
  object-fit: contain;
}
.result-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
}
.result-actions button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: rgb(10 11 13 / 68%);
  color: #fff;
  cursor: pointer;
}
.result-count {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--hg3-faint);
  font-size: 11px;
}
.task-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.task-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.task-actions button:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
/* 已保存：粉色描边 + 对勾，和未保存态一眼可分 */
.task-actions button.save.saved {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
/* 已保存/保存中的按钮不可点：保留原色、去掉 hover 高亮与手型 */
.task-actions button:disabled {
  cursor: default;
  opacity: 0.65;
}
.task-actions button:disabled:hover {
  border-color: var(--hg3-line-strong);
  color: var(--hg3-ink);
}
.task-actions button.save.saved:disabled:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
.spin {
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
