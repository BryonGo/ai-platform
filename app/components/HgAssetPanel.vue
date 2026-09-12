<script setup lang="ts">
// 右侧产物面板：按需展开，可切换同组多产物，并提供产物级操作。
// 约束：完整预览保留原始宽高比（不裁切、不拉伸）；未完成的产物不渲染播放器；
// 尚未接通的入口显式说明，不假装可用。
const studio = useChatStudio()

const message = computed(() => studio.previewMessage.value)
const assets = computed(() => studio.previewAssets.value)
const current = computed(() => studio.previewAsset.value)
const infoOpen = ref(false)

function download() {
  const asset = current.value
  if (!asset) return
  void (async () => {
    try {
      const res = await useHougongApi().assetDownloadUrl(asset.id)
      window.open(res.url, '_blank', 'noopener')
    } catch {
      studio.notice.value = '下载地址获取失败'
    }
  })()
}

/** 继续修改：把当前产物设为引用对象，留在图片模式 */
function continueEdit() {
  if (!current.value) return
  studio.setReferenceFromAsset(current.value)
  studio.mode.value = 'image'
  studio.notice.value = '已把该产物设为参考图，接着描述要改的地方即可。'
}

/** 生成视频：切到视频模式并把当前产物作为首帧 */
function toVideo() {
  if (!current.value) return
  studio.setReferenceFromAsset(current.value)
  studio.mode.value = 'video'
  studio.notice.value = '已把该产物设为视频首帧，确认时长与模型后发送。'
}
</script>

<template>
  <aside
    class="asset-panel"
    aria-label="产物预览"
  >
    <header>
      <strong>预览 {{ assets.length ? studio.previewIndex.value + 1 : 0 }}/{{ assets.length }}</strong>
      <div class="panel-tools">
        <button
          type="button"
          aria-label="关闭预览面板"
          @click="studio.previewOpen.value = false"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </div>
    </header>

    <div class="stage">
      <template v-if="current">
        <img
          v-if="current.kind === 'image'"
          :src="current.url"
          alt=""
        >
        <video
          v-else
          :src="current.url"
          controls
          playsinline
          preload="metadata"
        />
      </template>
      <p
        v-else
        class="stage-empty"
      >
        这个任务还没有可预览的产物。
      </p>
    </div>

    <div
      v-if="assets.length > 1"
      class="thumbs"
      role="tablist"
      aria-label="同组产物"
    >
      <button
        v-for="(asset, index) in assets"
        :key="asset.id"
        type="button"
        role="tab"
        :aria-selected="index === studio.previewIndex.value"
        :class="{ active: index === studio.previewIndex.value }"
        @click="studio.previewIndex.value = index"
      >
        <img
          :src="asset.url"
          alt=""
          loading="lazy"
        >
      </button>
    </div>

    <div class="panel-actions">
      <button
        type="button"
        @click="continueEdit"
      >
        <UIcon
          name="i-lucide-wand-sparkles"
          aria-hidden="true"
        />继续修改
      </button>
      <button
        type="button"
        @click="toVideo"
      >
        <UIcon
          name="i-lucide-clapperboard"
          aria-hidden="true"
        />生成视频
      </button>
      <button
        type="button"
        @click="download"
      >
        <UIcon
          name="i-lucide-download"
          aria-hidden="true"
        />下载
      </button>
      <button
        type="button"
        :aria-expanded="infoOpen"
        @click="infoOpen = !infoOpen"
      >
        <UIcon
          name="i-lucide-info"
          aria-hidden="true"
        />生成信息
      </button>
      <button
        type="button"
        class="muted"
        title="工具入口尚未接入本轮范围"
        @click="studio.notice.value = '「使用工具」尚未接入，本轮只做生成主链路。'"
      >
        <UIcon
          name="i-lucide-layout-grid"
          aria-hidden="true"
        />使用工具
      </button>
    </div>

    <dl
      v-if="infoOpen && message?.meta"
      class="panel-info"
    >
      <div>
        <dt>提示词</dt>
        <dd>{{ message.meta.prompt || '—' }}</dd>
      </div>
      <div>
        <dt>模型</dt>
        <dd>{{ message.meta.modelName || '后端默认' }}</dd>
      </div>
      <div>
        <dt>参数</dt>
        <dd>{{ [message.meta.ratio, message.meta.mode === 'video' ? `${message.meta.seconds} 秒` : '', message.meta.count > 1 ? `${message.meta.count} 张` : ''].filter(Boolean).join(' · ') || '—' }}</dd>
      </div>
      <div>
        <dt>任务</dt>
        <dd>{{ message.taskId || '—' }}</dd>
      </div>
    </dl>
  </aside>
</template>

<style scoped>
.asset-panel {
  display: flex;
  flex-direction: column;
  width: 320px;
  flex-shrink: 0;
  padding: 14px;
  border-left: 1px solid var(--hg3-line);
  background: #141519;
  min-height: 0;
  overflow-y: auto;
}
.asset-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.asset-panel header strong {
  font-size: 13px;
  font-weight: 600;
}
.panel-tools button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted);
  cursor: pointer;
}
.panel-tools button:hover {
  background: rgb(255 255 255 / 8%);
  color: var(--hg3-ink);
}
.stage {
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #0b0c0e;
  overflow: hidden;
}
.stage img,
.stage video {
  display: block;
  width: 100%;
  max-height: 46vh;
  object-fit: contain;
}
.stage-empty {
  padding: 36px 16px;
  color: var(--hg3-faint);
  font-size: 12px;
  text-align: center;
}
.thumbs {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  overflow-x: auto;
}
.thumbs button {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  overflow: hidden;
  cursor: pointer;
}
.thumbs button.active {
  border-color: var(--hg3-accent);
}
.thumbs img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.panel-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.panel-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 9px;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.panel-actions button:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
.panel-actions button.muted {
  color: var(--hg3-faint);
}
.panel-info {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--hg3-line);
}
.panel-info div {
  display: grid;
  gap: 3px;
}
.panel-info dt {
  color: var(--hg3-faint);
  font-size: 11px;
}
.panel-info dd {
  margin: 0;
  color: var(--hg3-muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
</style>
