<script setup lang="ts">
import type { StudioMessage } from '~/composables/useChatStudio'

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
const kindLabel = computed(() => props.message.meta?.mode === 'video' ? '视频生成' : '图片生成')
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
      window.open(res.url, '_blank', 'noopener')
    } catch {
      studio.notice.value = '下载地址获取失败'
    }
  })()
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
      >
        <img
          v-if="asset.kind === 'image'"
          :src="asset.url"
          alt=""
          loading="lazy"
        >
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
  background: rgb(255 255 255 / 8%);
  color: var(--hg3-muted);
}
.task-progress {
  height: 4px;
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
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
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
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
  background: #101114;
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
</style>
