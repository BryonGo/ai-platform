<script setup lang="ts">
/**
 * 节点卡的内容区：按节点类型显示不同的东西 ——
 *   多输出槽 → 逐口列产出；文字/大纲 → 指令输入框 + 结果（或流式）；
 *   分镜表 → 就地可编辑的表；图片 → 一组候选（点哪张选用哪张）；
 *   视频 → 封面 + 时长；音频 → 波形；成片/压缩包 → 图标 + 备注。
 *
 * 拆出来的理由：这一块是卡片里变化最频繁的部分（新节点类型都往这儿加），
 * 放在 NodeCard 里会让"卡片装配"和"内容渲染"互相干扰。
 */
import type { CanvasArtifact, CanvasNode, CanvasNodeState, CanvasShotRow } from '~/data/canvas-graph'
import type { CanvasNodeTypeSpec } from '~/data/canvas-nodes'
import { artifactsOf } from '~/data/canvas-graph'
import { portMeta } from '~/data/canvas-nodes'

const props = defineProps<{
  node: CanvasNode
  spec: CanvasNodeTypeSpec
  state: CanvasNodeState
  artifacts: CanvasArtifact[]
  streaming?: string
  /** 分镜表当前的行（草稿优先）与"改过没存"标记。 */
  tableRows?: CanvasShotRow[]
  tableDirty?: boolean
  frameGrid?: number[]
  /** 当前在看哪一口输出槽（多口节点由页面记着，见 useCanvasSlots）。 */
  activeSlot?: string
}>()

const emit = defineEmits<{
  (e: 'param', key: string, value: string): void
  (e: 'pick-item', artifactId: string, index: number): void
  (e: 'slot', slot: string): void
  /** 放大看：图/视频产物在卡片里只有两百来像素，看不清就得能点开看大的。 */
  (e: 'preview', url: string, title: string, kind?: 'image' | 'video'): void
  (e: 'row-update', index: number, key: keyof CanvasShotRow, value: string | number): void
  (e: 'rows-save'): void
  (e: 'rows-discard'): void
}>()

/** 当前这一口输出槽（多口节点由页面记着；单口节点就是它唯一那口）。 */
const onSlot = computed(() => props.activeSlot || props.spec.outputs[0]?.slot || '')

/** 每一口当前选定的产物（第一口也是卡片主预览）。 */
const shown = computed<CanvasArtifact | undefined>(() => {
  const slot = onSlot.value
  if (!slot) return undefined
  const list = artifactsOf(props.artifacts, props.node.id, slot)
  const picked = props.node.outputs[slot]
  if (picked) {
    const hit = list.find(a => a.id === picked.artifactId)
    if (hit) return hit
  }
  return list[0]
})

/** 这一步的「指令」输入框（有 promptKey 的节点才有）。 */
const promptSpec = computed(() => props.spec.params.find(p => p.key === props.spec.promptKey))
const promptKey = computed(() => props.node.kind === 'character' ? 'characterNotes' : (props.spec.promptKey ?? ''))
const promptValue = computed(() => String(props.node.params[promptKey.value] ?? ''))

const textPreview = computed(() => {
  const t = shown.value?.text ?? String(props.node.params.text ?? '')
  return t.replace(/\s+/g, ' ').trim()
})

const tableRows = computed(() => props.tableRows ?? shown.value?.rows ?? [])
const editableTable = computed(() => props.node.kind === 'shotlist' && tableRows.value.length > 0)

/**
 * 多输出槽节点的产出摘要（剧本拆解这种：人物 / 场景 / 分镜各一口）。
 *
 * 早先卡片只看 outputs[0]，于是"拆解出来的人物和场景"在图上看不见 ——
 * 而它们恰恰是下游首帧要的输入。
 *
 * 每一行是**按钮**：点一下就在右栏看这一口（版本、正文、审核都在那一栏），
 * 否则这三行只是三段只读文字，用户点哪儿都没反应。
 */
