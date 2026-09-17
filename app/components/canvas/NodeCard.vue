<script setup lang="ts">
/**
 * 画布节点卡：节点在图上的样子。
 *
 * 结构照原型：标题栏（图标 + 名称 + 状态 + ⋯）、左入端口、右出端口（带标签、按类型着色）、
 * 中间内容预览（文字 / 三视图 / 分镜表 / 视频 / 音频）、底部（版本切换 + 运行）。
 *
 * 这里**不做业务判断**：能不能跑、跑成什么样由页面决定，卡片只负责显示和把动作抛上去。
 */
import { Handle, Position } from '@vue-flow/core'
import type { CanvasArtifact, CanvasNode, CanvasNodeState } from '~/data/canvas-graph'
import type { CanvasNodeTypeSpec } from '~/data/canvas-nodes'
import { NODE_STATE_META, artifactsOf } from '~/data/canvas-graph'
import { framesToSeconds, groupMeta, portMeta } from '~/data/canvas-nodes'

const props = defineProps<{
  id: string
  data: {
    node: CanvasNode
    spec: CanvasNodeTypeSpec
    state: CanvasNodeState
    artifacts: CanvasArtifact[]
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
  (e: 'review', nodeId: string, artifactId: string, action: 'approved' | 'rejected'): void
  (e: 'open', nodeId: string): void
}>()

const HEADER_H = 38
const PORT_H = 24

const node = computed(() => props.data.node)
const spec = computed(() => props.data.spec)
const state = computed(() => props.data.state)
const stateMeta = computed(() => NODE_STATE_META[state.value])
const group = computed(() => groupMeta(spec.value.group))

/** 每个输出槽当前选定的产物。 */
const shown = computed<CanvasArtifact | undefined>(() => {
  const slot = spec.value.outputs[0]?.slot
  if (!slot) return undefined
  const list = artifactsOf(props.data.artifacts, node.value.id, slot)
  const picked = node.value.outputs[slot]
  if (picked) {
    const hit = list.find(a => a.id === picked.artifactId)
    if (hit) return hit
  }
  return list[0]
})

/** 该槽位的全部版本（版本切换用；新的在前）。 */
const versions = computed<CanvasArtifact[]>(() => {
  const slot = spec.value.outputs[0]?.slot
  return slot ? artifactsOf(props.data.artifacts, node.value.id, slot) : []
})

const pendingCount = computed(() => versions.value.filter(a => a.review === 'pending').length)
const failed = computed(() => state.value === 'failed')

/** 端口圆点的纵坐标：与端口标签行对齐，第 i 行中心 = 标题栏 + i*行高 + 半个行高。 */
function portTop(index: number): string {
  return `${HEADER_H + index * PORT_H + PORT_H / 2}px`
}

const menuOpen = ref(false)
function closeMenu(): void {
  menuOpen.value = false
}

const renaming = ref(false)
const renameText = ref('')
function startRename(): void {
  closeMenu()
  renameText.value = node.value.title
  renaming.value = true
}
function commitRename(): void {
  renaming.value = false
  const next = renameText.value.trim()
  if (next && next !== node.value.title) emit('rename', node.value.id, next)
}

const tableRows = computed(() => shown.value?.rows ?? [])
const textPreview = computed(() => {
  const t = shown.value?.text ?? String(node.value.params.text ?? '')
  return t.replace(/\s+/g, ' ').trim()
})
</script>

<template>
  <div
    :class="['cg-node', `cg-node--${spec.group}`, { 'is-active': selected, 'is-running': state === 'running' }]"
    :style="{ width: `${spec.width}px` }"
    @click="emit('open', node.id)"
  >
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

    <!-- 端口：左入右出，标签与圆点对齐 -->
    <div class="cg-node-ports">
      <div class="cg-port-col cg-port-col--in">
        <div
          v-for="p in spec.inputs"
          :key="`in-${p.slot}`"
          class="cg-port"
        >
          <Handle
            :id="p.slot"
            type="target"
            :position="Position.Left"
            :connectable="true"
            :style="{ top: portTop(spec.inputs.indexOf(p)), background: portMeta(p.type).color }"
          />
          <span
            class="cg-port-dot"
            :style="{ background: portMeta(p.type).color }"
          />
          <span class="cg-port-label">{{ p.label }}</span>
        </div>
      </div>
      <div class="cg-port-col cg-port-col--out">
        <div
          v-for="p in spec.outputs"
          :key="`out-${p.slot}`"
          class="cg-port"
        >
          <span class="cg-port-label">{{ p.label }}</span>
          <span
            class="cg-port-dot"
            :style="{ background: portMeta(p.type).color }"
          />
          <Handle
            :id="p.slot"
            type="source"
            :position="Position.Right"
            :connectable="true"
            :style="{ top: portTop(spec.outputs.indexOf(p)), background: portMeta(p.type).color }"
          />
        </div>
      </div>
    </div>

    <!-- 内容预览 -->
    <div class="cg-node-body">
      <!-- 文字 / 大纲 -->
      <p
        v-if="spec.outputs[0]?.type === 'text' || spec.outputs[0]?.type === 'outline'"
        class="cg-text"
      >
        {{ textPreview || '还没有内容' }}
      </p>

      <!-- 分镜表 -->
      <div
        v-else-if="spec.outputs[0]?.type === 'table'"
        class="cg-table"
      >
        <div
          v-if="!tableRows.length"
          class="cg-empty"
        >
          还没生成镜头
        </div>
        <template v-else>
          <div class="cg-table-head">
            <span>镜</span><span>景别</span><span>帧</span><span>秒</span>
          </div>
          <div
            v-for="r in tableRows.slice(0, 6)"
            :key="r.idx"
            class="cg-table-row"
          >
            <span>{{ String(r.idx).padStart(2, '0') }}</span>
            <span>{{ r.shotSize }}</span>
            <span>{{ r.frames }}</span>
            <span>{{ framesToSeconds(r.frames) }}</span>
          </div>
          <p
            v-if="tableRows.length > 6"
            class="cg-table-more"
          >
            还有 {{ tableRows.length - 6 }} 镜
          </p>
        </template>
      </div>

      <!-- 图片（三视图 / 关键帧候选） -->
      <div
        v-else-if="spec.outputs[0]?.type === 'image'"
        class="cg-images"
      >
        <template v-if="shown?.url">
          <img
            :src="shown.url"
            alt=""
            class="cg-image"
          >
          <img
            v-if="node.kind === 'character'"
            :src="shown.url"
            alt=""
            class="cg-image cg-image--side"
          >
          <img
            v-if="node.kind === 'character'"
            :src="shown.url"
            alt=""
            class="cg-image cg-image--side cg-image--flip"
          >
        </template>
        <div
          v-else
          class="cg-empty"
        >
          <i class="i-lucide-image" />
          <span>{{ state === 'running' ? '出图中…' : '待生成' }}</span>
        </div>
      </div>

      <!-- 视频 -->
      <div
        v-else-if="spec.outputs[0]?.type === 'video'"
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
          <i class="i-lucide-film" />
          <span>{{ state === 'running' ? '渲染中…' : '待渲染' }}</span>
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
        {{ props.data.artifacts.length ? '上一次运行失败，点运行重试' : '运行失败，点运行重试' }}
      </p>
    </div>

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
        v-else-if="node.kind === 'shotlist' && tableRows.length"
        class="cg-btn cg-btn--ghost"
        type="button"
        title="按分镜表批量生成关键帧与视频节点"
        @click.stop="emit('expand', node.id)"
      >
        生成节点
      </button>
      <button
        v-else
        class="cg-btn"
        type="button"
        :disabled="state === 'running' || state === 'blocked'"
        @click.stop="emit('run', node.id)"
      >
        <i :class="state === 'running' ? 'i-lucide-loader-circle' : 'i-lucide-play'" />
        {{ state === 'running' ? '运行中' : '运行' }}
      </button>

      <span
        v-if="versions.length > 1"
        class="cg-versions"
      >
        <button
          v-for="v in versions.slice(0, 3)"
          :key="v.id"
          type="button"
          :class="['cg-ver', { 'is-on': v.id === shown?.id }]"
          :title="`v${v.version} · ${v.note ?? ''} · ${v.review === 'approved' ? '已认可' : v.review === 'rejected' ? '已驳回' : '待确认'}`"
          @click.stop="emit('pick', node.id, v.id)"
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

      <span
        v-if="failed || shown?.note"
        class="cg-foot-note"
      >{{ shown?.note ?? '' }}</span>
    </footer>
  </div>
</template>

<style scoped>
.cg-node {
  display: flex;
  flex-direction: column;
  background: var(--hg3-card);
  border: 1px solid var(--hg3-line-strong);
  border-radius: var(--hg3-radius-card);
  box-shadow: 0 10px 26px rgb(0 0 0 / 34%);
  color: var(--hg3-ink);
  overflow: visible;
  transition: border-color 0.14s, box-shadow 0.14s;
}

.cg-node.is-active {
  border-color: var(--hg3-accent-line);
  box-shadow: 0 0 0 1px var(--hg3-accent-line), 0 14px 32px rgb(0 0 0 / 42%);
}

.cg-node.is-running {
  border-color: var(--hg3-run);
}

.cg-node-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 8px 0 10px;
  border-bottom: 1px solid var(--hg3-line);
  background: var(--hg3-card-soft);
  border-radius: var(--hg3-radius-card) var(--hg3-radius-card) 0 0;
}

