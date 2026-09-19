<script setup lang="ts">
/**
 * 画布右侧详情面板：选中节点的状态、输入、参数、产物版本、运行记录。
 *
 * 从 canvas.vue 里整块搬出来的（那里曾到 2119 行，模板里这一块占 400 多行）。
 * 这里只负责显示与收集动作，**不做业务判断**：能不能跑、跑完是什么状态由页面决定。
 *
 * 自己算的东西（都是纯展示派生）：
 *   · 该节点**当前这一口**输出槽的产物版本、当前选用的是哪一版
 *   · 每个输入槽接了几条、其中几条已确认（按边算，见 incomingEdges 的注释）
 *   · 剪辑合成的片段顺序（按镜号，或被手动调过）
 *
 * 多口输出的节点（剧本拆解：人物列表 / 场景列表 / 分镜大纲）在这里先换口再看版本：
 * 早先本组件写死 `outputs[0]`，于是只有"人物列表"有地方看和改，另两口在图上有行字、
 * 点不开也进不了这一栏。
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
  streaming?: string
  error?: string
  drafts: Record<string, string>
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
  /** 当前在看哪一口输出槽（多口节点才有意义，由页面统一算，见 useCanvasSlots）。 */
  activeSlot: string
  /**
   * 上游"当前选用但还没认可"的那一版（角色设定用）。
   *
   * 有它就要在参数区明说一句：候选是从**已认可的旧版**退回来的 ——
   * 不说的话，用户只看到下拉里是 v2、而图上明明跑到 v3，会以为选错了版本。
   */
  /**
   * 上游那一口的下一步（认当前那版 / 改接当前那版）。
   *
   * 只描述"上游当前选用的那一版"和"这一步接的是哪一版"——
   * 动作永远向前，不提供"认可一个已经被超越的旧版"这种后退操作。
   */
  upstreamAdvice?: {
    kind: 'pending-current' | 'stale-wiring'
    label: string
    upstreamTitle: string
    version: number
    artifactId: string
    wired?: { version: number, approved: boolean }
    approve: boolean
    follow: boolean
  }
  /** 选中的角色/场景那一条的设定（出图按它来，得让人看见）。 */
  sourcePreview?: { title: string, description: string, from: string, label?: string }
  /** 这次会带哪几张参考图（首帧/视频），顺序就是上游收到的顺序。 */
  references?: { total: number, groups: { slotLabel: string, items: { index: number, label: string, thumb: string }[] }[] }
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
  (e: 'rerun', nodeId: string): void
  (e: 'draft', key: string, text?: string): void
  (e: 'expand', nodeId: string): void
  (e: 'param', nodeId: string, key: string, value: unknown): void
  (e: 'row-update', nodeId: string, index: number, key: keyof CanvasShotRow, value: string | number): void
  (e: 'rows-save', nodeId: string): void
  (e: 'rows-discard', nodeId: string): void
  (e: 'pick', nodeId: string, artifactId: string): void
  (e: 'pick-item', nodeId: string, artifactId: string, index: number): void
  (e: 'review', nodeId: string, artifactId: string, action: 'approved' | 'rejected'): void
  (e: 'approve-upstream', artifactId: string): void
  (e: 'follow-upstream', artifactId: string): void
  /** 放大看图/视频（不改变"选用哪一张"）。 */
  (e: 'preview', url: string, title: string, kind?: 'image' | 'video'): void
  (e: 'slot', nodeId: string, slot: string): void
  (e: 'text-save', nodeId: string, text: string): void
  (e: 'open-artifact', artifact: CanvasArtifact): void
  (e: 'delete-artifact', artifactId: string): void
  (e: 'update:followUp', value: string): void
  (e: 'continue', nodeId: string): void
  (e: 'move-fragment', index: number, dir: -1 | 1): void
}>()

/** 当前这一口输出槽（多口节点由页面记着，见 useCanvasSlots）。 */
const slot = computed(() => props.activeSlot || props.spec?.outputs[0]?.slot || '')

/** 该节点**这一口**的产物版本（新的在前）。 */
const versions = computed<CanvasArtifact[]>(() => {
  const node = props.node
  return node && slot.value ? artifactsOf(props.artifacts, node.id, slot.value) : []
})

