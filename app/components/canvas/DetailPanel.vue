<script setup lang="ts">
/**
 * 画布右侧详情面板：选中节点的状态、输入、参数、产物版本、运行记录。
 *
 * 从 canvas.vue 里整块搬出来的（那里曾到 2119 行，模板里这一块占 400 多行）。
 * 这里只负责显示与收集动作，**不做业务判断**：能不能跑、跑完是什么状态由页面决定。
 *
 * 自己算的东西（都是纯展示派生）：
 *   · 该节点输出槽的产物版本、当前选用的是哪一版
 *   · 每个输入槽接了几条、其中几条已确认（按边算，见 incomingEdges 的注释）
 *   · 剪辑合成的片段顺序（按镜号，或被手动调过）
 */
import type {
  CanvasArtifact,
  CanvasGraph,
  CanvasNode,
  CanvasNodeState,
  CanvasRun,
  CanvasShotRow
} from '~/data/canvas-graph'
import type { CanvasNodeTypeSpec } from '~/data/canvas-nodes'
import {
  NODE_STATE_META,
  artifactOfRef,
  artifactsOf,
  fragmentOrder,
  incomingEdges
} from '~/data/canvas-graph'
import { creditsToYuan, groupMeta, nodeTypeSpec, portMeta } from '~/data/canvas-nodes'

const props = defineProps<{
  graph: CanvasGraph
  /** 选中的节点（null = 没选）。 */
  node: CanvasNode | null
  spec: CanvasNodeTypeSpec | null
  /** 选中节点的运行态（由页面按同一套规则算好，避免两处判断不一致）。 */
  state: CanvasNodeState
  artifacts: CanvasArtifact[]
  runs: CanvasRun[]
  frameGrid: number[]
  modelOptions?: Record<string, { value: string, label: string }[]>
  /** 按参数 key 覆盖候选（能力值，见 ParamFields 的说明）。 */
  optionsByKey?: Record<string, { value: string, label: string }[]>
  /** 分镜表草稿（页面按节点 id 存，卡片与这里共用一份）。 */
  tableRows: CanvasShotRow[]
  tableDirty: boolean
  followUp: string
  /** 有任务在跑时禁用"带补充再生成"。 */
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'run', nodeId: string): void
  (e: 'expand', nodeId: string): void
  (e: 'param', nodeId: string, key: string, value: unknown): void
  (e: 'row-update', nodeId: string, index: number, key: keyof CanvasShotRow, value: string | number): void
  (e: 'rows-save', nodeId: string): void
  (e: 'rows-discard', nodeId: string): void
  (e: 'pick', nodeId: string, artifactId: string): void
  (e: 'pick-item', nodeId: string, artifactId: string, index: number): void
  (e: 'review', nodeId: string, artifactId: string, action: 'approved' | 'rejected'): void
  (e: 'review-item', nodeId: string, artifactId: string, index: number, action: 'approved' | 'rejected'): void
  (e: 'open-artifact', artifact: CanvasArtifact): void
  (e: 'delete-artifact', artifactId: string): void
  (e: 'update:followUp', value: string): void
  (e: 'continue', nodeId: string): void
  (e: 'move-fragment', index: number, dir: -1 | 1): void
}>()

/** 该节点输出槽的产物版本（新的在前）。 */
const versions = computed<CanvasArtifact[]>(() => {
  const node = props.node
  const slot = props.spec?.outputs[0]?.slot
  return node && slot ? artifactsOf(props.artifacts, node.id, slot) : []
})

/** 当前选用的那一版。 */
const shown = computed<CanvasArtifact | undefined>(() => {
  const node = props.node
  const slot = props.spec?.outputs[0]?.slot
  if (!node || !slot) return undefined
  const picked = node.outputs[slot]
  return picked ? versions.value.find(a => a.id === picked.artifactId) ?? versions.value[0] : versions.value[0]
})

const nodeRuns = computed(() => {
  const node = props.node
  return node ? [...props.runs].filter(r => r.nodeId === node.id).reverse().slice(0, 4) : []
})

/** 剪辑合成要拼的片段顺序（默认按镜号，手动调过就按存的顺序）。 */
const fragments = computed(() => {
  const node = props.node
  if (!node || node.kind !== 'compose') return []
  return fragmentOrder(props.graph, node).map(f => ({
    ...f,
    artifact: f.artifactId ? props.artifacts.find(a => a.id === f.artifactId) : undefined
  }))
})

/** 某个输入槽接了几条、其中几条已确认（按边算：上游没产出时也要算进"该接的那条"）。 */
function inputSummary(nodeId: string, slot: string): string {
  const edges = incomingEdges(props.graph, nodeId, [slot])
  if (!edges.length) return '未接'
  const ok = edges.filter((e) => {
    const up = props.graph.nodes.find(n => n.id === e.from.node)
    const ref = up?.outputs[e.from.slot]
    return ref ? artifactOfRef(props.artifacts, ref)?.review === 'approved' : false
  }).length
  return `${edges.length} 条 · ${ok} 条已确认`
}

