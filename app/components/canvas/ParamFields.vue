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
  /**
   * 这一版里"选中的那一条"的设定（角色/场景）。
   *
   * 为什么要露出来：选完角色后真正进提示词的是**上游那一条的描述**（拼进 `appearance`），
   * 而界面上只有"补充外观要求"这个空框 —— 用户看不到"到底按谁在出图"，
   * 点完运行才发现出的是别人（用户 2026-09-19：看不见就等于没法确认）。
   */
  sourcePreview?: { title: string, description: string, from: string, label?: string }
  /**
   * 这次会带哪几张参考图（首帧/视频）。
   *
   * 顺序**就是**上游收到的顺序（服务端按槽名排序、槽内按连线顺序编号），
   * 所以这里必须照同一顺序写「参考图N」—— 用户写"参考图2 的光线"才对得上。
   */
  references?: { total: number, groups: { slotLabel: string, items: { index: number, label: string, thumb: string }[] }[] }
}>()

const emit = defineEmits<{
  (e: 'update', key: string, value: unknown): void
  (e: 'preview', url: string, title: string): void
}>()

const fields = computed<CanvasParamSpec[]>(() =>
  props.spec.params.filter(p => p.key !== props.skipKey).map((p) => {
    // 角色设定：名字与外观**都从上游人物列表来**，节点上只留"选哪个角色"与"补充要求"。
    if (props.node.kind === 'character') {
      if (p.key === 'name') return { ...p, key: 'characterSource', label: '选择上游已确认角色', kind: 'select' }
      if (p.key === 'appearance') return { ...p, key: 'characterNotes', label: '补充外观要求', placeholder: '人物身份沿用上游设定；这里仅补充服装、视角等要求' }
      return p
    }
    // 场景设定同理（用户 2026-09-19：场景列表也没从上游取）——场景名不该是自由文本，
    // 否则同一个场景被写成两个字面量不同、实际同一个的地方，图上就多出两个"场景"。
    if (props.node.kind === 'scene') {
      if (p.key === 'name') return { ...p, key: 'sceneSource', label: '选择上游已确认场景', kind: 'select' }
      if (p.key === 'appearance') return { ...p, key: 'sceneNotes', label: '补充环境要求', placeholder: '场景身份沿用上游设定；这里仅补充机位、光线、天气等要求' }
      return p
    }
    return p
  })
)

/** 哪些参数是"从上游清单里挑一条"，挑中的值长这样：`<产物ID>:<第几项>`。 */
const SOURCE_KEYS: Record<string, string> = {
  characterSource: 'characters',
  sceneSource: 'scenes'
}

function valueOf(key: string): string {
  // 「这一镜」：批量「生成节点」建出来的节点把镜号记在 node.ref 上（图 JSON 的一部分），
  // 参数区要显示的就是它 —— 否则下拉看着是空的，而服务端其实按第 3 镜在跑。
  if (key === 'shotIdx') {
    const v = props.node.params.shotIdx ?? props.node.ref?.shotIdx
    return v === undefined || v === null ? '' : String(v)
  }
  const v = props.node.params[key]
  return v === undefined || v === null ? '' : String(v)
}

function optionsOf(p: CanvasParamSpec): { value: string, label: string }[] {
  const dynamic = props.optionsByKey?.[p.key]
  if (p.key in SOURCE_KEYS) {
    const what = p.key === 'sceneSource' ? '场景' : '角色'
    return [{
      value: '',
      label: dynamic?.length
        ? `请选择${what}（上游更新后需重新选择）`
        : `请先连接并认可上游${p.key === 'sceneSource' ? '场景列表' : '人物列表'}`
    }, ...(dynamic || [])]
  }
  if (p.key === 'shotIdx') {
    return [{
      value: '',
      label: dynamic?.length ? '请选择这一镜' : '请先连接并认可上游分镜表'
    }, ...(dynamic || [])]
  }
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
 * 存着的"上游挑一条"的值已经不在候选里（上游换了版本/被驳回）。
 *
 * 必须明说"重新选"：静默留着旧值是**最坏的一种** —— 界面上看着选好了，
 * 实际那一条已经不属于这一版，跑出来的角色/场景不是用户以为的那一个。
 */
const staleSourceKeys = computed(() =>
  Object.keys(SOURCE_KEYS).filter((key) => {
    const current = String(props.node.params[key] ?? '')
    if (!current) return false
    return !props.optionsByKey?.[key]?.some(o => o.value === current)
  })
)

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
    <p
      v-if="node.kind === 'character'"
      class="cg-context-note"
    >
      人物身份来自已确认的拆解版本，每个节点只选择一个角色。
    </p>
    <p
      v-if="node.kind === 'scene'"
      class="cg-context-note"
    >
      场景身份来自已确认的拆解版本，每个节点只选择一个场景。
    </p>
    <p
      v-if="node.kind === 'keyframe' || node.kind === 'i2v'"
      class="cg-context-note"
    >
      这一镜的分镜来自上游分镜表；不选就按第一镜算。
    </p>
    <!-- 这次会带哪几张参考图（首帧/视频）：顺序就是上游收到的顺序 -->
    <div
      v-if="references"
      class="cg-ref-list"
    >
      <p class="cg-param-label">
        这次会带 {{ references.total }} 张参考图
        <span class="cg-param-hint">提示词里写「参考图N」按这个顺序对号</span>
      </p>
      <template
        v-for="g in references.groups"
        :key="g.slotLabel"
      >
        <p class="cg-ref-group">
          {{ g.slotLabel }}
        </p>
        <div class="cg-ref-items">
          <figure
            v-for="it in g.items"
            :key="it.index"
            class="cg-ref-item"
          >
            <img
              v-if="it.thumb"
              :src="it.thumb"
              :alt="it.label"
              title="点一下看大图"
              @click="emit('preview', it.thumb, it.label)"
            >
            <span
              v-else
              class="cg-ref-noimg"
            >无图</span>
            <figcaption>参考图{{ it.index }} · {{ it.label }}</figcaption>
          </figure>
        </div>
      </template>
    </div>

    <!-- 选中的这一条到底写了什么：出图就按它来，不能只让用户看见一个名字 -->
    <div
      v-if="sourcePreview"
      class="cg-source-preview"
    >
      <p class="cg-param-label">
        {{ sourcePreview.label || '出图就按这一条来' }} · {{ sourcePreview.title }}
        <span class="cg-param-hint">{{ sourcePreview.from }}</span>
      </p>
      <pre class="cg-source-text">{{ sourcePreview.description }}</pre>
    </div>
    <p
      v-for="key in staleSourceKeys"
      :key="key"
      class="cg-run-error"
    >
      {{ key === 'sceneSource' ? '上游场景版本已变化或尚未认可，请重新选择。' : '上游角色版本已变化或尚未认可，请重新选择。' }}
    </p>
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
