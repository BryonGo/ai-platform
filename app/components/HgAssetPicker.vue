<script setup lang="ts">
import type { AssetItem } from '~/composables/useHougongApi'
import type { StudioAsset } from '~/composables/useChatStudio'
// 「从我的资产选择」浮层：输入框左侧「+」的第二入口，直接引用已有 assetId。
//
// 为什么必须走资产库、不能拿本地 blob 冒充（2026-09 用户要求）：
//   · 资产库里的图是**已经上传过**的，选中即沿用它的 assetId —— 再传一次是重复上传；
//   · 用本地 URL.createObjectURL 造一个预览，提交时拿不到 assetId，等于把"选资产"
//     伪装成"又选了一次本地文件"，用户以为复用了素材，实际还是重传。
// 所以这里只列出「我的资产」（后端 scope 默认 permanent、hidden=false），点选即回传真实
// 的 {id,url,name}，交给 studio.addReferenceFromAsset 直接引用。
//
// 只收 image/jpeg|png|webp：与输入框「+」的 accept 口径一致，也和后端媒体白名单对齐。
// 视频模型第 1 张是首帧的语义不在这里实现 —— 引用顺序由 studio.references 决定，
// 本组件只负责"把哪张加进去"，加进去之后 HgReferenceStrip 会按顺序标首帧/参考N。
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const PAGE_SIZE = 24

const props = withDefaults(defineProps<{
  open: boolean
  /** 已引用的资产 id（顺序即引用顺序，与 studio.references 一致）。 */
  selectedIds?: string[]
  /** 还能不能再加（受 referenceMax 约束）。 */
  canAddMore?: boolean
  /** 视频模式：提示第 1 张是首帧，避免界面措辞与图位不一致。 */
  videoMode?: boolean
}>(), {
  selectedIds: () => [],
  canAddMore: true,
  videoMode: false
})

const emit = defineEmits<{
  (e: 'select', asset: StudioAsset): void
  (e: 'close'): void
}>()

const items = ref<AssetItem[]>([])
const total = ref(0)
const pageNo = ref(1)
const firstLoading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const done = ref(false)
/** 本地提示：达到上限后点选被拒时说一句人话，而不是静默无反应。 */
const hint = ref('')

/** seq 是竞态闸门：刷新/翻页时先发的请求可能后到，旧结果会盖掉新结果。 */
let seq = 0

function isAllowedImage(asset: AssetItem) {
  return ALLOWED_MIME.includes((asset.mimeType || '').toLowerCase())
}

async function fetchPage(target: number) {
  const mine = ++seq
  error.value = ''
  if (target === 1) firstLoading.value = true
  else loadingMore.value = true
  try {
    const res = await useHougongApi().listAssets({
      hidden: false,
      kind: 'image',
      scope: 'permanent',
      page: target,
      pageSize: PAGE_SIZE
    })
    if (mine !== seq) return
    const images = res.items.filter(isAllowedImage)
    items.value = target === 1 ? images : items.value.concat(images)
    total.value = res.total
    // 用「这一页返回是否满页」判断到底，而不是 items.length >= total：
    // 客户端按 mimeType 过滤掉了 gif/svg 等非白名单图，长度对不上 total 会永远翻不完。
    done.value = target * PAGE_SIZE >= res.total || res.items.length < PAGE_SIZE
  } catch (e: unknown) {
    if (mine !== seq) return
    error.value = e instanceof Error ? e.message : '资产加载失败'
    // 保留已经成功加载的图片和当前页码，重试时继续请求失败的这一页。
  } finally {
    if (mine === seq) {
      firstLoading.value = false
      loadingMore.value = false
    }
  }
}

/** 每次打开都重新读第一页：期间用户可能在别处上传/删除了素材。 */
function reload() {
  seq++
  pageNo.value = 1
  done.value = false
  hint.value = ''
  items.value = []
  total.value = 0
  void fetchPage(1)
}

function retry() {
  if (pageNo.value === 1) reload()
  else void fetchPage(pageNo.value)
}

function loadMore() {
  if (firstLoading.value || loadingMore.value || done.value) return
  void fetchPage(++pageNo.value)
}

function isSelected(id: string) {
  return props.selectedIds.includes(id)
}

function displayName(asset: AssetItem) {
  return asset.name || `素材 ${String(asset.id).slice(-4)}`
}

