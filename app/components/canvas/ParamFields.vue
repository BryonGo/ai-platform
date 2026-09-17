<script setup lang="ts">
/**
 * 节点参数表单：卡片里、右侧详情里**同一份**渲染逻辑。
 *
 * 早先只有右栏能改参数，改几个镜头就得在节点和右栏之间来回点。抽成组件之后，
 * 节点卡自己也能展开参数区就地改 —— 两处的控件、取值、候选必须一模一样，
 * 否则同一个"帧数"在两处表现不同，人会以为哪边坏了。
 */
import type { CanvasNode } from '~/data/canvas-graph'
import type { CanvasNodeTypeSpec, CanvasParamSpec } from '~/data/canvas-nodes'
import { framesToSeconds } from '~/data/canvas-nodes'

const props = defineProps<{
  node: CanvasNode
  spec: CanvasNodeTypeSpec
  /** H3 帧数网格（真源在服务端，随图带下来）。 */
  frameGrid: number[]
  /** modelId 的下拉候选，按 modelKind 分桶。 */
  modelOptions?: Record<string, { value: string, label: string }[]>
  /** 紧凑模式：卡片里用，字号与间距更小。 */
  dense?: boolean
  /** 不渲染这个参数（卡片上已把"指令"渲染成输入框，别重复）。 */
  skipKey?: string
}>()

const emit = defineEmits<{
  (e: 'update', key: string, value: unknown): void
}>()

const fields = computed<CanvasParamSpec[]>(() =>
  props.spec.params.filter(p => p.key !== props.skipKey)
)

function valueOf(key: string): string {
  const v = props.node.params[key]
  return v === undefined || v === null ? '' : String(v)
}

function optionsOf(p: CanvasParamSpec): { value: string, label: string }[] {
  if (p.key === 'modelId') {
    const list = props.modelOptions?.[props.spec.modelKind ?? ''] ?? []
    return list.length ? list : [{ value: '', label: '服务端默认' }]
  }
  return p.options ?? []
}
</script>

<template>
  <div :class="['cg-params', { 'is-dense': dense }]">
    <label
      v-for="p in fields"
      :key="p.key"
      class="cg-param"
    >
      <span class="cg-param-label">{{ p.label }}</span>

      <textarea
        v-if="p.kind === 'textarea'"
        class="cg-input cg-input--area"
        :value="valueOf(p.key)"
        :placeholder="p.placeholder"
        @input="emit('update', p.key, ($event.target as HTMLTextAreaElement).value)"
      />
      <select
        v-else-if="p.kind === 'select'"
        class="cg-input"
        :value="valueOf(p.key)"
        @change="emit('update', p.key, ($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="o in optionsOf(p)"
          :key="o.value"
          :value="o.value"
        >
          {{ o.label }}
        </option>
      </select>
      <select
        v-else-if="p.kind === 'frames'"
        class="cg-input"
        :value="valueOf(p.key)"
        @change="emit('update', p.key, Number(($event.target as HTMLSelectElement).value))"
      >
        <option
          v-for="f in frameGrid"
          :key="f"
          :value="f"
        >
          {{ f }} 帧 · {{ framesToSeconds(f) }}s
        </option>
      </select>
      <input
        v-else-if="p.kind === 'number'"
        class="cg-input"
        type="number"
        min="1"
        :value="valueOf(p.key)"
        @input="emit('update', p.key, Number(($event.target as HTMLInputElement).value))"
      >
      <input
        v-else
        class="cg-input"
        :value="valueOf(p.key)"
        :placeholder="p.placeholder"
        @input="emit('update', p.key, ($event.target as HTMLInputElement).value)"
      >

      <span
        v-if="p.hint"
        class="cg-param-hint"
      >{{ p.hint }}</span>
    </label>
  </div>
</template>

<style scoped>
.cg-params { display: flex; flex-direction: column; gap: 9px; }
.cg-param { display: block; }
.cg-param-label { display: block; margin-bottom: 4px; font-size: 11px; color: var(--hg3-muted); }
.cg-param-hint { display: block; margin-top: 3px; font-size: 10px; color: var(--hg3-faint); }

.cg-input {
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--hg3-ink);
  background: var(--hg3-well);
  border: 1px solid var(--hg3-line-strong);
  border-radius: 8px;
}

.cg-input--area { min-height: 62px; resize: vertical; line-height: 1.5; }
.cg-input:focus { outline: none; border-color: var(--hg3-accent-line); }

/* 卡片里的小一号 */
.cg-params.is-dense { gap: 6px; }
.cg-params.is-dense .cg-param-label { font-size: 10px; margin-bottom: 2px; }
.cg-params.is-dense .cg-input { min-height: 24px; padding: 2px 6px; font-size: 10.5px; border-radius: 6px; }
.cg-params.is-dense .cg-input--area { min-height: 46px; }
.cg-params.is-dense .cg-param-hint { display: none; }
</style>
