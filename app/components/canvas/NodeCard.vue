<script setup lang="ts">
/**
 * 画布节点卡：把标题栏、端口、内容、参数区、底栏装配起来。
 *
 * 对外接口（props/emits）与拆分前完全一致 —— 页面不用改。
 * 具体的显示逻辑都在子组件里：
 *   NodeHead       标题栏（图标/名字/状态/折叠/菜单）
 *   NodePorts      左入右出端口与连线手柄
 *   NodePreview    按节点类型显示内容（文字/表格/候选图/视频/音频）
 *   NodeTableEditor 分镜表就地编辑
 *   NodeFoot       运行、版本切换、参数开关、模型
 *
 * 这里**不做业务判断**：能不能跑、跑成什么样由页面决定，卡片只负责显示和把动作抛上去。
 */
import type { CanvasArtifact, CanvasNode, CanvasNodeState, CanvasShotRow } from '~/data/canvas-graph'
import type { CanvasNodeTypeSpec } from '~/data/canvas-nodes'
import { artifactsOf } from '~/data/canvas-graph'

const props = defineProps<{
  id: string
  data: {
    node: CanvasNode
    spec: CanvasNodeTypeSpec
    state: CanvasNodeState
    /** 参数或输入变了、还没重跑（界面给个"待重跑"的提示）。 */
    dirty?: boolean
    /** 鼠标悬停某条连线时，这条线两端的节点。 */
    linked?: boolean
    /** H3 帧数网格与模型候选：卡片上也能改参数，取值必须与右栏同一份。 */
    frameGrid?: number[]
    modelOptions?: Record<string, { value: string, label: string }[]>
    /** 分镜表当前的行（草稿优先）与"改过没存"标记。 */
    tableRows?: CanvasShotRow[]
    tableDirty?: boolean
    artifacts: CanvasArtifact[]
    /** 这一步用的模型名（每一步不一样，显示出来才知道在烧哪个模型的钱）。 */
    modelLabel?: string
    /** 正在流式输出的文本（SSE 未接前由本地模拟逐字推）。 */
    streaming?: string
  }
  selected?: boolean
}>()

const emit = defineEmits<{
  (e: 'run', nodeId: string): void
  (e: 'expand', nodeId: string): void
  (e: 'remove', nodeId: string): void
  (e: 'duplicate', nodeId: string): void
  (e: 'rename', nodeId: string, title: string): void
  (e: 'pick', nodeId: string, artifactId: string): void
  (e: 'pick-item', nodeId: string, artifactId: string, index: number): void
  (e: 'review', nodeId: string, artifactId: string, action: 'approved' | 'rejected'): void
  (e: 'open', nodeId: string): void
  (e: 'param', nodeId: string, key: string, value: string): void
  (e: 'collapse', nodeId: string, collapsed: boolean): void
  (e: 'row-update', nodeId: string, index: number, key: keyof CanvasShotRow, value: string | number): void
  (e: 'rows-save', nodeId: string): void
  (e: 'rows-discard', nodeId: string): void
}>()

const node = computed(() => props.data.node)
const spec = computed(() => props.data.spec)
const state = computed(() => props.data.state)

/** 该槽位的全部版本（版本切换用；新的在前）。 */
const versions = computed<CanvasArtifact[]>(() => {
  const slot = spec.value.outputs[0]?.slot
  return slot ? artifactsOf(props.data.artifacts, node.value.id, slot) : []
})

/** 当前选用的产物（底栏要它的备注）。 */
const shown = computed<CanvasArtifact | undefined>(() => {
  const slot = spec.value.outputs[0]?.slot
  if (!slot) return undefined
  const picked = node.value.outputs[slot]
  return picked
    ? versions.value.find(a => a.id === picked.artifactId) ?? versions.value[0]
    : versions.value[0]
})

const pendingCount = computed(() => versions.value.filter(a => a.review === 'pending').length)
const failed = computed(() => state.value === 'failed')

/** 卡片内的参数区是否展开（就地改参数，不用开右栏）。 */
const paramsOpen = ref(false)
const editableParams = computed(() => spec.value.params.filter(p => p.key !== spec.value.promptKey))

const tableRowCount = computed(() => (props.data.tableRows ?? shown.value?.rows ?? []).length)
</script>

<template>
  <div
    :class="['cg-node', `cg-node--${spec.group}`, { 'is-active': selected, 'is-running': state === 'running', 'is-linked': props.data.linked }]"
    :style="{ width: `${spec.width}px` }"
    @click="emit('open', node.id)"
  >
    <CanvasNodeHead
      :node="node"
      :spec="spec"
      :state="state"
      :pending-count="pendingCount"
      :dirty="props.data.dirty"
      @rename="(id, title) => emit('rename', id, title)"
      @duplicate="emit('duplicate', $event)"
      @remove="emit('remove', $event)"
      @collapse="(id, collapsed) => emit('collapse', id, collapsed)"
    />

    <CanvasNodePorts
      v-show="!node.collapsed"
      :spec="spec"
    />

    <CanvasNodePreview
      v-show="!node.collapsed"
      :node="node"
      :spec="spec"
      :state="state"
      :artifacts="props.data.artifacts"
      :streaming="props.data.streaming"
      :table-rows="props.data.tableRows"
      :table-dirty="props.data.tableDirty"
      :frame-grid="props.data.frameGrid"
      @param="(key, value) => emit('param', node.id, key, value)"
      @pick-item="(artifactId, index) => emit('pick-item', node.id, artifactId, index)"
      @row-update="(index, key, value) => emit('row-update', node.id, index, key, value)"
      @rows-save="emit('rows-save', node.id)"
      @rows-discard="emit('rows-discard', node.id)"
    />

    <div
      v-if="paramsOpen && editableParams.length"
      class="cg-node-params"
    >
      <CanvasParamFields
        :node="node"
        :spec="spec"
        :frame-grid="props.data.frameGrid ?? []"
        :model-options="props.data.modelOptions"
        :skip-key="spec.promptKey"
        dense
        @update="(key: string, value: unknown) => emit('param', node.id, key, String(value))"
      />
    </div>

    <CanvasNodeFoot
      :node="node"
      :spec="spec"
      :state="state"
      :versions="versions"
      :shown-id="shown?.id"
      :shown-note="shown?.note"
      :failed="failed"
      :dirty="props.data.dirty"
      :model-label="props.data.modelLabel"
      :has-params="editableParams.length > 0"
      :params-open="paramsOpen"
      :can-expand="node.kind === 'shotlist' && tableRowCount > 0"
      @run="emit('run', node.id)"
      @expand="emit('expand', node.id)"
      @pick="(artifactId) => emit('pick', node.id, artifactId)"
      @toggle-params="paramsOpen = !paramsOpen"
    />
  </div>
</template>
