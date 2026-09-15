<script setup lang="ts">
import PromptEditor from '~/components/prompt/promptEditor.vue'
import SnippetPicker from '~/components/prompt/snippetPicker.vue'
import LoraPicker from '~/components/selection/loraPicker.vue'
import type { SnippetSnapshot } from '~/components/prompt/enhancement-mark'
import { RATIO_OPTIONS } from '~/data/image-options'
// 对话页输入器：框外模式切换、引用与参考图、模型／画幅／时长／参数、发送与费用。
// 生成中不锁输入框（交接文档：生成期间允许继续发送普通消息）。
/** 「自定义」浮窗的展开状态：输入框沉底，面板必须向上弹，否则一展开就跑到屏幕外 */
const paramsOpen = ref(false)
const studio = useChatStudio()

/**
 * 该比例在当前模型下是否不可选。
 *
 * 视频：只认模型自带的分辨率表（videoModels[].resolutions）；
 * 云端图像：只认模型能力里该清晰度档声明的比例（capabilities.parameters[].ratios）；
 * 本地 comfy：不限制。三种口径统一在这里，避免「能选、提交被后端拒」。
 *
 * 现在只用来**过滤选项**（不支持的直接不渲染）。早先还有个 ratioUnsupportedReason()
 * 给灰按钮做 tooltip，改成隐藏之后就没有调用方了，故删除 —— 留着是死代码。
 */
function ratioUnsupported(value: string) {
  if (studio.mode.value === 'video') {
    return !!studio.modelId.value && !studio.supportedVideoRatios.value.includes(value)
  }
  const cloud = studio.supportedCloudRatios.value
  return cloud.length > 0 && !cloud.includes(value)
}

/**
 * landing = 首页那种"输入 → 交草稿跳创作页"的用法（同一套按钮，提交动作不同）。
 * 之所以用 variant 而不是再写一套：两页按钮曾经各写一份，最后长成了两套交互
 * （上传位置不同、时长胶囊漏了数值、创作页多出参考图/LoRA/参数）。
 */
const props = withDefaults(defineProps<{ variant?: 'chat' | 'landing' }>(), { variant: 'chat' })
const emit = defineEmits<{ submit: [] }>()

function onSend() {
  if (props.variant === 'landing') {
    emit('submit')
    return
  }
  void studio.send()
}
const isNarrow = useIsNarrow()
const { onGlowPointerMove } = useGlowPointer()
/* @ 唤出的五类标签：分类弹层由 SnippetPicker 承载（复用旧创作页的现成组件） */
const loraOpen = ref(false)

/** LoRA 按**底模 family** 过滤，没选底模就无从过滤——先明确提示，而不是弹一个空面板 */
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

// @ 引用入口按用户要求暂时从工具条取下（见 template 里被注释的那段按钮）。
// 状态与数据链路保留：等下一条「@ 功能」写到这里时，解开按钮即可用，
// 因此这里对 eslint 的未使用告警做定点豁免，而不是把代码删掉。
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- @ 入口临时下线，逻辑留待复用
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 同上：@ 入口临时下线
function ensureMentionData() {
  void loadMediaAssets()
}

const characterName = computed(() => studio.selectedCharacter.value?.name || '')
/** 模板选择浮层开关（模板只在工具支持时才有内容）。 */
const tplOpen = ref(false)

/** 公共图片方框选好文件后落到 studio（上传在建任务时按需做，见 submitGeneration）。 */
function onMediaFile(file: File) {
  studio.setReferenceFile(file)
}

/**
 * D3/D6 点击委托：输入框里除了正文和按钮之外，还有大片"看着是输入区、点了没反应"的空白
 * （顶部内边距、正文下半、媒体框与正文之间的 12px 间隙、chips 行空白、工具栏空隙）。
 * 实测这些点点击后 activeElement 落在 BODY 上 —— 既不出光标，还会把已有焦点弄丢。
 *
 * 白名单很关键：点在正文内部必须**原样放行**，否则会把用户点出来的光标位置重置到上一次选区。
 */
const FOCUS_PASSTHROUGH = 'button, a, label, input, textarea, select, .media-box, .prompt-editor, .tpl-sheet, .snippet-menu'
function focusEditorFromContainer(event: MouseEvent) {
  const el = event.target as HTMLElement | null
  if (!el || el.closest(FOCUS_PASSTHROUGH)) return
  promptEditorRef.value?.focus()
}

const ratioList = RATIO_OPTIONS

