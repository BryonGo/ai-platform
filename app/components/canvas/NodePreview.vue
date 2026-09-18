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
}>()

const emit = defineEmits<{
  (e: 'param', key: string, value: string): void
  (e: 'pick-item', artifactId: string, index: number): void
  (e: 'row-update', index: number, key: keyof CanvasShotRow, value: string | number): void
  (e: 'rows-save'): void
  (e: 'rows-discard'): void
}>()

/** 每个输出槽当前选定的产物（第一个槽是卡片主预览）。 */
const shown = computed<CanvasArtifact | undefined>(() => {
  const slot = props.spec.outputs[0]?.slot
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
const promptValue = computed(() => String(props.node.params[props.spec.promptKey ?? ''] ?? ''))

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
    <!-- 有多个输出槽的节点（剧本拆解）：逐口列产出，下游要的就是这几口 -->
    <div
      v-if="spec.outputs.length > 1"
      class="cg-slots"
    >
      <div
        v-for="s in slotSummaries"
        :key="s.slot"
        class="cg-slot"
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
      </div>
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
        @input="emit('param', spec.promptKey!, ($event.target as HTMLTextAreaElement).value)"
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

    <!-- 图片：一组候选，点哪张就选用哪张（三视图 / 首帧候选） -->
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
          :title="`${it.label ?? `候选 ${i + 1}`}${it.review === 'rejected' ? '（已驳回）' : ''} —— 点一下就是选用这张`"
          @click.stop="emit('pick-item', shown.id, i)"
        >
          <img
            :src="it.url"
            alt=""
            class="cg-image"
          >
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
        >
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
        <img
          :src="shown.url"
          alt=""
          class="cg-video-poster"
        >
        <span class="cg-video-play"><i class="i-lucide-play" /></span>
        <span class="cg-video-badge">{{ shown.note }}</span>
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
      <span
        v-for="i in 22"
        :key="i"
        class="cg-audio-bar"
        :style="{ height: `${18 + ((i * 7) % 26)}%` }"
      />
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
