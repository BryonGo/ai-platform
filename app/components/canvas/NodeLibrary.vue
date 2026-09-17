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

<style scoped>
.cg-lib {
  display: flex;
  flex-direction: column;
  width: 214px;
  flex: none;
  min-height: 0;
  background: var(--hg3-rail-active);
  border-right: 1px solid var(--hg3-line);
}

.cg-lib-head {
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--hg3-line);
}

.cg-lib-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--hg3-ink);
}

.cg-lib-sub {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--hg3-faint);
}

.cg-lib-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 8px 20px;
}

.cg-lib-group + .cg-lib-group { margin-top: 10px; }

.cg-lib-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 5px 6px;
  font-size: 11px;
  color: var(--hg3-muted);
}

.cg-lib-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.cg-lib-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 9px;
  text-align: left;
  border-radius: 10px;
  cursor: grab;
}

.cg-lib-item:hover { background: var(--hg3-rail-hover); }

.cg-lib-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  font-size: 14px;
  background: rgb(255 255 255 / 6%);
  border-radius: 8px;
}

.cg-lib-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cg-lib-text b {
  font-size: 12px;
  font-weight: 600;
  color: var(--hg3-ink);
}

.cg-lib-text i {
  font-size: 10.5px;
  font-style: normal;
  color: var(--hg3-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cg-lib-tag {
  margin-left: auto;
  padding: 1px 5px;
  font-size: 9.5px;
  color: var(--hg3-warn);
  background: rgb(255 180 84 / 12%);
  border-radius: 999px;
}
</style>