/** 已选角标：图片模式标序号，视频模式第 1 张标「首帧」（与引用条、提交图位一致）。 */
function roleLabel(id: string) {
  const index = props.selectedIds.indexOf(id)
  if (index < 0) return ''
  if (!props.videoMode) return `已选 ${index + 1}`
  return index === 0 ? '首帧' : `参考${index}`
}

function pick(asset: AssetItem) {
  if (isSelected(asset.id)) return
  if (!props.canAddMore) {
    hint.value = '已达当前模型能收的参考图上限，先删掉一张再加。'
    return
  }
  hint.value = ''
  emit('select', {
    id: asset.id,
    url: asset.url,
    kind: 'image',
    width: asset.width,
    height: asset.height,
    scope: asset.scope
  })
}

function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) close()
}

watch(() => props.open, (open) => {
  if (open) reload()
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="asset-picker__layer"
      role="dialog"
      aria-modal="true"
      aria-label="从我的资产选择参考图"
      @click.self="close"
    >
      <section class="asset-picker">
        <header>
          <div class="asset-picker__title">
            <strong>从我的资产选择</strong>
            <span v-if="videoMode">视频第 1 张为首帧，其余为参考图</span>
            <span v-else>选中即引用已有素材，不会重新上传</span>
          </div>
          <div class="asset-picker__tools">
            <button
              type="button"
              aria-label="刷新资产列表"
              title="刷新"
              :disabled="firstLoading"
              @click="reload"
            >
              <UIcon
                name="i-lucide-refresh-cw"
                aria-hidden="true"
                :class="{ spin: firstLoading }"
              />
            </button>
            <button
              type="button"
              aria-label="关闭"
              @click="close"
            >
              <UIcon
                name="i-lucide-x"
                aria-hidden="true"
              />
            </button>
          </div>
        </header>

        <div class="asset-picker__body">
          <div
            v-if="firstLoading"
            class="asset-picker__grid"
            aria-hidden="true"
          >
            <span
              v-for="i in 8"
              :key="i"
              class="asset-picker__skeleton"
            />
          </div>

          <div
            v-else-if="!items.length && !error"
            class="asset-picker__state"
          >
            <p>{{ error || '当前没有可用的图片素材。' }}</p>
            <p class="asset-picker__state-hint">
              本地上传的图片会用于当前创作；要在这里重复使用，请先到「我的资产」保存素材。
            </p>
          </div>

          <template v-else>
            <div class="asset-picker__grid">
              <button
                v-for="asset in items"
                :key="asset.id"
                type="button"
                class="asset-picker__cell"
                :class="{ 'is-selected': isSelected(asset.id) }"
                :aria-pressed="isSelected(asset.id)"
                :title="displayName(asset)"
                @click="pick(asset)"
              >
                <img
                  :src="asset.url"
                  :alt="displayName(asset)"
                  loading="lazy"
                >
                <span class="asset-picker__name">{{ displayName(asset) }}</span>
                <span
                  v-if="isSelected(asset.id)"
                  class="asset-picker__badge"
                >{{ roleLabel(asset.id) }}</span>
              </button>
            </div>

            <div
              v-if="!done && !error"
              class="asset-picker__more"
            >
              <button
                type="button"
                :disabled="loadingMore"
                @click="loadMore"
              >
                <UIcon
                  v-if="loadingMore"
                  name="i-lucide-refresh-cw"
                  class="spin"
                  aria-hidden="true"
                />
                {{ loadingMore ? '加载中…' : '加载更多' }}
              </button>
            </div>
          </template>
          <div
            v-if="error"
            class="asset-picker__state"
            role="alert"
          >
            <p>{{ error }}</p>
            <button
              type="button"
              class="asset-picker__retry"
              @click="retry"
            >
              重试
            </button>
          </div>
          <div
            v-else-if="!firstLoading && !done && !items.length"
            class="asset-picker__more"
          >
            <button
              type="button"
              :disabled="loadingMore"
              @click="loadMore"
            >
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </button>
          </div>
        </div>

        <footer>
          <span class="asset-picker__count">
            已选 {{ selectedIds.length }} 张
            <template v-if="!canAddMore"> · 已达上限</template>
          </span>
          <p
            v-if="hint"
            class="asset-picker__hint"
            role="status"
          >
            {{ hint }}
          </p>
          <button
            type="button"
            class="asset-picker__done"
            @click="close"
          >
            完成
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.asset-picker__layer {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(6 7 9 / 62%);
}
.asset-picker {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(82dvh, 640px);
  padding: 14px;
  border: 1px solid var(--hg3-line, #2a2b30);
  border-radius: 16px;
  background: #1c1d21;
  color: var(--hg3-ink, #fafafa);
  box-shadow: 0 24px 60px rgb(0 0 0 / 55%);
}
.asset-picker header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.asset-picker__title {
  display: grid;
  gap: 3px;
}
.asset-picker__title strong {
  font-size: 15px;
}
.asset-picker__title span {
  color: var(--hg3-muted, #949494);
  font-size: 12px;
}
.asset-picker__tools {
  display: flex;
  gap: 4px;
}
.asset-picker__tools button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted, #949494);
  cursor: pointer;
}
.asset-picker__tools button:hover:not(:disabled) {
  background: #282828;
  color: var(--hg3-ink, #fafafa);
}
.asset-picker__tools button:disabled {
  opacity: 0.5;
  cursor: default;
}
.asset-picker__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.asset-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.asset-picker__cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--hg3-line, #2a2b30);
  border-radius: 10px;
  background: transparent;
  color: var(--hg3-muted, #949494);
  cursor: pointer;
}
.asset-picker__cell:hover {
  border-color: var(--hg3-accent-line, rgb(232 50 176 / 38%));
}
.asset-picker__cell.is-selected {
  border-color: var(--hg3-accent, #e832b0);
  background: rgb(232 50 176 / 10%);
  cursor: default;
}
.asset-picker__cell img {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  object-fit: cover;
  background: #0b0c0e;
}
.asset-picker__name {
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-picker__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--hg3-accent, #e832b0);
  color: #fff;
  font-size: 10px;
}
.asset-picker__skeleton {
  display: block;
  aspect-ratio: 1;
  border-radius: 10px;
  background: #26272c;
  animation: picker-pulse 1.2s ease-in-out infinite;
}
@keyframes picker-pulse {
  50% { opacity: 0.55; }
}
.asset-picker__state {
  display: grid;
  gap: 8px;
  place-items: center;
  padding: 32px 16px;
  color: var(--hg3-muted, #949494);
  font-size: 13px;
  text-align: center;
}
.asset-picker__state p {
  margin: 0;
}
.asset-picker__state-hint {
  color: var(--hg3-faint, #6f6f6f);
  font-size: 12px;
}
.asset-picker__retry {
  padding: 6px 14px;
  border: 1px solid var(--hg3-line-strong, #3a3b40);
  border-radius: 8px;
  background: transparent;
  color: var(--hg3-ink, #fafafa);
  cursor: pointer;
}
.asset-picker__more {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
}
.asset-picker__more button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: 1px solid var(--hg3-line-strong, #3a3b40);
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted, #949494);
  cursor: pointer;
}
.asset-picker__more button:disabled {
  opacity: 0.6;
  cursor: default;
}
.asset-picker footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--hg3-line, #2a2b30);
}
.asset-picker__count {
  font-size: 12px;
  color: var(--hg3-muted, #949494);
}
.asset-picker__hint {
  flex: 1;
  margin: 0;
  color: var(--hg3-accent-hi, #ff7ad0);
  font-size: 12px;
}
.asset-picker__done {
  padding: 7px 20px;
  border: 1px solid var(--hg3-accent-line, rgb(232 50 176 / 38%));
  border-radius: 9px;
  background: transparent;
  color: var(--hg3-accent-hi, #ff7ad0);
  font-size: 13px;
  cursor: pointer;
}
.asset-picker__done:hover {
  border-color: var(--hg3-accent, #e832b0);
}
.spin {
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
/* 窄屏：占满宽度、面板贴底，方便拇指操作 */
@media (max-width: 560px) {
  .asset-picker__layer {
    place-items: end stretch;
    padding: 0;
  }
  .asset-picker {
    width: 100%;
    max-height: 86dvh;
    padding-bottom: calc(14px + env(safe-area-inset-bottom, 0));
    border-radius: 18px 18px 0 0;
  }
  .asset-picker__grid {
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  }
}
</style>
