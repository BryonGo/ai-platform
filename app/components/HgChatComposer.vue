<script setup lang="ts">
import PromptEditor from '~/components/prompt/promptEditor.vue'
import SnippetPicker from '~/components/prompt/snippetPicker.vue'
import LoraPicker from '~/components/selection/loraPicker.vue'
import type { SnippetSnapshot } from '~/components/prompt/enhancement-mark'
import { RATIO_OPTIONS, RESOLUTIONS, ratioIcon } from '~/data/image-options'
// 对话页输入器：框外模式切换、引用与参考图、模型／画幅／时长／参数、发送与费用。
// 生成中不锁输入框（交接文档：生成期间允许继续发送普通消息）。
/** 当前就地展开的选项行（'' 表示都收起）：不再用浮层遮挡输入框 */
const pickerOpen = ref<'' | 'ratio' | 'resolution' | 'duration'>('')
function togglePicker(key: 'ratio' | 'resolution' | 'duration') {
  pickerOpen.value = pickerOpen.value === key ? '' : key
}
const studio = useChatStudio()
const isNarrow = useIsNarrow()
const { onGlowPointerMove } = useGlowPointer()
/* @ 唤出的五类标签：分类弹层由 SnippetPicker 承载（复用旧创作页的现成组件） */
const loraOpen = ref(false)

/** LoRA 按**底模 family** 过滤，没选底模就无从过滤——先明确提示，而不是弹一个空面板 */
/** 时长档位范围（来自所选视频模型的档位表）；拖动时吸附到最近档位 */
const durationBounds = computed(() => {
  const list = studio.durationList.value
  return { min: list[0] ?? 5, max: list.at(-1) ?? 10 }
})
function onDurationInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  const list = studio.durationList.value
  if (!list.length) {
    studio.seconds.value = raw
    return
  }
  studio.seconds.value = list.reduce((best, item) => Math.abs(item - raw) < Math.abs(best - raw) ? item : best, list[0]!)
}

function openLora() {
  if (!studio.selectedModel.value || studio.selectedModel.value.channel === 'cloud') {
    studio.notice.value = '请先在上方选择一个本地底模，LoRA 按底模家族过滤。'
    return
  }
  loraOpen.value = true
}
const snippetPickerOpen = ref(false)
const snippetCategory = ref('character')
const promptEditorRef = ref<InstanceType<typeof PromptEditor> | null>(null)

function onOpenCategory(category: string) {
  snippetCategory.value = category
  snippetPickerOpen.value = true
}

function onApplySnippet(source: SnippetSnapshot) {
  promptEditorRef.value?.applySnippet(source)
  snippetPickerOpen.value = false
}
const modelSheet = ref(false)
const paramsSheet = ref(false)

const mentionOpen = ref(false)

/* @ 引用面板：角色 / 图片 / 视频 三类（交互标注 04） */
const mediaAssets = ref<{ id: string, url: string, name: string, kind: 'image' | 'video' }[]>([])

async function loadMediaAssets() {
  if (mediaAssets.value.length) return
  const list = await useHougongApi().listAssets(true, 1, 60).catch(() => [])
  mediaAssets.value = list.map(asset => ({
    id: asset.id,
    url: asset.url,
    name: `素材 ${String(asset.id).slice(-4)}`,
    kind: (asset.mimeType || '').startsWith('video/') ? 'video' as const : 'image' as const
  }))
}

function ensureMentionData() {
  void loadMediaAssets()
}

const characterName = computed(() => studio.selectedCharacter.value?.name || '')

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) studio.setReferenceFile(file)
  input.value = ''
}

const ratioList = RATIO_OPTIONS

const samplingLimits = computed(() => studio.catalog.value?.sampling ?? null)

function patchSampling(patch: Record<string, number | string>) {
  const base = studio.sampling.value ?? {
    steps: samplingLimits.value?.steps ?? 20,
    sampler: samplingLimits.value?.samplers?.[0] ?? 'euler',
    scheduler: samplingLimits.value?.schedulers?.[0] ?? 'normal',
    cfg: 7
  }
  studio.sampling.value = { ...base, ...patch }
}
</script>