/**
 * 比例选项（带该档位下的像素尺寸）。
 *
 * 当前模型不支持的**直接不渲染**，不是灰掉 —— 原来是 map + disabled
 * （3390f6b 有意选的，理由是"让用户看到点不动而不是没这个选项"）。但两端能力差得
 * 很多：本地底模 8 个比例全支持，云端 Seedream / GPT Image 只支持 5 个，
 * 21:9 / 4:3 / 3:4 永远是三个灰按钮，反而像坏了。
 *
 * 图像模式直接用 studio.sizeOptions（它已经按模型能力过滤好了，且带 size）；
 * 视频模式的比例来自模型自带的分辨率表，仍走 ratioUnsupported。
 */
const ratioOptions = computed(() => {
  if (studio.mode.value === 'image' && studio.sizeOptions.value.length) {
    return studio.sizeOptions.value.map(item => ({ value: item.ratio, label: item.ratio, size: item.size }))
  }
  return ratioList
    .filter(item => !ratioUnsupported(item.value))
    .map(item => ({ value: item.value, label: item.label, size: '' }))
})

/**
 * 分辨率选项：同理，只渲染这个模型在这个模式下真正提供的档。
 *
 * 视频每个比例后端只给一档（videoSecondTierAvailable 恒 false），所以视频下只出第一档。
 */