/** 跑一次大约花多少（分）。 */
const estimate = computed(() => (props.node ? nodeTypeSpec(props.node.kind).estimateCredits ?? 0 : 0))

function reviewTone(review: string): string {
  return review === 'approved' ? 'ok' : review === 'rejected' ? 'bad' : 'warn'
}
function reviewLabel(review: string): string {
  return review === 'approved' ? '已认可' : review === 'rejected' ? '已驳回' : '待确认'
}
function updateFollowUp(value: string): void {
  emit('update:followUp', value)
}
</script>

<template>
  <aside class="cg-detail">
    <template v-if="node && spec">
      <header class="cg-detail-head">
        <span
          class="cg-detail-icon"
          :style="{ color: groupMeta(spec.group).color }"
        >
          <i :class="spec.icon" />
        </span>
        <div class="cg-detail-title">
          <b>{{ node.title }}</b>
          <i>{{ spec.subtitle }}</i>
        </div>
        <button
          type="button"
          title="收起"
          @click="emit('close')"
        >
          <i class="i-lucide-panel-right-close" />
        </button>
      </header>

      <div class="cg-detail-scroll">
        <!-- 状态与动作 -->
        <div class="cg-detail-state">
          <span
            class="cg-pill"
            :data-tone="NODE_STATE_META[state].tone"
          >{{ NODE_STATE_META[state].label }}</span>
          <span
            v-if="node.ref?.shotIdx"
            class="cg-pill"
          >第 {{ node.ref.shotIdx }} 镜</span>
          <button
            v-if="spec.stage === 'ready' && node.kind === 'shotlist' && tableRows.length"
            class="cg-mini"
            type="button"
            @click="emit('expand', node.id)"
          >
            生成节点（{{ tableRows.length }} 镜）
          </button>
          <button
            v-else-if="spec.stage === 'ready'"
            class="cg-mini cg-mini--accent"
            type="button"
            :disabled="state === 'running'"
            @click="emit('run', node.id)"
          >
            <i class="i-lucide-play" /> 运行这个节点{{ estimate ? ` · 约 ${creditsToYuan(estimate)}` : '' }}
          </button>
          <span
            v-else
            class="cg-pill"
            data-tone="warn"
          >本版未开放</span>
        </div>

        <!-- 输入 -->
        <section
          v-if="spec.inputs.length"
          class="cg-block"
        >
          <p class="cg-block-title">
            输入
          </p>
          <div
            v-for="p in spec.inputs"
            :key="p.slot"
            class="cg-input-row"
          >
            <span
              class="cg-port-dot"
              :style="{ background: portMeta(p.type).color }"
            />
            <span class="cg-input-name">{{ p.label }}</span>
            <span
              class="cg-input-val"
              :data-tone="incomingEdges(graph, node.id, [p.slot]).length ? 'ok' : 'muted'"
            >
              {{ inputSummary(node.id, p.slot) }}
            </span>
          </div>
        </section>

        <!-- 参数（与卡片上的是同一个组件，取值与候选必须一致） -->
        <section
          v-if="spec.params.length"
          class="cg-block"
        >
          <p class="cg-block-title">
            参数
          </p>
          <CanvasParamFields
            :node="node"
            :spec="spec"
            :frame-grid="frameGrid"
            :model-options="modelOptions"
            :options-by-key="optionsByKey"
            @update="(key: string, value: unknown) => emit('param', node!.id, key, value)"
          />
        </section>

        <!-- 分镜表：逐行可改，改的是草稿，存成新版本 -->
        <section
          v-if="node.kind === 'shotlist' && tableRows.length"
          class="cg-block"
        >
          <p class="cg-block-title">
            分镜表 <span class="cg-block-sub">v{{ shown?.version }} · 改完存新版本，老版本不动</span>
          </p>
          <div
            v-for="(row, i) in tableRows"
            :key="i"
            class="cg-row"
          >
            <div class="cg-row-head">
              <b>S{{ String(row.idx).padStart(2, '0') }}</b>
              <input
                class="cg-input cg-input--tiny"
                :value="row.shotSize"
                placeholder="景别"
                @input="emit('row-update', node.id, i, 'shotSize', ($event.target as HTMLInputElement).value)"
              >
              <input
                class="cg-input cg-input--tiny"
                :value="row.camera"
                placeholder="运镜"
                @input="emit('row-update', node.id, i, 'camera', ($event.target as HTMLInputElement).value)"
              >
              <select
                class="cg-input cg-input--tiny"
                :value="row.frames"
                @change="emit('row-update', node.id, i, 'frames', Number(($event.target as HTMLSelectElement).value))"
              >
                <option
                  v-for="f in frameGrid"
                  :key="f"
                  :value="f"
                >
                  {{ f }}f
                </option>
              </select>
            </div>
            <input
              class="cg-input cg-input--tiny"
              :value="row.keyframePrompt"
              placeholder="关键帧提示词"
              @input="emit('row-update', node.id, i, 'keyframePrompt', ($event.target as HTMLInputElement).value)"
            >
            <input
              class="cg-input cg-input--tiny"
              :value="row.line ?? ''"
              placeholder="台词"
              @input="emit('row-update', node.id, i, 'line', ($event.target as HTMLInputElement).value)"
            >
          </div>
          <div class="cg-row-actions">
            <button
              class="cg-mini cg-mini--accent"
              type="button"
              :disabled="!tableDirty"
              @click="emit('rows-save', node.id)"
            >
              <i class="i-lucide-save" /> 保存为新版本
            </button>
            <button
              class="cg-mini"
              type="button"
              :disabled="!tableDirty"
              @click="emit('rows-discard', node.id)"
            >
              放弃修改
            </button>
          </div>
        </section>

        <!-- 当前选用产物的正文（剧本/大纲要能整段读） -->
        <section
          v-if="shown?.text"
          class="cg-block"
        >
          <p class="cg-block-title">
            当前选用 · v{{ shown.version }} 正文
          </p>
          <pre class="cg-fulltext">{{ shown.text }}</pre>
        </section>

        <!-- 片段顺序：视频在排序才是成片 -->
        <section
          v-if="node.kind === 'compose' && fragments.length"
          class="cg-block"
        >
          <p class="cg-block-title">
            片段顺序 <span class="cg-block-sub">默认按镜号，可手动调</span>
          </p>
          <div
            v-for="(f, i) in fragments"
            :key="f.upstreamId"
            class="cg-frag"
          >
            <span class="cg-frag-no">{{ i + 1 }}</span>
            <img
              v-if="f.artifact?.url"
              :src="f.artifact.url"
              alt=""
              class="cg-frag-thumb"
            >
            <span class="cg-frag-text">
              <b>{{ f.label }}</b>
              <i>{{ f.artifact?.note ?? '还没产出' }} · {{ f.artifact?.review === 'approved' ? '已确认' : '待确认' }}</i>
            </span>
            <button
              class="cg-tiny cg-frag-move"
              type="button"
              :disabled="i === 0"
              title="上移"
              @click="emit('move-fragment', i, -1)"
            >
              ↑
            </button>
            <button
              class="cg-tiny cg-frag-move"
              type="button"
              :disabled="i === fragments.length - 1"
              title="下移"
              @click="emit('move-fragment', i, 1)"
            >
              ↓
            </button>
          </div>
        </section>

        <!-- 导出清单：已导出 / 未导出（原因）/ 参数不一致 -->
        <section
          v-if="shown?.manifest"
          class="cg-block"
        >
          <p class="cg-block-title">
            导出清单
          </p>
          <p class="cg-mani-group">
            已导出 <b>{{ shown.manifest.exported.length }}</b>
          </p>
          <div
            v-for="x in shown.manifest.exported"
            :key="`ok-${x.label}`"
            class="cg-mani-row"
          >
            <i class="i-lucide-check" /> {{ x.label }} <span>{{ x.note }}</span>
          </div>
          <p class="cg-mani-group">
            未导出 <b>{{ shown.manifest.skipped.length }}</b>
          </p>
          <div
            v-for="x in shown.manifest.skipped"
            :key="`skip-${x.label}`"
            class="cg-mani-row cg-mani-row--warn"
          >
            <i class="i-lucide-minus" /> {{ x.label }} <span>{{ x.reason }}</span>
          </div>
          <p
            v-if="shown.manifest.mismatch.length"
            class="cg-mani-group"
          >
            参数不一致 <b>{{ shown.manifest.mismatch.length }}</b>
          </p>
          <div
            v-for="x in shown.manifest.mismatch"
            :key="`mm-${x.label}`"
            class="cg-mani-row cg-mani-row--bad"
          >
            <i class="i-lucide-triangle-alert" /> {{ x.label }} <span>{{ x.detail }}</span>
          </div>
        </section>

        <!-- 产物版本 -->
        <section class="cg-block">
          <p class="cg-block-title">
            产物 <span class="cg-block-sub">{{ versions.length }} 个版本</span>
          </p>
          <p
            v-if="!versions.length"
            class="cg-empty-line"
          >
            还没有产物
          </p>
          <div
            v-for="a in versions"
            :key="a.id"
            class="cg-art"
            :class="{ 'is-on': a.id === shown?.id }"
          >
            <div class="cg-art-head">
              <b>v{{ a.version }}</b>
              <span>{{ a.note }}</span>
              <span
                class="cg-pill cg-pill--sm"
                :data-tone="reviewTone(a.review)"
              >
                {{ reviewLabel(a.review) }}
              </span>
            </div>
            <div
              v-if="a.items?.length"
              class="cg-art-thumbs"
            >
              <div
                v-for="(it, i) in a.items"
                :key="i"
                class="cg-art-thumb"
                :class="{ 'is-picked': it.picked, 'is-rejected': it.review === 'rejected' }"
              >
                <img
                  :src="it.url"
                  alt=""
                >
                <span class="cg-art-thumb-name">{{ it.label ?? `候选 ${i + 1}` }}</span>
                <div class="cg-art-thumb-actions">
                  <button
                    class="cg-tiny"
                    type="button"
                    :disabled="it.picked"
                    @click="emit('pick-item', node.id, a.id, i)"
                  >
                    {{ it.picked ? '已选用' : '选用' }}
                  </button>
                  <button
                    class="cg-tiny"
                    type="button"
                    @click="emit('review-item', node.id, a.id, i, it.review === 'rejected' ? 'approved' : 'rejected')"
                  >
                    {{ it.review === 'rejected' ? '恢复' : '驳回' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="cg-art-actions">
              <button
                v-if="a.id !== shown?.id"
                class="cg-mini"
                type="button"
                @click="emit('pick', node.id, a.id)"
              >
                选用这一版
              </button>
              <button
                v-else
                class="cg-mini"
                type="button"
                disabled
              >
                当前选用
              </button>
              <button
                class="cg-mini"
                type="button"
                @click="emit('review', node.id, a.id, 'approved')"
              >
                认可
              </button>
              <button
                class="cg-mini"
                type="button"
                @click="emit('review', node.id, a.id, 'rejected')"
              >
                驳回
              </button>
              <button
                v-if="a.url"
                class="cg-mini"
                type="button"
                @click="emit('open-artifact', a)"
              >
                打开
              </button>
              <!-- 删的是**这一版**：当前选用的那版删不掉（服务端会拒），先改选再删。 -->
              <button
                v-if="a.id !== shown?.id"
                class="cg-mini cg-mini--danger"
                type="button"
                @click="emit('delete-artifact', a.id)"
              >
                删除
              </button>
            </div>
          </div>
        </section>

        <!-- 继续补充：带着选中的这一版接着改 -->
        <section
          v-if="shown && spec.stage === 'ready'"
          class="cg-block"
        >
          <p class="cg-block-title">
            继续补充 <span class="cg-block-sub">在第 {{ shown.version }} 版上改</span>
          </p>
          <textarea
            class="cg-input cg-input--area"
            :value="followUp"
            placeholder="还要改什么？例如：第 2 场太拖，压到 20 秒内"
            @input="updateFollowUp(($event.target as HTMLTextAreaElement).value)"
          />
          <button
            class="cg-mini cg-mini--accent cg-follow"
            type="button"
            :disabled="busy"
            @click="emit('continue', node.id)"
          >
            <i class="i-lucide-sparkles" /> 带补充再生成一版
          </button>
        </section>

        <!-- 运行记录 -->
        <section class="cg-block">
          <p class="cg-block-title">
            运行记录
          </p>
          <p
            v-if="!nodeRuns.length"
            class="cg-empty-line"
          >
            还没跑过
          </p>
          <div
            v-for="r in nodeRuns"
            :key="r.id"
            class="cg-run"
          >
            <span
              class="cg-run-state"
              :data-tone="r.status === 'done' ? 'ok' : r.status === 'failed' ? 'bad' : 'run'"
            >
              {{ r.status === 'done' ? '成功' : r.status === 'failed' ? '失败' : '运行中' }}
            </span>
            <span class="cg-run-cost">{{ r.costCredits ? creditsToYuan(r.costCredits) : '—' }}</span>
            <span
              v-if="r.baseArtifactId"
              class="cg-run-base"
            >改自 v{{ versions.find(a => a.id === r.baseArtifactId)?.version ?? '?' }}</span>
            <span class="cg-run-hash">#{{ r.paramsHash }}</span>
          </div>
          <p
            v-if="nodeRuns[0]?.error"
            class="cg-run-error"
          >
            {{ nodeRuns[0].error }}
          </p>
        </section>
      </div>
    </template>

    <div
      v-else
      class="cg-detail-empty"
    >
      <i class="i-lucide-mouse-pointer-click" />
      <p>点一个节点看它的参数、产物版本和运行记录</p>
      <p class="cg-detail-empty-sub">
        共 {{ graph.nodes.length }} 个节点 · {{ graph.edges.length }} 条连线
      </p>
    </div>
  </aside>
</template>