.cg-node-icon {
  display: inline-flex;
  font-size: 15px;
}

.cg-node-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cg-node-rename {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  font-size: 12.5px;
  color: var(--hg3-ink);
  background: var(--hg3-well);
  border: 1px solid var(--hg3-accent-line);
  border-radius: 6px;
}

.cg-node-state {
  flex: none;
  padding: 1px 6px;
  font-size: 10.5px;
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  color: var(--hg3-muted);
}

.cg-node-state[data-tone='ok'] { color: var(--hg3-ok); background: rgb(46 223 154 / 12%); }
.cg-node-state[data-tone='run'] { color: var(--hg3-run); background: rgb(101 198 251 / 12%); }
.cg-node-state[data-tone='warn'] { color: var(--hg3-warn); background: rgb(255 180 84 / 12%); }
.cg-node-state[data-tone='bad'] { color: var(--hg3-i-coral); background: rgb(255 112 122 / 12%); }

.cg-node-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--hg3-warn);
  box-shadow: 0 0 6px var(--hg3-warn);
}

.cg-node-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--hg3-faint);
  border-radius: 6px;
}

.cg-node-menu-btn:hover {
  color: var(--hg3-ink);
  background: rgb(255 255 255 / 8%);
}

.cg-node-menu {
  position: absolute;
  top: 34px;
  right: 6px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 108px;
  padding: 4px;
  background: var(--hg3-well);
  border: 1px solid var(--hg3-line-strong);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgb(0 0 0 / 46%);
}

