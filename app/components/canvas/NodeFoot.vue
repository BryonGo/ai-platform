<script setup lang="ts">
/**
 * 节点卡的底栏：运行 / 生成节点 / 本版未开放、版本切换、参数开关、这一步用的模型、产物备注。
 *
 * 底栏这几个按钮的显示条件（未开放 / 分镜表可生成节点 / 普通运行）放在这里，
 * NodeCard 只管装配。
 */
import type { CanvasArtifact, CanvasNode, CanvasNodeState } from '~/data/canvas-graph'
import type { CanvasNodeTypeSpec } from '~/data/canvas-nodes'

const props = defineProps<{
  node: CanvasNode
  spec: CanvasNodeTypeSpec
  state: CanvasNodeState
  /** 该节点输出槽的产物版本（新的在前）。 */
  versions: CanvasArtifact[]
  /** 当前选用的产物 id。 */
  shownId?: string
  /** 当前选用产物的备注（分辨率 / 时长 …）。 */
  shownNote?: string
  failed?: boolean
  dirty?: boolean
  modelLabel?: string
  /** 有可改的参数（决定要不要显示「参数」开关）。 */
  hasParams: boolean
  paramsOpen: boolean
  /** 分镜表里有内容（决定要不要显示「生成节点」）。 */
  canExpand: boolean
}>()

const emit = defineEmits<{
  (e: 'run'): void
  (e: 'expand'): void
  (e: 'pick', artifactId: string): void
  (e: 'toggle-params'): void
}>()

function reviewLabel(a: CanvasArtifact): string {
  const review = a.review === 'approved' ? '已认可' : a.review === 'rejected' ? '已驳回' : '待确认'
  return `v${a.version} · ${a.note ?? ''} · ${review}`
}
</script>

<template>
  <footer class="cg-node-foot">
    <button
      v-if="spec.stage === 'planned'"
      class="cg-btn cg-btn--ghost"
      type="button"
      title="本版未开放"
      disabled
    >
      本版未开放
    </button>
    <button
      v-else-if="canExpand"
      class="cg-btn cg-btn--ghost"
      type="button"
      title="按分镜表批量生成首帧与视频节点"
      @click.stop="emit('expand')"
    >
      生成节点
    </button>
    <button
      v-else
      class="cg-btn"
      type="button"
      :disabled="state === 'running' || state === 'blocked'"
      @click.stop="emit('run')"
    >
      <i :class="state === 'running' ? 'i-lucide-loader-circle' : 'i-lucide-play'" />
      {{ state === 'running' ? '运行中' : dirty ? '重跑' : '运行' }}
    </button>

    <span
      v-if="versions.length > 1"
      class="cg-versions"
    >
      <button
        v-for="v in versions.slice(0, 3)"
        :key="v.id"
        type="button"
        :class="['cg-ver', { 'is-on': v.id === shownId }]"
        :title="reviewLabel(v)"
        @click.stop="emit('pick', v.id)"
      >
        <i
          v-if="v.review === 'approved'"
          class="i-lucide-check"
        />
        <i
          v-else-if="v.review === 'rejected'"
          class="i-lucide-x"
        />
        <template v-else>v{{ v.version }}</template>
      </button>
    </span>

    <button
      v-if="hasParams"
      class="cg-foot-toggle"
      type="button"
      :class="{ 'is-on': paramsOpen }"
      :title="paramsOpen ? '收起参数' : '在卡片上改参数'"
      @click.stop="emit('toggle-params')"
    >
      <i :class="paramsOpen ? 'i-lucide-chevron-up' : 'i-lucide-sliders-horizontal'" />
      参数
    </button>

    <span
      v-if="modelLabel"
      class="cg-model"
      :title="`这一步用的是 ${modelLabel}`"
    >
      <i class="i-lucide-cpu" />{{ modelLabel }}
    </span>

    <span
      v-if="failed || shownNote"
      class="cg-foot-note"
    >{{ shownNote ?? '' }}</span>
  </footer>
</template>
