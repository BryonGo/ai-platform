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
  busy?: boolean
  arranging?: boolean
  canArrange?: boolean
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
  /** 当前图名（以前页面里存了 `graphTitle` 却没渲染，界面上根本看不到自己在哪张图）。 */
  graphTitle?: string
  /** 我的图（最近更新在前）；点一下就地切过去。 */
  graphs?: { id: string, title: string }[]
}>()

const emit = defineEmits<{
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
  (e: 'new'): void
  (e: 'fit'): void
  (e: 'arrange'): void
  (e: 'save'): void
  (e: 'run-all'): void
  (e: 'switch-graph', id: string): void
  (e: 'open-graphs'): void
}>()

// 下拉开关就地放在顶栏组件里：它只影响这一块 UI，页面不必知道"菜单开没开"。
const graphOpen = ref(false)
function pickGraph(id: string): void {
  graphOpen.value = false
  emit('switch-graph', id)
}
function openGraphList(): void {
  graphOpen.value = false
  emit('open-graphs')
}
</script>

<template>
  <header
    class="cg-top"
    :inert="arranging"
  >
    <div class="cg-top-left">
      <h1 class="cg-brand">
        织幕
      </h1>
      <span class="cg-tag">AI 影剧无界画布</span>

      <!-- 图名 + 就地切换：「我另一张图在哪」这个问题的第一道答案 -->
      <div class="cg-graph">
        <button
          type="button"
          class="cg-graph-btn"
          title="切换画布"
          @click="graphOpen = !graphOpen"
        >
          <i class="i-lucide-files" />
          <b>{{ graphTitle || '未命名图' }}</b>
          <i class="i-lucide-chevron-down" />
        </button>
        <div
          v-if="graphOpen"
          class="cg-graph-menu"
        >
          <p
            v-if="!graphs || !graphs.length"
            class="cg-graph-empty"
          >
            还没有别的画布
          </p>
          <button
            v-for="g in graphs || []"
            :key="g.id"
            type="button"
            class="cg-graph-item"
            :class="{ 'is-current': g.title === (graphTitle || '未命名图') }"
            @click="pickGraph(g.id)"
          >
            {{ g.title || '未命名图' }}
          </button>
          <button
            type="button"
            class="cg-graph-all"
            @click="openGraphList"
          >
            全部画布 →
          </button>
        </div>
      </div>
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
        :disabled="busy || !!runningCount"
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
        :disabled="!canArrange || arranging"
        :aria-busy="arranging"
        title="按依赖和镜号整理位置，可一步撤销"
        @click="emit('arrange')"
      >
        <i :class="arranging ? 'i-lucide-loader-circle cg-spin' : 'i-lucide-layout-grid'" />
        {{ arranging ? '整理中…' : '整理画布' }}
      </button>
      <button
        class="cg-ghost"
        type="button"
        :disabled="busy"
        :aria-busy="busy"
        @click="emit('save')"
      >
        <i :class="busy ? 'i-lucide-loader-circle cg-spin' : 'i-lucide-save'" /> {{ busy ? '处理中…' : '保存' }}
      </button>
      <button
        class="cg-primary"
        type="button"
        :disabled="busy || !!runningCount || !nodeCount"
        @click="emit('run-all')"
      >
        <i :class="runningCount ? 'i-lucide-loader-circle' : 'i-lucide-play'" />
        {{ runningCount ? `运行中 ${runningCount}` : `运行全部${estimatedBatch ? ` · 约 ${creditsToYuan(estimatedBatch)}` : ''}` }}
      </button>
    </div>
  </header>
</template>