<template>
  <div class="chat-composer">
    <div
      class="mode-switch hg-material-quick"
      role="tablist"
      aria-label="创作类型"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="studio.mode.value === 'image'"
        :class="{ active: studio.mode.value === 'image' }"
        @click="studio.mode.value = 'image'"
      >
        <UIcon
          name="i-lucide-image"
          aria-hidden="true"
        />图片创作
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="studio.mode.value === 'video'"
        :class="{ active: studio.mode.value === 'video' }"
        @click="studio.mode.value = 'video'"
      >
        <UIcon
          name="i-lucide-video"
          aria-hidden="true"
        />视频创作
      </button>
    </div>

    <div
      class="box hg-glow hg-material-input"
      @pointermove="onGlowPointerMove"
    >
      <div
        v-if="characterName || studio.reference.value.preview || studio.selectedLoras.value.length"
        class="ref-row"
      >
        <span
          v-if="characterName"
          class="ref-chip"
        >@{{ characterName }}</span>
        <span
          v-for="item in studio.selectedLoras.value"
          :key="item.id"
          class="ref-chip lora"
        >
          LoRA·{{ studio.loraOptions.value.find(l => l.id === item.id)?.name || item.id.slice(0, 6) }}
          <em>{{ item.weight.toFixed(2) }}</em>
          <button
            type="button"
            aria-label="移除该 LoRA"
            @click="studio.selectedLoras.value = studio.selectedLoras.value.filter(x => x.id !== item.id)"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </span>
        <span
          v-if="studio.reference.value.preview"
          class="ref-thumb"
        >
          <img
            :src="studio.reference.value.preview"
            :alt="studio.reference.value.name"
          >
          <button
            type="button"
            aria-label="移除参考图"
            @click="studio.clearReference()"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </span>
      </div>

      <div class="editor">
        <PromptEditor
          ref="promptEditorRef"
          :model-value="studio.promptModel.value"
          :placeholder="studio.mode.value === 'video' ? '输入 @ 唤出角色、服装、姿势…，或描述这一镜' : '输入 @ 唤出角色、服装、背景、姿势、画风'"
          @update:model-value="studio.promptModel.value = $event"
          @open-category="onOpenCategory"
        />
      </div>

      <div class="toolbar">
        <button
          type="button"
          class="at-button"
          aria-label="引用角色"
          :aria-expanded="mentionOpen"
          @click="mentionOpen = !mentionOpen; ensureMentionData()"
        >
          @
        </button>

        <label
          v-if="studio.referenceAllowed.value"
          class="upload-chip"
          title="上传参考图"
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="上传参考图"
            @change="onFile"
          >
          <UIcon
            name="i-lucide-image-plus"
            aria-hidden="true"
          />
          <span>参考图</span>
        </label>

        <button
          v-if="isNarrow"
          type="button"
          class="hg-chip"
          aria-label="选择模型"
          @click="modelSheet = true"
        >
          <UIcon
            name="i-lucide-box"
            aria-hidden="true"
          />
          <span class="hg-chip-key">模型：</span>
          <span class="chip-name">{{ studio.selectedModel.value?.name || '待选择' }}</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="hg-chevron"
            aria-hidden="true"
          />
        </button>
        <HgModelPicker
          v-else
          v-model="studio.modelId.value"
          :options="studio.modelOptions.value"
          :mode="studio.mode.value"
        />

        <button
          v-if="studio.mode.value === 'image'"
          type="button"
          class="hg-chip"
          :aria-expanded="loraOpen"
          aria-label="选择效果包 LoRA"
          @click="openLora()"
        >
          <UIcon
            name="i-lucide-layers"
            aria-hidden="true"
          />
          <span>LoRA{{ studio.selectedLoras.value.length ? `(${studio.selectedLoras.value.length})` : '' }}</span>
        </button>

        <button
          type="button"
          class="hg-chip"
          :aria-expanded="pickerOpen === 'ratio'"
          aria-label="选择画幅"
          @click="togglePicker('ratio')"
        >
          <UIcon
            :name="ratioIcon(ratioList.find(r => r.value === studio.ratio.value)?.shape ?? 'wide')"
            aria-hidden="true"
          />
          <span>{{ studio.ratio.value }}</span>
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
          <span>{{ studio.resolution.value }}</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="hg-chevron"
            :class="{ up: pickerOpen === 'resolution' }"
            aria-hidden="true"
          />
        </button>

        <button
          v-if="studio.mode.value === 'video'"
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
          <span>{{ studio.seconds.value }} 秒</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="hg-chevron"
            :class="{ up: pickerOpen === 'duration' }"
            aria-hidden="true"
          />
        </button>

        <button
          v-if="isNarrow && studio.mode.value === 'image'"
          type="button"
          class="hg-chip"
          aria-label="生成参数"
          @click="paramsSheet = true"
        >
          <UIcon
            name="i-lucide-sliders-horizontal"
            aria-hidden="true"
          />
          <span>参数</span>
        </button>
        <UPopover
          v-else
          :ui="{ content: 'ring-0 bg-transparent shadow-none rounded-xl' }"
          :content="{ side: 'top', align: 'center', collisionPadding: 12 }"
        >
          <button
            v-if="studio.mode.value === 'image'"
            type="button"
            class="hg-chip"
            aria-label="生成参数"
          >
            <UIcon
              name="i-lucide-sliders-horizontal"
              aria-hidden="true"
            />
            <span>参数</span>
          </button>
          <template #content>
            <div class="param-pop">
              <HgParamsPanel
                :mode="studio.mode.value"
                :count="studio.count.value"
                :seconds="studio.seconds.value"
                :duration-list="studio.durationList.value"
                :sampling="studio.sampling.value"
                :limits="samplingLimits"
                @update:count="studio.count.value = $event"
                @update:seconds="studio.seconds.value = $event"
                @patch:sampling="patchSampling"
              />
            </div>
          </template>
        </UPopover>

        <div class="send-wrap">
          <button
            type="button"
            class="hg-btn-primary send"
            :disabled="!studio.canSend.value"
            @click="studio.send()"
          >
            <UIcon
              name="i-lucide-send"
              aria-hidden="true"
            />发送
          </button>
          <small class="cost-note">{{ studio.costText.value }}</small>
        </div>
      </div>

      <HgOptionRow
        v-if="pickerOpen === 'ratio'"
        title="比例"
        :value="studio.ratio.value"
        :options="ratioList.map(item => ({ value: item.value, label: item.label, icon: ratioIcon(item.shape), disabled: studio.mode.value === 'video' && !!studio.modelId.value && !studio.supportedVideoRatios.value.includes(item.value), title: studio.mode.value === 'video' && !!studio.modelId.value && !studio.supportedVideoRatios.value.includes(item.value) ? '当前视频模型不支持该比例' : undefined }))"
        @select="studio.ratio.value = $event"
        @close="pickerOpen = ''"
      />
      <HgOptionRow
        v-if="pickerOpen === 'resolution'"
        title="分辨率"
        :value="studio.resolution.value"
        :options="RESOLUTIONS.map(item => ({ value: item.value, label: item.label, icon: 'i-lucide-aperture', disabled: studio.mode.value === 'video' && item.value === '2K', title: studio.mode.value === 'video' && item.value === '2K' ? '当前视频模型只提供一档分辨率' : undefined }))"
        @select="studio.resolution.value = $event"
        @close="pickerOpen = ''"
      />
      <div
        v-if="pickerOpen === 'duration' && studio.mode.value === 'video'"
        class="hg-option-row duration-row"
      >
        <span class="row-title">时长</span>
        <input
          class="duration-slider"
          type="range"
          :min="durationBounds.min"
          :max="durationBounds.max"
          step="1"
          :value="studio.seconds.value"
          :aria-valuetext="`${studio.seconds.value} 秒`"
          aria-label="视频时长"
          @input="onDurationInput"
        >
        <span class="duration-value">{{ studio.seconds.value }} 秒</span>
        <button
          type="button"
          class="row-close"
          aria-label="收起选项"
          @click="pickerOpen = ''"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </div>
    </div>

    <p
      v-if="studio.notice.value"
      class="composer-notice"
      role="status"
    >
      {{ studio.notice.value }}
    </p>

    <LoraPicker
      :open="loraOpen"
      :loras="studio.loraOptions.value"
      :selected="studio.selectedLoras.value"
      @update="studio.selectedLoras.value = $event"
      @close="loraOpen = false"
    />

    <SnippetPicker
      :open="snippetPickerOpen"
      :category="snippetCategory"
      @close="snippetPickerOpen = false"
      @apply="onApplySnippet"
    />

    <HgBottomSheet
      v-model:open="modelSheet"
      title="选择模型"
    >
      <HgModelPanel
        :options="studio.modelOptions.value"
        :model-value="studio.modelId.value"
        :mode="studio.mode.value"
        @select="studio.modelId.value = $event"
        @close="modelSheet = false"
      />
    </HgBottomSheet>

    <HgBottomSheet
      v-model:open="paramsSheet"
      title="生成参数"
    >
      <HgParamsPanel
        :mode="studio.mode.value"
        :count="studio.count.value"
        :seconds="studio.seconds.value"
        :duration-list="studio.durationList.value"
        :sampling="studio.sampling.value"
        :limits="samplingLimits"
        @update:count="studio.count.value = $event"
        @update:seconds="studio.seconds.value = $event"
        @patch:sampling="patchSampling"
      />
    </HgBottomSheet>
  </div>