/** 当前选用的那一版。 */
const shown = computed<CanvasArtifact | undefined>(() => {
  const node = props.node
  if (!node || !slot.value) return undefined
  const picked = node.outputs[slot.value]
  return picked ? versions.value.find(a => a.id === picked.artifactId) ?? versions.value[0] : versions.value[0]
})

/** 每一口产出了几版（换口按钮上的角标：未产出的口也要看得出是"还没跑"）。 */
function slotNote(s: string): string {
  const list = props.node ? artifactsOf(props.artifacts, props.node.id, s) : []
  return list.length ? `v${list[0]!.version}` : '未产出'
}

/** 当前这一口的中文名（产物列表标题上写出来，避免"看的是哪一口"要靠猜）。 */
const slotLabel = computed(() => props.spec?.outputs.find(o => o.slot === slot.value)?.label ?? '')

/**
 * 正文就地编辑（剧本、人物/场景列表、分镜大纲都走这里）。
 *
 * 与分镜表同一套规矩：先落草稿，点「保存为新版本」才落服务端 —— 服务端按 (node, slot)
 * 自增版本，老版本不动（`canvas_artifact` 一行一版）。
 */
const draftKey = computed(() => `${props.node?.id}:${slot.value}:${shown.value?.id || ''}`)
const textDraft = computed({
  get: () => props.drafts[draftKey.value] ?? shown.value?.text ?? '',
  set: (value: string) => emit('draft', draftKey.value, value)
})
const editingText = computed(() => props.drafts[draftKey.value] !== undefined)
const textDirty = computed(() => editingText.value && textDraft.value !== (shown.value?.text ?? ''))
const structuredDirty = textDirty
function startEditText(): void { emit('draft', draftKey.value, shown.value?.text || '') }
function discardText(): void { emit('draft', draftKey.value) }

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
  // **执行看的是引用，不是线**：服务端按节点 inputs 里的 artifactId 取产物（R2 §2
  // "依赖写在数据里"）。图上少画一条线（脚本建的图、模板套出来的图、或保存时只保留了
  // inputs）时，只看边就会显示"未接" —— 于是"视频都跑出来了、界面还说没接"
  // （用户 2026-09-19 反馈）。所以两边都算，并说清差在哪。
  const node = props.graph.nodes.find(n => n.id === nodeId)
  const refs = node?.inputs?.[slot] ?? []
  if (!edges.length && !refs.length) return '未接'
  const ok = refs.filter(ref => artifactOfRef(props.artifacts, ref)?.review === 'approved').length
  const count = refs.length || edges.length
  const base = `${count} 条 · ${ok} 条已确认`
  if (!edges.length) return `${base}（图上没画线，按引用执行）`
  if (!refs.length) return `${base}（只有线，还没记引用）`
  return base
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
            :disabled="structuredDirty || textDirty || ['running', 'blocked'].includes(state)"
            @click="emit('run', node.id)"
          >
            <i :class="state === 'running' ? 'i-lucide-loader-circle cg-spin' : 'i-lucide-play'" /> {{ state === 'running' ? '生成中…' : '运行这个节点' }}{{ estimate ? ` · 约 ${creditsToYuan(estimate)}` : '' }}
          </button>
          <span
            v-else
            class="cg-pill"
            data-tone="warn"
          >本版未开放</span>
        </div>

        <section
          v-if="state === 'running'"
          class="cg-block cg-live-output"
          aria-label="实时输出"
        >
          <CanvasStructuredOutput
            v-if="node.kind === 'script_split'"
            :output-slot="slot"
            :text="streaming || ''"
            streaming
          />
          <template v-else>
            <p
              class="cg-output-status"
              role="status"
            >
              <i class="i-lucide-loader-circle cg-spin" /> 正在生成 · {{ streaming?.length || 0 }} 字符
            </p>
            <pre class="cg-fulltext cg-stream-text">{{ streaming || '任务已提交，等待输出…' }}</pre>
          </template>
        </section>

        <!-- 多口输出：先换口，再看这一口的版本与正文（剧本拆解的三口各自独立） -->
        <section
          v-if="spec.outputs.length > 1"
          class="cg-block"
        >
          <p class="cg-block-title">
            输出口 <span class="cg-block-sub">这一口单独看版本、单独改</span>
          </p>
          <div class="cg-slot-tabs">
            <button
              v-for="p in spec.outputs"
              :key="p.slot"
              class="cg-slot-tab"
              :class="{ 'is-on': p.slot === slot }"
              type="button"
              @click="emit('slot', node.id, p.slot)"
            >
              <span
                class="cg-port-dot"
                :style="{ background: portMeta(p.type).color }"
              />
              <b>{{ p.label }}</b>
              <i>{{ slotNote(p.slot) }}</i>
            </button>
          </div>
        </section>

        <!-- 当前选用产物的正文（剧本/大纲要能整段读，也要能改） -->
        <section
          v-if="state !== 'running' && (shown?.text || editingText)"
          class="cg-block"
        >
          <p class="cg-block-title">
            当前选用 · v{{ shown?.version }} 正文
            <span class="cg-block-sub">改完存新版本，老版本不动</span>
          </p>
          <CanvasStructuredOutput
            v-if="node.kind === 'script_split' && shown"
            :key="shown.id"
            :output-slot="slot"
            :text="shown.text || ''"
            :disabled="busy"
            :draft="drafts[draftKey]"
            @draft="emit('draft', draftKey, $event)"
            @save="emit('text-save', node.id, $event)"
          />
          <template v-else-if="editingText">
            <textarea
              class="cg-input cg-input--area cg-fulltext-edit"
              :value="textDraft"
              placeholder="直接改这一版正文"
              @input="textDraft = ($event.target as HTMLTextAreaElement).value"
            />
            <div class="cg-row-actions">
              <button
                class="cg-mini cg-mini--accent"
                type="button"
                :disabled="!textDirty"
                @click="emit('text-save', node.id, textDraft)"
              >
                <i class="i-lucide-save" /> 保存为新版本
              </button>
              <button
                class="cg-mini"
                type="button"
                @click="discardText"
              >
                放弃修改
              </button>
            </div>
          </template>
          <template v-else>
            <pre class="cg-fulltext">{{ shown?.text }}</pre>
            <div class="cg-row-actions">
              <button
                class="cg-mini"
                type="button"
                @click="startEditText"
              >
                <i class="i-lucide-pencil" /> 编辑正文
              </button>
            </div>
          </template>
        </section>

        <p
          v-if="error"
          class="cg-run-error"
          role="alert"
        >
          {{ error }}。请同步状态后重试。
        </p>
        <section
          v-if="error && streaming"
          class="cg-block"
        >
          <p>未完成的输出（未保存为产物）</p><pre class="cg-fulltext">{{ streaming }}</pre>
        </section>
        <button
          v-if="spec.stage === 'ready' && shown"
          class="cg-mini"
          type="button"
          :disabled="textDirty || tableDirty || ['running', 'blocked'].includes(state)"
          @click="emit('rerun', node.id)"
        >
          重新生成（忽略缓存）
        </button>
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

        <!--
          上游那一口的下一步。动作**只对着上游当前选用的那一版**：
          v5 已认可、这一步还接在没认可的 v4 上时，给的是「改用 v5」，不是「认可 v4」
          （把用户往后退的那种按钮，用户 2026-09-19 直接指出来了）。
        -->
        <section
          v-if="upstreamAdvice"
          class="cg-block cg-pending-upstream"
        >
          <template v-if="upstreamAdvice.kind === 'pending-current'">
            <p class="cg-block-title">
              上游「{{ upstreamAdvice.label }}」当前选用 v{{ upstreamAdvice.version }} 还没认可
            </p>
            <p class="cg-empty-line">
              版本归上游节点管：可以在「{{ upstreamAdvice.upstreamTitle }}」里认可它，也可以点下面的按钮。
              <template v-if="upstreamAdvice.wired">
                这一步现在接的是 v{{ upstreamAdvice.wired.version }}<template v-if="!upstreamAdvice.wired.approved">
                  （也没认可）
                </template>。
              </template>
            </p>
            <div class="cg-row-actions">
              <button
                class="cg-mini cg-mini--accent"
                type="button"
                @click="emit('approve-upstream', upstreamAdvice.artifactId)"
              >
                <i class="i-lucide-check" /> 认可 v{{ upstreamAdvice.version }}
              </button>
              <button
                v-if="upstreamAdvice.follow"
                class="cg-mini"
                type="button"
                @click="emit('follow-upstream', upstreamAdvice.artifactId)"
              >
                <i class="i-lucide-git-branch" /> 改用 v{{ upstreamAdvice.version }}
              </button>
            </div>
          </template>

          <template v-else>
            <p class="cg-block-title">
              上游「{{ upstreamAdvice.label }}」已确认 v{{ upstreamAdvice.version }}
            </p>
            <p class="cg-empty-line">
              <template v-if="upstreamAdvice.wired && !upstreamAdvice.wired.approved">
                这一步还接在没认可的 v{{ upstreamAdvice.wired.version }} 上 —— 改接上游已确认的那版就能往下跑。
              </template>
              <template v-else-if="upstreamAdvice.wired">
                这一步还接在 v{{ upstreamAdvice.wired.version }} 上；改接新版后要重新选一次。
              </template>
              <template v-else>
                这一步还没接上产物的版本 —— 改接一下再用。
              </template>
            </p>
            <div class="cg-row-actions">
              <button
                class="cg-mini cg-mini--accent"
                type="button"
                @click="emit('follow-upstream', upstreamAdvice.artifactId)"
              >
                <i class="i-lucide-git-branch" /> 改用 v{{ upstreamAdvice.version }}
              </button>
            </div>
          </template>
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
            :source-preview="sourcePreview"
            :references="references"
            @update="(key: string, value: unknown) => emit('param', node!.id, key, value)"
            @preview="(url: string, title: string) => emit('preview', url, title)"
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
            <video
              v-if="f.artifact?.url"
              :src="f.artifact.url"
              alt=""
              class="cg-frag-thumb"
              muted
              preload="metadata"
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
            </video>
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

        <!-- 产物版本（换口后列的就是这一口的版本） -->
        <section class="cg-block">
          <p class="cg-block-title">
            产物 <span class="cg-block-sub">{{ slotLabel ? `${slotLabel} · ` : '' }}{{ versions.length }} 个版本</span>
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
                  title="点一下看大图"
                  @click="emit('preview', it.url, it.label ?? `候选 ${i + 1}`)"
                >
                <span class="cg-art-thumb-name">{{ it.label ?? `候选 ${i + 1}` }}</span>
                <div class="cg-art-thumb-actions">
                  <button
                    class="cg-tiny"
                    type="button"
                    :disabled="it.picked || busy"
                    @click="emit('pick-item', node.id, a.id, i)"
                  >
                    {{ it.picked ? '已选用' : '选用' }}
                  </button>
                  <button
                    class="cg-tiny"
                    type="button"
                    title="放大看（不改变选用）"
                    @click="emit('preview', it.url, it.label ?? `候选 ${i + 1}`)"
                  >
                    放大
                  </button>
                </div>
              </div>
            </div>

            <video
              v-if="a.url && (a.type === 'video' || a.type === 'cut')"
              :src="a.url"
              controls
              preload="metadata"
              class="cg-media"
            />
            <audio
              v-else-if="a.url && a.type === 'audio'"
              :src="a.url"
              controls
              preload="metadata"
              class="cg-media"
            />
            <img
              v-else-if="a.url && a.type === 'image' && !a.items?.length"
              :src="a.url"
              class="cg-media"
              alt="生成产物"
            >
            <p
              v-if="a.items?.length"
              class="cg-empty-line"
            >
              审核以整个版本为单位；可选用其中一张作为下游参考。
            </p>
            <div class="cg-art-actions">
              <button
                v-if="a.id !== shown?.id"
                class="cg-mini"
                type="button"
                :disabled="busy"
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
                :disabled="busy || structuredDirty || textDirty || tableDirty || state === 'running'"
                @click="emit('review', node.id, a.id, 'approved')"
              >
                确认此版本，供下游使用
              </button>
              <button
                class="cg-mini"
                type="button"
                :disabled="busy || state === 'running'"
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
