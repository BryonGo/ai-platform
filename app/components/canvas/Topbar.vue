<script setup lang="ts">
/**
 * 画布顶栏：标题、就绪/待确认/待重跑/已选/花费/本次预计、撤销重做、
 * 缩放、新建、适应画布、保存、运行全部。
 *
 * 从 canvas.vue 搬出来的：它只显示数字与抛动作，数字全由页面按同一套规则算好传进来
 * （就绪数、待重跑数、预估花费…这些口径要和节点卡、右键菜单一致，不能各算一份）。
 */
import { creditsToYuan } from '~/data/canvas-nodes'

defineProps<{
  nodeCount: number
  readyCount: number
  /** 有几份产物等人确认。 */
  pending: number
  /** 现在真能跑、且需要跑的节点数。 */
  dirtyCount: number
  selectedCount: number
  /** 已花费（分）。 */
  totalCost: number
  /** 「运行全部」这一遍的预估花费（分）。 */
  estimatedBatch: number
  /** 正在跑的节点数（>0 时按钮变"运行中"）。 */
  runningCount: number
  zoomPercent: string
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
  (e: 'new'): void
  (e: 'fit'): void
  (e: 'save'): void
  (e: 'run-all'): void
}>()
</script>

<template>
  <header class="cg-top">
    <div class="cg-top-left">
      <h1 class="cg-brand">
        织幕
      </h1>
      <span class="cg-tag">AI 影剧无界画布</span>
    </div>

    <div class="cg-top-mid">
      <span class="cg-metric"><i class="i-lucide-layers" /> 就绪 {{ readyCount }}/{{ nodeCount }}</span>
      <span
        class="cg-metric"
        :data-tone="pending ? 'warn' : 'muted'"
      ><i class="i-lucide-bell" /> 待确认 {{ pending }}</span>
      <span
        v-if="dirtyCount"
        class="cg-metric"
        data-tone="warn"
      ><i class="i-lucide-refresh-cw" /> 待重跑 {{ dirtyCount }}</span>
      <span
        v-if="selectedCount"
        class="cg-metric"
        data-tone="warn"
      ><i class="i-lucide-box-select" /> 已选 {{ selectedCount }}</span>
      <span class="cg-metric"><i class="i-lucide-coins" /> 已花 {{ creditsToYuan(totalCost) }}</span>
      <span
        v-if="estimatedBatch"
        class="cg-metric"
        data-tone="warn"
      ><i class="i-lucide-calculator" /> 本次预计 {{ creditsToYuan(estimatedBatch) }}</span>
    </div>

    <div class="cg-top-right">
      <button
        class="cg-icon"
        type="button"
        title="撤销（⌘Z）"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <i class="i-lucide-undo-2" />
      </button>
      <button
        class="cg-icon"
        type="button"
        title="重做（⇧⌘Z）"
        :disabled="!canRedo"
        @click="emit('redo')"
      >
        <i class="i-lucide-redo-2" />
      </button>

      <div class="cg-zoom">
        <button
          type="button"
          title="缩小"
          @click="emit('zoom-out')"
        >
          <i class="i-lucide-minus" />
        </button>
        <span>{{ zoomPercent }}</span>
        <button
          type="button"
          title="放大"
          @click="emit('zoom-in')"
        >
          <i class="i-lucide-plus" />
        </button>
      </div>
      <button
        class="cg-ghost"
        type="button"
        @click="emit('new')"
      >
        <i class="i-lucide-file-plus-2" /> 新建
      </button>
      <button
        class="cg-ghost"
        type="button"
        @click="emit('fit')"
      >
        <i class="i-lucide-maximize" /> 适应画布
      </button>
      <button
        class="cg-ghost"
        type="button"
        @click="emit('save')"
      >
        <i class="i-lucide-save" /> 保存
      </button>
      <button
        class="cg-primary"
        type="button"
        :disabled="!!runningCount"
        @click="emit('run-all')"
      >
        <i :class="runningCount ? 'i-lucide-loader-circle' : 'i-lucide-play'" />
        {{ runningCount ? `运行中 ${runningCount}` : `运行全部${estimatedBatch ? ` · 约 ${creditsToYuan(estimatedBatch)}` : ''}` }}
      </button>
    </div>
  </header>
</template>
