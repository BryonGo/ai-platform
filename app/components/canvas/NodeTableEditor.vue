<script setup lang="ts">
/**
 * 分镜表节点的就地编辑：镜号 / 景别 / 帧数 / 秒。
 *
 * 为什么单独一个组件：这块是"改一镜不重跑整图"的入口，逻辑（草稿、保存为新版本、
 * 放弃）在页面里，界面在这里；卡片和右侧详情用的是同一份草稿。
 */
import type { CanvasShotRow } from '~/data/canvas-graph'
import { framesToSeconds } from '~/data/canvas-nodes'

const props = defineProps<{
  rows: CanvasShotRow[]
  frameGrid: number[]
  /** 可编辑（分镜表节点且已有内容）。 */
  editable: boolean
  /** 有未保存的改动。 */
  dirty: boolean
  /** 卡片里最多显示几行（详情面板里显示全部）。 */
  limit?: number
}>()

const emit = defineEmits<{
  (e: 'update', index: number, key: keyof CanvasShotRow, value: string | number): void
  (e: 'save'): void
  (e: 'discard'): void
}>()

const shownRows = computed(() => (props.limit ? props.rows.slice(0, props.limit) : props.rows))
const hiddenCount = computed(() => (props.limit ? Math.max(0, props.rows.length - props.limit) : 0))
</script>

<template>
  <div class="cg-table">
    <div
      v-if="!rows.length"
      class="cg-empty"
    >
      还没生成镜头
    </div>
    <template v-else>
      <div class="cg-table-head">
        <span>镜</span><span>景别</span><span>帧</span><span>秒</span>
      </div>
      <div
        v-for="(r, i) in shownRows"
        :key="i"
        class="cg-table-row"
      >
        <span>{{ String(r.idx).padStart(2, '0') }}</span>
        <input
          v-if="editable"
          class="cg-cell"
          :value="r.shotSize"
          placeholder="景别"
          @click.stop
          @input="emit('update', i, 'shotSize', ($event.target as HTMLInputElement).value)"
        >
        <span v-else>{{ r.shotSize }}</span>
        <select
          v-if="editable"
          class="cg-cell cg-cell--num"
          :value="r.frames"
          @click.stop
          @change="emit('update', i, 'frames', Number(($event.target as HTMLSelectElement).value))"
        >
          <option
            v-for="f in (frameGrid.length ? frameGrid : [r.frames])"
            :key="f"
            :value="f"
          >
            {{ f }}
          </option>
        </select>
        <span v-else>{{ r.frames }}</span>
        <span>{{ framesToSeconds(r.frames) }}</span>
      </div>
      <p
        v-if="hiddenCount"
        class="cg-table-more"
      >
        还有 {{ hiddenCount }} 镜
      </p>
      <div
        v-if="editable && dirty"
        class="cg-row-actions"
      >
        <button
          class="cg-btn"
          type="button"
          @click.stop="emit('save')"
        >
          <i class="i-lucide-save" /> 保存为新版本
        </button>
        <button
          class="cg-btn cg-btn--ghost"
          type="button"
          @click.stop="emit('discard')"
        >
          放弃
        </button>
      </div>
      <p
        v-else-if="editable"
        class="cg-table-more"
      >
        格子里能直接改，改完存新版本
      </p>
    </template>
  </div>
</template>
