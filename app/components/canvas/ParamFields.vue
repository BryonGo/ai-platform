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
  /**
   * 按参数 key 覆盖候选（服务端/目录下发的能力值）。
   *
   * 为什么要有：像成片导出的「基准画幅」这种选项，**取值范围由模型能力决定**
   * （后台给每个视频模型配了哪些档就有哪些），写死在节点定义里必然过期 ——
   * 创作框那边的分辨率/画幅就是这么取的（同一份 catalog），画布跟着走。
   */
  optionsByKey?: Record<string, { value: string, label: string }[]>
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
  const dynamic = props.optionsByKey?.[p.key]
  const list = (dynamic && dynamic.length ? dynamic : null) ?? p.options ?? []
  if (list.length) return withStoredValue(list, p)

  if (p.key === 'modelId') {
    const models = props.modelOptions?.[props.spec.modelKind ?? ''] ?? []
    return models.length ? withStoredValue(models, p) : [{ value: '', label: '服务端默认' }]
  }
  // 候选还没到（目录没接通、还没选模型）：给一句说明，别给空下拉 ——
  // 空下拉看起来就是"界面坏了"，而用户这时候其实什么都没做错。
  return [{ value: '', label: list.length ? '' : '按模型默认' }]
}

/**
 * 把节点上**已经存着的值**补进候选。
 *
 * 为什么需要：候选是跟着模型能力实时变的（换模型、后台改了能力），旧的图里可能存着
 * 现在不支持的档。不在候选里又不显示，下拉就是空白 —— 用户既看不出当前用的什么，
 * 也没法确认自己是不是选错了。补一条带标记的选项，让人看得见、能改掉。
 */
function withStoredValue(
  list: { value: string, label: string }[],
  p: CanvasParamSpec
): { value: string, label: string }[] {
  const current = valueOf(p.key)
  if (!current || list.some(o => o.value === current)) return list
  return [{ value: current, label: `${current}（当前值，模型未声明）` }, ...list]
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