const resolutionOptions = computed(() => {
  const all = studio.supportedQualities.value
  const usable = studio.mode.value === 'video' && !studio.videoSecondTierAvailable.value ? all.slice(0, 1) : all
  return usable.map(value => ({ value, label: value, icon: 'i-lucide-aperture' }))
})

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

    <!-- 当前工具 + 模板：只在从工具入口进来（或手动选过工具）时出现。
         工具决定"能做什么"，模板决定"做成什么样"，两者都只传 code 给后端。 -->
    <div
      v-if="studio.activeTool.value"
      class="tool-row"
    >
      <span class="tool-chip">
        <UIcon
          :name="studio.toolInfo.value?.icon || 'i-lucide-sparkles'"
          aria-hidden="true"
        />
        {{ studio.toolInfo.value?.name || studio.activeTool.value }}
        <button
          type="button"
          aria-label="取消当前工具"
          @click="studio.setTool('')"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </span>
      <button
        v-if="studio.toolTemplates.value.length"
        type="button"
        class="template-chip"
        :class="{ active: !!studio.activeTemplate.value }"
        @click="tplOpen = !tplOpen"
      >
        <UIcon
          name="i-lucide-layers"
          aria-hidden="true"
        />
        {{ studio.activeTemplate.value
          ? (studio.toolTemplates.value.find(t => t.code === studio.activeTemplate.value)?.name || studio.activeTemplate.value)
          : '选择模板' }}
        <UIcon name="i-lucide-chevron-down" />
      </button>
      <span
        v-if="studio.toolNeedsImage.value && !studio.reference.value.preview"
        class="tool-hint"
      >该工具需要先选一张图</span>
    </div>

    <!-- 模板选择：底部弹层（移动端友好），与其它选择器同一套交互 -->
    <div
      v-if="tplOpen && studio.toolTemplates.value.length"
      class="tpl-sheet"
      role="dialog"
      aria-label="选择模板"
    >
      <div class="tpl-sheet-head">
        <span>选择模板</span>
        <button
          type="button"
          aria-label="关闭"
          @click="tplOpen = false"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </div>
      <div class="tpl-grid">
        <button
          v-for="tpl in studio.toolTemplates.value"
          :key="tpl.code"
          type="button"
          class="tpl-card"
          :class="{ active: studio.activeTemplate.value === tpl.code }"
          @click="studio.setTemplate(tpl.code); tplOpen = false"
        >
          <strong>{{ tpl.name }}</strong>
          <small v-if="tpl.summary">{{ tpl.summary }}</small>
        </button>
      </div>
    </div>

    <div
      class="box hg-glow hg-material-input"
      @pointermove="onGlowPointerMove"
      @click="focusEditorFromContainer"
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
      </div>

      <!-- 正文行：图片方框在**文字之外**（用户反馈：图在文字流里鼠标不好点、光标不好放），
           有图时正文一侧加分隔线，见 .composer-body.has-media -->
      <div
        class="composer-body"
        :class="{ 'has-media': !!studio.reference.value.preview }"
      >
        <HgComposerMedia
          v-if="studio.referenceAllowed.value"
          :preview="studio.reference.value.preview"
          :name="studio.reference.value.name"
          @file="onMediaFile"
          @clear="studio.clearReference()"
        />

        <div class="editor">
          <PromptEditor
            ref="promptEditorRef"
            :model-value="studio.promptModel.value"
            :placeholder="studio.mode.value === 'video' ? '输入 @ 唤出角色、服装、姿势…，或描述这一镜' : '输入 @ 唤出角色、服装、背景、姿势、画风'"
            @update:model-value="studio.promptModel.value = $event"
            @open-category="onOpenCategory"
          />
        </div>
      </div>

      <div class="toolbar">
        <!-- @ 引用入口暂时取下（用户要求：工具条只留上传/模型/自定义）。
             将来「@ 那套新功能」写好后再解开这段；MentionPanel / ensureMentionData /
             mentionOpen 的状态与数据链路都保留着，解开即可用。
        <button
          type="button"
          class="at-button"
          aria-label="引用角色"
          :aria-expanded="mentionOpen"
          @click="mentionOpen = !mentionOpen; ensureMentionData()"
        >
          @
        </button>
        -->

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

        <!-- 自定义：比例 / 清晰度 / 分辨率 / 模型支持的参数都收在这一个入口里。
             原来工具条上有「画幅」「时长」「参数」「LoRA」四个 chip，用户要连点两三次
             才知道自己出的是多大一张图、能不能调采样。现在按钮上的图标就是当前比例的形状。 -->
        <button
          v-if="isNarrow"
          type="button"
          class="hg-chip"
          aria-label="自定义生成参数"
          @click="paramsSheet = true"
        >
          <HgRatioIcon
            :ratio="studio.ratio.value"
            :size="18"
          />
          <span>自定义</span>
          <span class="chip-name">{{ studio.ratio.value }} · {{ studio.resolution.value }}</span>
        </button>
        <!-- 自定义：比例 / 清晰度 / 分辨率 / 模型支持的参数都收在这一个浮窗里。
             必须 side=top —— 输入框在页面底部，向下展开会直接落到屏幕外。 -->
        <UPopover
          v-else
          v-model:open="paramsOpen"
          :ui="{ content: 'ring-0 bg-transparent shadow-none rounded-xl p-0' }"
          :content="{ side: 'top', align: 'center', sideOffset: 10, collisionPadding: 12 }"
        >
          <button
            type="button"
            class="hg-chip"
            :aria-expanded="paramsOpen"
            aria-label="自定义生成参数"
          >
            <HgRatioIcon
              :ratio="studio.ratio.value"
              :size="18"
            />
            <span>自定义</span>
            <span class="chip-name">{{ studio.ratio.value }} · {{ studio.resolution.value }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="hg-chevron"
              :class="{ up: paramsOpen }"
              aria-hidden="true"
            />
          </button>
          <template #content>
            <div class="param-pop">
              <HgGenParams
                :mode="studio.mode.value"
                :ratio="studio.ratio.value"
                :ratios="ratioOptions"
                :resolution="studio.resolution.value"
                :resolutions="resolutionOptions"
                :size-label="studio.sizeLabel.value"
                :count="studio.count.value"
                :seconds="studio.seconds.value"
                :duration-list="studio.durationList.value"
                :sampling="studio.sampling.value"
                :limits="samplingLimits"
                :lora-visible="studio.mode.value === 'image' && studio.selectedModel.value?.channel !== 'cloud'"
                :lora-selected="studio.selectedLoras.value.length"
                @update:ratio="studio.ratio.value = $event"
                @update:resolution="studio.resolution.value = $event"
                @update:count="studio.count.value = $event"
                @update:seconds="studio.seconds.value = $event"
                @patch:sampling="patchSampling"
                @open:lora="openLora()"
                @close="paramsOpen = false"
              />
            </div>
          </template>
        </UPopover>

        <div class="send-wrap">
          <button
            type="button"
            class="hg-btn-primary send"
            :disabled="!studio.canSend.value"
            :title="studio.canSend.value ? '' : '先描述这一幕，或上传参考图'"
            @click="onSend"
          >
            <UIcon
              name="i-lucide-send"
              aria-hidden="true"
            />发送
          </button>
          <small class="cost-note">{{ studio.costText.value }}</small>
        </div>
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
      <HgGenParams
        :mode="studio.mode.value"
        :ratio="studio.ratio.value"
        :ratios="ratioOptions"
        :resolution="studio.resolution.value"
        :resolutions="resolutionOptions"
        :size-label="studio.sizeLabel.value"
        :count="studio.count.value"
        :seconds="studio.seconds.value"
        :duration-list="studio.durationList.value"
        :sampling="studio.sampling.value"
        :limits="samplingLimits"
        :lora-visible="studio.mode.value === 'image' && studio.selectedModel.value?.channel !== 'cloud'"
        :lora-selected="studio.selectedLoras.value.length"
        @update:ratio="studio.ratio.value = $event"
        @update:resolution="studio.resolution.value = $event"
        @update:count="studio.count.value = $event"
        @update:seconds="studio.seconds.value = $event"
        @patch:sampling="patchSampling"
        @open:lora="openLora()"
        @close="paramsSheet = false"
      />
    </HgBottomSheet>
  </div>
</template>

<style scoped>
.tool-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.tool-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--hg-accent); border-radius: 999px; background: color-mix(in srgb, var(--hg-accent) 12%, transparent); font-size: 13px; }
.tool-chip button { display: inline-flex; border: 0; background: transparent; color: inherit; cursor: pointer; opacity: 0.7; }
.tool-chip button:hover { opacity: 1; }
.template-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--hg-line); border-radius: 999px; background: transparent; color: var(--hg-muted); font-size: 13px; cursor: pointer; }
.template-chip.active { color: var(--ink); border-color: var(--hg-muted); }
.tool-hint { font-size: 12px; color: var(--hg-muted); }
.tpl-sheet { margin-bottom: 10px; padding: 12px; border: 1px solid var(--hg-line); border-radius: 10px; background: var(--hg-card); }
.tpl-sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 13px; color: var(--hg-muted); }
.tpl-sheet-head button { border: 0; background: transparent; color: inherit; cursor: pointer; }
.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); gap: 8px; }
.tpl-card { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid var(--hg-line); border-radius: 8px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.tpl-card.active { border-color: var(--hg-accent); }
.tpl-card small { color: var(--hg-muted); }
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
/* 正文行：图片方框 + 编辑器并排 */
.composer-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.composer-body .editor {
  flex: 1;
  min-width: 0;
  cursor: text;
}
/* 有图时在图片与文字之间画一条分隔线，明确"哪块是可点的正文" */
.composer-body.has-media .editor {
  border-left: 1px solid var(--hg3-line);
  padding-left: 12px;
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
  /* 宽：跟输入框同量级，窄视口自动收；高：超出即内部滚动，绝不把面板顶到屏幕外。
     300px 起步是因为比例网格一列放 4 个形状图标才不挤。 */
  width: min(360px, calc(100vw - 24px));
  max-height: min(60vh, 520px);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--hg-line);
  border-radius: 12px;
  background: var(--hg-card);
  box-shadow: 0 12px 32px rgb(0 0 0 / 35%);
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

/* ── 画幅面板（比例 / 分辨率 / 大小） ──
   配色与 HgOptionRow 同一套 token，避免两个面板看起来像两个产品。 */
.hg-size-panel {
  min-width: min(420px, 86vw);
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgb(255 255 255 / 8%);
}
.size-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.size-head .row-title,
.size-line .row-title {
  color: var(--hg3-faint, #6e6b66);
  font-size: 11px;
}
.size-head .row-close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-faint, #6e6b66);
  cursor: pointer;
}
.size-head .row-close:hover {
  background: rgb(255 255 255 / 8%);
  color: var(--hg3-ink, #f2f0ec);
}
/* 比例用网格而不是横排：形状对比才有意义（21:9 与 9:16 并排一眼就分得出）。
   列宽自适应，13 个比例（Grok）也不会挤成一条。 */
.ratio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.ratio-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 4px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 10px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-ink, #f2f0ec);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}
.ratio-cell:hover {
  border-color: rgb(255 255 255 / 22%);
}
.ratio-cell.active {
  border-color: var(--hg3-accent-line, rgb(217 131 77 / 38%));
  background: var(--hg3-accent-soft, rgb(217 131 77 / 14%));
  color: var(--hg3-accent-hi, #f99749);
}
.size-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.res-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.res-pill {
  height: 28px;
  padding: 0 12px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-ink, #f2f0ec);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.res-pill:hover {
  border-color: rgb(255 255 255 / 22%);
}
.res-pill.active {
  border-color: var(--hg3-accent-line, rgb(217 131 77 / 38%));
  background: var(--hg3-accent-soft, rgb(217 131 77 / 14%));
  color: var(--hg3-accent-hi, #f99749);
}
/* 大小右对齐、等宽数字：换比例时数字跳动不会带着整行抖 */
.size-value {
  margin-left: auto;
  color: var(--hg3-ink, #f2f0ec);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
</style>
