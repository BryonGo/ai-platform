<script setup lang="ts">
/**
 * 左栏节点库：按分组列出九类节点，点击或拖拽到画布上创建实例。
 *
 * 提示语照原型："点击或拖拽到画布，搭建你的 AI 短剧生产线"。
 */
import type { CanvasNodeKind } from '~/data/canvas-nodes'
import { CANVAS_GROUPS, CANVAS_NODE_TYPES, groupMeta } from '~/data/canvas-nodes'

const emit = defineEmits<{
  (e: 'add', kind: CanvasNodeKind): void
}>()

/** 按分组归拢，顺序照 CANVAS_GROUPS。 */
const grouped = computed(() =>
  CANVAS_GROUPS.map(g => ({
    group: g,
    types: CANVAS_NODE_TYPES.filter(t => t.group === g.key)
  })).filter(g => g.types.length > 0)
)

function onDragStart(event: DragEvent, kind: CanvasNodeKind): void {
  event.dataTransfer?.setData('application/x-canvas-node', kind)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <aside class="cg-lib">
    <div class="cg-lib-head">
      <p class="cg-lib-title">
        节点库
      </p>
      <p class="cg-lib-sub">
        点击或拖拽到画布，搭建你的 AI 短剧生产线
      </p>
    </div>

    <div class="cg-lib-scroll">
      <section
        v-for="bucket in grouped"
        :key="bucket.group.key"
        class="cg-lib-group"
      >
        <p class="cg-lib-group-title">
          <span
            class="cg-lib-dot"
            :style="{ background: bucket.group.color }"
          />
          {{ bucket.group.label }}
        </p>
        <button
          v-for="t in bucket.types"
          :key="t.kind"
          class="cg-lib-item"
          type="button"
          draggable="true"
          :title="t.stage === 'planned' ? `${t.subtitle}（本版未开放）` : t.subtitle"
          @click="emit('add', t.kind)"
          @dragstart="onDragStart($event, t.kind)"
        >
          <span
            class="cg-lib-icon"
            :style="{ color: groupMeta(t.group).color }"
          >
            <i :class="t.icon" />
          </span>
          <span class="cg-lib-text">
            <b>{{ t.label }}</b>
            <i>{{ t.subtitle }}</i>
          </span>
          <span
            v-if="t.stage === 'planned'"
            class="cg-lib-tag"
          >未开放</span>
        </button>
      </section>
    </div>
  </aside>
</template>