</template>

<style scoped>
.chat-composer {
  width: 100%;
  /* 与消息列同宽并居中：输入框不再通栏撑开 */
  max-width: 880px;
  margin: 0 auto;
  padding: 0 20px 16px;
}
.mode-switch {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  margin-bottom: 10px;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
}
.mode-switch button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
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
.box {
  position: relative;
  padding: 12px 14px 14px;
  border: 1px solid var(--hg3-accent-line);
  border-radius: var(--hg3-radius-input);
  box-shadow: 0 18px 40px rgb(0 0 0 / 40%);
}
.ref-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.ref-chip {
  padding: 3px 9px;
  border: 1px solid var(--hg3-accent-line);
  border-radius: 8px;
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
  font-size: 12px;
}
.ref-chip.lora {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgb(255 255 255 / 6%);
  border-color: var(--hg3-line-strong);
  color: var(--hg3-ink);
}
.ref-chip.lora em {
  color: var(--hg3-accent-hi);
  font-style: normal;
}
.ref-chip.lora button {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted);
  cursor: pointer;
}
.ref-thumb {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
}
.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ref-thumb button {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border: 0;
  border-radius: 999px;
  background: rgb(0 0 0 / 62%);
  color: #fff;
  cursor: pointer;
}
.editor {
  position: relative;
  min-height: 62px;
}
.editor textarea,
.mirror {
  width: 100%;
  margin: 0;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.editor textarea {
  position: relative;
  z-index: 1;
  height: 62px;
  resize: none;
  outline: none;
}
.editor textarea::placeholder {
  color: var(--hg3-faint);
}
.mirror {
  position: absolute;
  inset: 0;
  color: transparent;
  pointer-events: none;
}
.mirror :deep(mark) {
  padding: 1px 6px;
  border: 1px solid var(--hg3-accent-line);
  border-radius: 7px;
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
}
/* 模型名可能很长：截断，绝不把发送按钮挤出可视区 */
.chat-composer .hg-chip {
  max-width: 240px;
}
.duration-row {
  align-items: center;
}
.duration-slider {
  flex: 1;
  min-width: 120px;
  height: 4px;
  border-radius: 999px;
  background: rgb(255 255 255 / 12%);
  appearance: none;
  cursor: pointer;
}
.duration-slider::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 999px;
  background: var(--hg3-accent-hi, #f99749);
  appearance: none;
  cursor: grab;
}
.duration-value {
  width: 52px;
  color: var(--hg3-accent-hi, #f99749);
  font-size: 12px;
  text-align: right;
}
.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.at-button {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
}
.upload-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-ink);
  font-size: 12px;
  cursor: pointer;
}
.upload-chip input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.upload-chip:hover {
  border-color: var(--hg3-line-strong);
}
.send-wrap {
  display: grid;
  gap: 3px;
  justify-items: end;
  margin-left: auto;
}
.send {
  height: 36px;
  min-width: 100px;
  font-size: 14px;
}
.cost-note {
  color: var(--hg3-faint);
  font-size: 11px;
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
.param-pop {
  width: min(280px, calc(100vw - 24px));
}
.mention-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 14px;
  z-index: 20;
  width: min(260px, 100%);
  padding: 8px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 12px;
  background: #1c1d21;
  box-shadow: 0 18px 44px #000a;
}
.mention-tabs {
  display: flex;
  gap: 14px;
  margin-bottom: 8px;
  padding: 0 4px 8px;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
}
.mention-tabs button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--hg3-muted, #9a9791);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.mention-tabs button.active {
  color: var(--hg3-accent-hi, #f99749);
  font-weight: 600;
}
.mention-list {
  display: grid;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
}
.mention-list button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
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
  padding: 14px 8px;
  color: var(--hg3-faint);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}
.composer-notice {
  margin: 8px 0 0;
  color: var(--hg3-warn);
  font-size: 12px;
}
</style>