.cg-node-menu button {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--hg3-ink);
  text-align: left;
  border-radius: 6px;
}

.cg-node-menu button:hover { background: rgb(255 255 255 / 8%); }
.cg-node-menu button.is-danger { color: var(--hg3-i-coral); }

.cg-node-ports {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px 2px;
}

.cg-port-col { display: flex; flex-direction: column; gap: 0; }
.cg-port-col--out { align-items: flex-end; }

.cg-port {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 24px;
}

.cg-port-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  opacity: 0.9;
}

.cg-port-label {
  font-size: 10.5px;
  color: var(--hg3-muted);
  white-space: nowrap;
}

.cg-node-ports :deep(.vue-flow__handle) {
  width: 9px;
  height: 9px;
  border: 2px solid var(--hg3-card);
  border-radius: 50%;
}

.cg-node-ports :deep(.vue-flow__handle-left) { left: -14px; }
.cg-node-ports :deep(.vue-flow__handle-right) { right: -14px; }

.cg-node-body {
  padding: 8px 10px 10px;
  border-top: 1px solid var(--hg3-line);
}

.cg-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  color: var(--hg3-muted);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cg-table { display: flex; flex-direction: column; gap: 3px; }

.cg-table-head,
.cg-table-row {
  display: grid;
  grid-template-columns: 26px 1fr 34px 34px;
  gap: 4px;
  font-size: 10.5px;
  color: var(--hg3-muted);
}

.cg-table-head { color: var(--hg3-faint); }
.cg-table-row span:first-child { color: var(--hg3-ink); }
.cg-table-more { margin: 2px 0 0; font-size: 10px; color: var(--hg3-faint); }

.cg-images { display: flex; gap: 4px; }
.cg-image {
  width: 100%;
  height: 76px;
  object-fit: cover;
  border-radius: 8px;
  background: var(--hg3-well);
}

.cg-image--side { width: 46px; flex: none; }
.cg-image--flip { transform: scaleX(-1); opacity: 0.85; }

.cg-video {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96px;
  background: var(--hg3-well);
  border-radius: 10px;
  overflow: hidden;
}

.cg-video-poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.9) brightness(0.72);
}

.cg-video-play {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 13px;
  color: var(--hg3-ink);
  background: rgb(0 0 0 / 46%);
  border-radius: 50%;
}

.cg-video-badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  font-size: 10px;
  color: var(--hg3-ink);
  background: rgb(0 0 0 / 56%);
  border-radius: 999px;
}

.cg-audio {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 56px;
  padding: 0 2px;
}

.cg-audio-bar {
  flex: 1;
  min-height: 6px;
  background: linear-gradient(180deg, var(--hg3-i-green), rgb(34 221 163 / 34%));
  border-radius: 2px;
}

.cg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 56px;
  font-size: 11px;
  color: var(--hg3-faint);
  border: 1px dashed var(--hg3-line-strong);
  border-radius: 10px;
}

.cg-empty i { font-size: 16px; }

.cg-fail {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: var(--hg3-i-coral);
}

.cg-node-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px 9px;
  border-top: 1px solid var(--hg3-line);
}

.cg-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--hg3-accent-ink);
  background: var(--hg3-accent);
  border-radius: 999px;
}

.cg-btn:hover:not(:disabled) { background: var(--hg3-accent-hi); }
.cg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cg-btn--ghost {
  color: var(--hg3-ink);
  background: rgb(255 255 255 / 8%);
}

.cg-versions { display: inline-flex; gap: 3px; margin-left: auto; }

.cg-ver {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  font-size: 10px;
  color: var(--hg3-muted);
  background: rgb(255 255 255 / 6%);
  border-radius: 6px;
}

.cg-ver.is-on { color: var(--hg3-ink); background: var(--hg3-accent-soft); box-shadow: inset 0 0 0 1px var(--hg3-accent-line); }
.cg-foot-note { margin-left: auto; font-size: 10px; color: var(--hg3-faint); white-space: nowrap; }
</style>
