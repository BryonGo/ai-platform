<script setup lang="ts">
import { safeHref } from '~/composables/useSafeUrl'
import { referenceLimitReason } from '~/data/reference-limit'
// 右侧产物面板：按需展开，可切换同组多产物，并提供产物级操作。
// 约束：完整预览保留原始宽高比（不裁切、不拉伸）；未完成的产物不渲染播放器；
// 尚未接通的入口显式说明，不假装可用。
//
// 布局（2026-09-14 实测后改）：面板**浮在页面上层**，不再作为 flex 兄弟节点占宽。
// 原实现是 `width:320px; flex-shrink:0` 的兄弟节点，打开时中间聊天列从 905px
// 被压到 571px（输入器工具栏跟着换行），用户读到的是「聊天框被挤变形」。
// 现在改为固定定位的右侧抽屉 + 半透明遮罩：聊天区一行都不重排，点空白或 Esc 关闭。
const studio = useChatStudio()

const message = computed(() => studio.previewMessage.value)
const assets = computed(() => studio.previewAssets.value)
const current = computed(() => studio.previewAsset.value)
const infoOpen = ref(false)

/**
 * 「保存到我的资产」状态（按产物 id 记）。
 *
 * 产物默认是临时的（scope=temp）；这里只记「已保存」与「保存中」两态：
 *   · savedIds  —— 已永久（后端返回 permanent，或本次保存成功）；
 *   · savingIds —— 正在保存（按钮显示"保存中…"）。
 * 刷新/切会话后由 resolveAssets 带回的 scope 重建 savedIds，所以「已保存」态不丢。
 */
const savedIds = ref<Record<string, boolean>>({})
const savingIds = ref<Record<string, boolean>>({})

// 产物解析回来时带上 scope：permanent 即已保存。
// **只置 true、不置 false** —— 接口没下发 scope（老数据）时不能把已保存态覆盖掉。
watch(assets, (list) => {
  for (const asset of list) {
    if (asset.scope === 'permanent' && !savedIds.value[asset.id]) {
      savedIds.value = { ...savedIds.value, [asset.id]: true }
    }
  }
}, { immediate: true })

/** 当前预览任务的全部产物是否都已保存（全部已保存则按钮置灰）。 */
const allSaved = computed(() => assets.value.length > 0 && assets.value.every(a => savedIds.value[a.id]))
/** 是否有产物正在保存。 */
const saving = computed(() => assets.value.some(a => savingIds.value[a.id]))
const saveLabel = computed(() =>
  saving.value ? '保存中…' : (allSaved.value ? '已保存到我的资产' : '保存到我的资产')
)

/**
 * 保存当前预览任务的**全部**产物到「我的资产」。
 *
 * 逐个调用 saveAsset（幂等，只改服务端 scope），**不重新上传、不重新生成**；
 * 失败的产物保留临时态并提示，用户再点一次只会重试未保存的那些。
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

function close() {
  studio.previewOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function download() {
  const asset = current.value
  if (!asset) return
  void (async () => {
    try {
      const res = await useHougongApi().assetDownloadUrl(asset.id)
      const target = safeHref(res.url)
      if (target) window.open(target, '_blank', 'noopener')
    } catch {
      studio.notice.value = '下载地址获取失败'
    }
  })()
}

/**
 * 继续修改：把当前产物设为引用对象，留在图片模式。
 *
 * 底模不吃参考图时**不能**说"已把该产物设为参考图"就完事：那张图会被发送前的超限校验拦住，
 * 用户照提示写完「脱掉他的衣服」，看到的却是灰掉的发送按钮（2026-09-25 实测就卡在这里）。
 * 这种情况**不设引用** —— 设了反而让"删掉参考图"变成继续发送的前提，比不设更卡 ——
 * 直接把该换模型、该用工具说清楚。
 */
function continueEdit() {
  if (!current.value) return
  studio.mode.value = 'image'
  if (!studio.referenceAllowed.value) {
    studio.notice.value = referenceLimitReason({
      max: studio.referenceMax.value,
      modelName: studio.selectedModel.value?.name,
      cloud: studio.selectedModel.value?.channel === 'cloud'
    })
    return
  }
  studio.setReferenceFromAsset(current.value)
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
  <!-- 遮罩层：点空白处关闭（图层自身不参与聊天区布局，聊天区因此完全不被挤压） -->
  <div
    class="panel-layer"
    role="dialog"
    aria-modal="true"
    aria-label="产物预览"
    @click.self="close"
  >
    <aside class="asset-panel">
      <header>
        <strong>预览 {{ assets.length ? studio.previewIndex.value + 1 : 0 }}/{{ assets.length }}</strong>
        <div class="panel-tools">
          <button
            type="button"
            aria-label="关闭预览面板"
            @click="close"
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
          v-if="current"
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
  </div>
</template>

<style scoped>
/* 固定定位的整屏图层：脱离 flex 流，因此打开面板不会让聊天列重排 */
.panel-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  background: rgb(6 7 9 / 58%);
}
.asset-panel {
  display: flex;
  flex-direction: column;
  width: min(420px, 92vw);
  height: 100%;
  padding: 14px;
  border-left: 1px solid var(--hg3-line);
  background: #141519;
  box-shadow: -18px 0 44px rgb(0 0 0 / 46%);
  min-height: 0;
  overflow-y: auto;
  animation: panel-in 180ms ease;
}
@keyframes panel-in {
  from { transform: translateX(22px); opacity: 0.5; }
  to { transform: none; opacity: 1; }
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
  background: #282828;
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
.panel-actions button.save.saved {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
/* 已保存/保存中的按钮不可点：保留原色、去掉 hover 高亮与手型 */
.panel-actions button:disabled {
  cursor: default;
  opacity: 0.65;
}
.panel-actions button:disabled:hover {
  border-color: var(--hg3-line-strong);
  color: var(--hg3-ink);
}
.panel-actions button.save.saved:disabled:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
.spin {
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
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
