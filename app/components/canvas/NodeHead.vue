<script setup lang="ts">
/**
 * 节点卡的标题栏：图标 + 名字 + 状态 + 待确认/待重跑小点 + 折叠 + ⋯ 菜单。
 *
 * 从 NodeCard 拆出来的：原来一个文件既管标题栏、又管端口、又管内容预览、又管底栏，
 * 600 多行里改任何一处都得先读完。
 */
import type { CanvasNode, CanvasNodeState } from '~/data/canvas-graph'
import type { CanvasNodeTypeSpec } from '~/data/canvas-nodes'
import { NODE_STATE_META } from '~/data/canvas-graph'
import { groupMeta } from '~/data/canvas-nodes'

const props = defineProps<{
  node: CanvasNode
  spec: CanvasNodeTypeSpec
  state: CanvasNodeState
  /** 有几份产物等人确认（>0 时标题栏亮小点）。 */
  pendingCount: number
  /** 参数或输入变了、还没重跑。 */
  dirty?: boolean
}>()

const emit = defineEmits<{
  (e: 'rename', nodeId: string, title: string): void
  (e: 'duplicate', nodeId: string): void
  (e: 'remove', nodeId: string): void
  (e: 'collapse', nodeId: string, collapsed: boolean): void
}>()

const stateMeta = computed(() => NODE_STATE_META[props.state])
const group = computed(() => groupMeta(props.spec.group))

const menuOpen = ref(false)
function closeMenu(): void {
  menuOpen.value = false
}

const renaming = ref(false)
const renameText = ref('')

function startRename(): void {
  closeMenu()
  renameText.value = props.node.title
  renaming.value = true
}

function commitRename(): void {
  renaming.value = false
  const next = renameText.value.trim()
  if (next && next !== props.node.title) emit('rename', props.node.id, next)
}
</script>

<template>
  <header class="cg-node-head">
    <span
      class="cg-node-icon"
      :style="{ color: group.color }"
    >
      <i :class="spec.icon" />
    </span>
    <input
      v-if="renaming"
      v-model="renameText"
      class="cg-node-rename"
      @keydown.enter="commitRename"
      @keydown.esc="renaming = false"
      @blur="commitRename"
    >
    <span
      v-else
      class="cg-node-title"
    >{{ node.title }}</span>
    <span
      class="cg-node-state"
      :data-tone="stateMeta.tone"
    >{{ stateMeta.label }}</span>
    <span
      v-if="pendingCount"
      class="cg-node-dot"
      :title="`${pendingCount} 份产物等你确认`"
    />
    <span
      v-else-if="dirty && state !== 'running'"
      class="cg-node-dot cg-node-dot--dirty"
      :title="state === 'failed' ? '上次失败，需要重跑' : '参数或上游产物变了，需要重跑'"
    />
    <button
      class="cg-node-menu-btn"
      type="button"
      :title="node.collapsed ? '展开' : '折叠'"
      @click.stop="emit('collapse', node.id, !node.collapsed)"
    >
      <i :class="node.collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" />
    </button>
    <button
      class="cg-node-menu-btn"
      type="button"
      title="更多"
      @click.stop="menuOpen = !menuOpen"
    >
      <i class="i-lucide-ellipsis" />
    </button>
    <div
      v-if="menuOpen"
      class="cg-node-menu"
      @click.stop
    >
      <button
        type="button"
        @click="startRename"
      >
        重命名
      </button>
      <button
        type="button"
        @click="closeMenu(); emit('duplicate', node.id)"
      >
        复制节点
      </button>
      <button
        type="button"
        class="is-danger"
        @click="closeMenu(); emit('remove', node.id)"
      >
        删除节点
      </button>
    </div>
  </header>
</template>