const slotSummaries = computed(() =>
  props.spec.outputs.map((port) => {
    const picked = props.node.outputs[port.slot]
    const artifact = picked
      ? props.artifacts.find(a => a.id === picked.artifactId)
      : artifactsOf(props.artifacts, props.node.id, port.slot)[0]
    let note = '未产出'
    if (artifact) {
      if (artifact.rows?.length) note = `${artifact.rows.length} 镜`
      else if (artifact.items?.length) note = `${artifact.items.length} 张`
      else if (artifact.text) note = artifact.text.replace(/\s+/g, ' ').slice(0, 16) + (artifact.text.length > 16 ? '…' : '')
      else note = artifact.note ?? '已产出'
    }
    return { slot: port.slot, label: port.label, type: port.type, note, artifact }
  })
)
</script>

<template>
  <div class="cg-node-body">
    <!-- 有多个输出槽的节点（剧本拆解）：逐口列产出，点哪一口右栏就切到哪一口 -->
    <div
      v-if="spec.outputs.length > 1"
      class="cg-slots"
    >
      <button
        v-for="s in slotSummaries"
        :key="s.slot"
        class="cg-slot"
        :class="{ 'is-on': s.slot === onSlot }"
        type="button"
        :title="`点一下在右栏看「${s.label}」的版本与正文`"
        @click.stop="emit('slot', s.slot)"
      >
        <span
          class="cg-port-dot"
          :style="{ background: portMeta(s.type).color }"
        />
        <span class="cg-slot-label">{{ s.label }}</span>
        <span
          class="cg-slot-note"
          :data-tone="s.artifact ? 'ok' : 'muted'"
        >{{ s.note }}</span>
      </button>
    </div>

    <!-- 文字 / 大纲：上面是「这一步要它干什么」的输入框，下面是结果 -->
    <div
      v-else-if="spec.outputs[0]?.type === 'text' || spec.outputs[0]?.type === 'outline'"
      class="cg-textblock"
    >
      <textarea
        v-if="promptSpec && state !== 'running'"
        class="cg-prompt"
        rows="2"
        :value="promptValue"
        :placeholder="promptSpec.placeholder ?? '这一步要它做什么？'"
        @click.stop
        @input="emit('param', promptKey, ($event.target as HTMLTextAreaElement).value)"
      />
      <p
        v-if="streaming"
        class="cg-text cg-text--live"
      >
        {{ streaming }}<span class="cg-caret" />
      </p>
      <p
        v-else-if="textPreview"
        class="cg-text"
      >
        {{ textPreview }}
      </p>
      <p
        v-else
        class="cg-prompt-hint"
      >
        写完点下面的运行
      </p>
    </div>

    <!-- 分镜表：就地可改 -->
    <CanvasNodeTableEditor
      v-else-if="spec.outputs[0]?.type === 'table'"
      :rows="tableRows"
      :frame-grid="frameGrid ?? []"
      :editable="editableTable"
      :dirty="!!tableDirty"
      :limit="6"
      @update="(i, k, v) => emit('row-update', i, k, v)"
      @save="emit('rows-save')"
      @discard="emit('rows-discard')"
    />

    <!-- 图片：一组候选，点哪张就选用哪张（三视图 / 首帧候选）；放大看大图不改变选用 -->
    <div
      v-else-if="spec.outputs[0]?.type === 'image'"
      class="cg-images"
    >
      <template v-if="shown?.items?.length">
        <button
          v-for="(it, i) in shown.items"
          :key="i"
          type="button"
          :class="['cg-image-btn', { 'is-picked': it.picked, 'is-rejected': it.review === 'rejected' }]"
          :title="`${it.label ?? `候选 ${i + 1}`}${it.review === 'rejected' ? '（已驳回）' : ''} —— 点一下就是选用这张（双击看大图）`"
          @click.stop="emit('pick-item', shown.id, i)"
          @dblclick.stop="emit('preview', it.url, it.label ?? `候选 ${i + 1}`)"
        >
          <img
            :src="it.url"
            alt=""
            class="cg-image"
          >
          <span
            class="cg-image-zoom"
            role="button"
            tabindex="0"
            :aria-label="`放大查看候选 ${i + 1}`"
            title="放大看（不改变选用）"
            @click.stop="emit('preview', it.url, it.label ?? `候选 ${i + 1}`)"
            @keydown.enter.stop="emit('preview', it.url, it.label ?? `候选 ${i + 1}`)"
          ><i class="i-lucide-maximize-2" /></span>
          <span
            v-if="it.picked"
            class="cg-image-badge"
          ><i class="i-lucide-check" /> 选用</span>
          <span
            v-else-if="it.review === 'rejected'"
            class="cg-image-badge cg-image-badge--bad"
          >已驳回</span>
          <span
            v-else
            class="cg-image-label"
          >{{ it.label }}</span>
        </button>
      </template>
      <div
        v-else-if="shown?.url"
        class="cg-image-single"
      >
        <img
          :src="shown.url"
          alt=""
          class="cg-image"
          title="点一下看大图"
          @click.stop="emit('preview', shown.url, shown.note || '产物')"
        >
        <span
          class="cg-image-zoom"
          role="button"
          tabindex="0"
          aria-label="放大查看"
          title="放大看"
          @click.stop="emit('preview', shown.url, shown.note || '产物')"
          @keydown.enter.stop="emit('preview', shown.url, shown.note || '产物')"
        ><i class="i-lucide-maximize-2" /></span>
      </div>
      <div
        v-else
        class="cg-empty"
      >
        <i class="i-lucide-image" />
        <span>{{ state === 'running' ? '出图中…' : '待生成' }}</span>
      </div>
    </div>

    <!-- 视频 / 成片 -->
    <!--
      成片（`cut`）以前只有一个占位图标 —— 那时合成节点确实只出排序清单。
      现在它是一条真 mp4（`canvas_artifact.media_asset_id` 指向合成结果），
      所以按视频一样显示：封面（mp4 首帧）+ 播放角标 + 备注（分辨率/时长/标识）。
    -->
    <div
      v-else-if="spec.outputs[0]?.type === 'video' || spec.outputs[0]?.type === 'cut'"
      class="cg-video"
    >
      <template v-if="shown?.url">
        <video
          :src="shown.url"
          class="cg-media nodrag"
          controls
          preload="metadata"
          @click.stop
        />
        <span class="cg-video-badge">{{ shown.note }}</span>
        <!-- 卡片里的播放器只有 200 多像素宽：要看清就得能点开满屏的 -->
        <span
          class="cg-image-zoom"
          role="button"
          tabindex="0"
          aria-label="放大播放"
          title="放大播放"
          @click.stop="emit('preview', shown.url, shown.note || '视频', 'video')"
          @keydown.enter.stop="emit('preview', shown.url, shown.note || '视频', 'video')"
        ><i class="i-lucide-maximize-2" /></span>
      </template>
      <div
        v-else
        class="cg-empty"
      >
        <i :class="spec.outputs[0]?.type === 'cut' ? 'i-lucide-clapperboard' : 'i-lucide-film'" />
        <span>
          {{ state === 'running'
            ? (spec.outputs[0]?.type === 'cut' ? '合成中…' : '渲染中…')
            : '待渲染' }}
        </span>
      </div>
    </div>

    <!-- 音频 -->
    <div
      v-else-if="spec.outputs[0]?.type === 'audio'"
      class="cg-audio"
    >
      <audio
        v-if="shown?.url"
        :src="shown.url"
        class="cg-media nodrag"
        controls
        preload="metadata"
        @click.stop
      />
      <span v-else>{{ state === 'running' ? '正在生成音频…' : '暂无音频产物' }}</span>
    </div>

    <!-- 成片 / 压缩包 -->
    <div
      v-else
      class="cg-empty"
    >
      <i :class="spec.outputs[0]?.type === 'zip' ? 'i-lucide-package' : 'i-lucide-clapperboard'" />
      <span>{{ shown?.note || '待产出' }}</span>
    </div>

    <p
      v-if="state === 'failed'"
      class="cg-fail"
    >
      {{ artifacts.length ? '上一次运行失败，点运行重试' : '运行失败，点运行重试' }}
    </p>
  </div>
</template>
