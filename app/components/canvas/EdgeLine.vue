<script setup lang="ts">
/**
 * 画布连线：鼠标放上去变粗变亮，中间浮出一个 ⊗ 一点就断。
 *
 * 为什么自己画一条：Vue Flow 自带的边只有一条静态路径，想"悬停才出现删除按钮"
 * 就得自己接管路径渲染。这里用 BaseEdge 画线、EdgeLabelRenderer 放按钮 ——
 * 按钮要放在 HTML 层而不是 SVG 层，否则缩放时会跟着变形。
 */
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Position } from '@vue-flow/core'

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  /** Vue Flow 传进来的是 CSSProperties，这里只透传，所以收宽一点。 */
  style?: unknown
  markerEnd?: string
  data?: { color?: string }
}>()

const emit = defineEmits<{
  (e: 'hover', edgeId: string | null): void
  (e: 'remove', edgeId: string): void
}>()

const hovered = ref(false)

const path = computed(() => getSmoothStepPath({
  sourceX: props.sourceX,
  sourceY: props.sourceY,
  sourcePosition: props.sourcePosition,
  targetX: props.targetX,
  targetY: props.targetY,
  targetPosition: props.targetPosition
}))

const rawStyle = computed(() => (props.style ?? {}) as Record<string, string | number | undefined>)

const lineStyle = computed(() => ({
  ...rawStyle.value,
  strokeWidth: hovered.value ? 2.8 : Number(rawStyle.value.strokeWidth ?? 1.6),
  filter: hovered.value ? 'drop-shadow(0 0 4px rgba(233,150,84,0.55))' : undefined
}))
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path[0]"
    :style="lineStyle"
    :marker-end="markerEnd"
  />
  <!-- 加宽的透明命中区：1.6px 的线太细，鼠标很难停在上面 -->
  <path
    :d="path[0]"
    fill="none"
    stroke="transparent"
    stroke-width="14"
    style="cursor: pointer"
    @mouseenter="hovered = true; emit('hover', id)"
    @mouseleave="hovered = false; emit('hover', null)"
  />
  <EdgeLabelRenderer>
    <button
      v-if="hovered"
      class="cg-edge-x"
      type="button"
      title="断开这条连线"
      :style="{ transform: `translate(-50%, -50%) translate(${path[1]}px, ${path[2]}px)` }"
      @click.stop="emit('remove', id)"
    >
      <i class="i-lucide-x" />
    </button>
  </EdgeLabelRenderer>
</template>

<style scoped>
.cg-edge-x {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 11px;
  color: var(--hg3-ink);
  background: rgb(20 21 24 / 92%);
  border: 1px solid var(--hg3-i-coral);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgb(0 0 0 / 45%);
  pointer-events: all;
}

.cg-edge-x:hover { background: var(--hg3-i-coral); color: #fff; }
</style>
