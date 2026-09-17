<script setup lang="ts">
/**
 * 画布（织幕）—— 节点工作台，前端先行版。
 *
 * 照界面原型重画：顶栏（缩放 / 适应画布 / 重置示例 / 运行全部）、左栏节点库、
 * 无限画布（端口拖线）、节点卡（内容预览 + 节点内运行）、右栏节点详情（参数 / 产物版本 / 运行记录）。
 *
 * 数据模型与后端契约见 aicodcms/docs/canvas/ZHIMU-DATA-MODEL-R2.md：
 *   产物是实体、依赖是数据、审核的对象是产物。
 *
 * 当前是**示例数据**（顶部有标记）：后端 canvas_run / canvas_artifact 两张表还没建，
 * 所以节点内运行走本地模拟，把「运行 → 出新版本 → 下游变脏」这条链路先跑通；
 * 后端就绪后把 runNode() 里的 simulateRun 换成真接口即可，其余不用改。
 */
import { MarkerType, VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'

import type {
  CanvasArtifact,
  CanvasGraph,
  CanvasNode,
  CanvasNodeState,
  CanvasRun
} from '~/data/canvas-graph'
import {
  NODE_STATE_META,
  addNode,
  artifactsOf,
  connectNodes,
  createNode,
  dirtyNodes,
  disconnect,
  expandShotlist,
  makeEdge,
  nextVersion,
  nodeState,
  paramsHash,
  pendingReviewCount,
  removeNode,
  selectArtifact,
  topoOrder
} from '~/data/canvas-graph'
import type { CanvasNodeKind, CanvasParamSpec } from '~/data/canvas-nodes'
import { creditsToYuan, framesToSeconds, groupMeta, nodeTypeSpec, portMeta } from '~/data/canvas-nodes'
import { buildCanvasSample } from '~/data/canvas-sample'

useHead({ title: '画布 · 织幕' })

// ---------------------------------------------------------------- 状态

const sample = buildCanvasSample()
const graph = ref<CanvasGraph>(sample.graph)
const artifacts = ref<CanvasArtifact[]>(sample.artifacts)
const runs = ref<CanvasRun[]>(sample.runs)

/** 示例数据模式：显式开关，顶部挂标记，免得把演示数据当成真数据。 */
const demo = ref(true)
const selectedId = ref('')
const toast = ref('')
const detailOpen = ref(true)
const runningIds = ref<string[]>([])
const modelOptions = ref<{ value: string, label: string }[]>([])

const hgApi = useHougongApi()

const { fitView, zoomIn, zoomOut, viewport, screenToFlowCoordinate } = useVueFlow()

const selected = computed(() => graph.value.nodes.find(n => n.id === selectedId.value) ?? null)
const selectedSpec = computed(() => (selected.value ? nodeTypeSpec(selected.value.kind) : null))
const pending = computed(() => pendingReviewCount(artifacts.value))
const totalCost = computed(() => runs.value.reduce((sum, r) => sum + (r.costCredits ?? 0), 0))
const runningCount = computed(() => runs.value.filter(r => r.status === 'running').length)
const readyCount = computed(() =>
  graph.value.nodes.filter(n => nodeState(graph.value, n, runs.value) === 'ready').length
)
const dirtyCount = computed(() =>
  dirtyNodes(graph.value, runs.value).filter((id) => {
    const node = graph.value.nodes.find(n => n.id === id)
    // 未开放的节点不算"待重跑"：它跑不了，挂个数字只会让人以为图是脏的
    return node ? nodeTypeSpec(node.kind).stage === 'ready' : false
  }).length
)

function showToast(text: string): void {
  toast.value = text
  window.setTimeout(() => {
    if (toast.value === text) toast.value = ''
  }, 2600)
}

function stateOf(node: CanvasNode): CanvasNodeState {
  return nodeState(graph.value, node, runs.value)
}

// ---------------------------------------------------------------- Vue Flow 节点与边

const flowNodes = computed<Node[]>(() =>
  graph.value.nodes.map(n => ({
    id: n.id,
    type: 'cg',
    position: { x: n.at.x, y: n.at.y },
    data: {
      node: n,
      spec: nodeTypeSpec(n.kind),
      state: stateOf(n),
      artifacts: artifacts.value.filter(a => a.nodeId === n.id)
    }
  }))
)

const flowEdges = computed<Edge[]>(() => {
  const list: Edge[] = []
  for (const e of graph.value.edges) {
    const from = graph.value.nodes.find(n => n.id === e.from.node)
    if (!from) continue
    const port = nodeTypeSpec(from.kind).outputs.find(p => p.slot === e.from.slot)
    const color = port ? portMeta(port.type).color : 'var(--hg3-line-strong)'
    list.push({
      id: e.id,
      source: e.from.node,
      target: e.to.node,
      sourceHandle: e.from.slot,
      targetHandle: e.to.slot,
      type: 'smoothstep',
      animated: stateOf(from) === 'running',
      style: { stroke: color, strokeWidth: 1.6 },
      markerEnd: MarkerType.ArrowClosed
    })
  }
  return list
})

function onConnect(connection: { source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null }): void {
  if (!connection.sourceHandle || !connection.targetHandle) return
  const res = connectNodes(
    graph.value,
    { node: connection.source, slot: connection.sourceHandle },
    { node: connection.target, slot: connection.targetHandle }
  )
  if (!res.ok) showToast(res.reason)
}

function onNodeDragStop(event: { node: { id: string, position: { x: number, y: number } } }): void {
  const node = graph.value.nodes.find(n => n.id === event.node.id)
  if (node) node.at = { x: Math.round(event.node.position.x), y: Math.round(event.node.position.y) }
}

function onEdgesChange(changes: { type: string, id?: string }[]): void {
  for (const c of changes) {
    if (c.type === 'remove' && c.id) disconnect(graph.value, c.id)
  }
}

// ---------------------------------------------------------------- 增删节点

/** 找一个空位：已有节点最下方的下一行，避免新节点盖在别人身上。 */
function freeSpot(): { x: number, y: number } {
  if (!graph.value.nodes.length) return { x: 80, y: 120 }
  const maxY = Math.max(...graph.value.nodes.map(n => n.at.y))
  const minX = Math.min(...graph.value.nodes.map(n => n.at.x))
  return { x: minX, y: maxY + 200 }
}

function add(kind: CanvasNodeKind, at?: { x: number, y: number }): void {
  const node = createNode(kind, at ?? freeSpot())
  addNode(graph.value, node)
  selectedId.value = node.id
  if (nodeTypeSpec(kind).stage === 'planned') showToast('这个节点本版未开放，先把结构摆上')
}

/** 拖拽落点：把屏幕坐标换算成画布坐标。 */
function onDrop(event: DragEvent): void {
  const kind = event.dataTransfer?.getData('application/x-canvas-node') as CanvasNodeKind | ''
  if (!kind) return
  const point = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  add(kind, { x: Math.round(point.x), y: Math.round(point.y) })
}

function duplicate(nodeId: string): void {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node) return
  const copy = createNode(node.kind, { x: node.at.x + 40, y: node.at.y + 40 }, `${node.title} 副本`, node.ref?.shotIdx)
  copy.params = { ...node.params }
  addNode(graph.value, copy)
  selectedId.value = copy.id
}

function rename(nodeId: string, title: string): void {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (node) node.title = title
}

function drop(nodeId: string): void {
  removeNode(graph.value, nodeId)
  if (selectedId.value === nodeId) selectedId.value = ''
  showToast('节点已删除')
}

/** 把上游已选定的产物补进新节点的输入槽（分镜表 → 关键帧这种批量生成的场景要用）。 */
function hydrateInputs(): void {
  for (const node of graph.value.nodes) {
    for (const edge of graph.value.edges.filter(e => e.to.node === node.id)) {
      const upstream = graph.value.nodes.find(n => n.id === edge.from.node)
      const ref = upstream?.outputs[edge.from.slot]
      if (upstream && ref && !node.inputs[edge.to.slot]) {
        node.inputs[edge.to.slot] = { from: upstream.id, slot: edge.from.slot, ...ref }
      }
    }
  }
}

/**
 * 方案 A：按分镜表批量生成「首帧 + 视频」节点。
 *
 * 分镜表自动连到首帧的「这一镜的分镜」和视频的「这一镜关键词」；**人物与场景不替用户猜** ——
 * 沿用图里已有首帧节点的接法（多数集里同一批人/场景反复用），要改就在图上重新连。
 */
function expand(nodeId: string): void {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node) return
  const rows = selectedTableRows.value.length
  if (!rows) {
    showToast('分镜表还没有内容，先运行「分镜生成」')
    return
  }
  const res = expandShotlist(graph.value, nodeId, rows)
  graph.value.nodes.push(...res.nodes)
  graph.value.edges.push(...res.edges)

  const template = [...graph.value.nodes]
    .reverse()
    .find(n => n.kind === 'keyframe' && n.inputs.person && n.inputs.scene && !res.keyframes.includes(n))
  if (template) {
    for (const kf of res.keyframes) {
      for (const slot of ['person', 'scene'] as const) {
        const ref = template.inputs[slot]
        if (!ref) continue
        kf.inputs[slot] = { ...ref }
        if (!graph.value.edges.some(e => e.to.node === kf.id && e.to.slot === slot)) {
          graph.value.edges.push(makeEdge(ref.from, ref.slot, kf.id, slot))
        }
      }
    }
  }
  hydrateInputs()
  showToast(template
    ? `已按分镜表生成 ${rows} 组节点，人物与场景沿用了已有的接法`
    : `已按分镜表生成 ${rows} 组节点，记得把人物和场景接上首帧`)
}

// ---------------------------------------------------------------- 运行

/**
 * 跑一个节点。
 *
 * 现在是本地模拟：写一条 running 的 run → 一会儿写产物、写 done。
 * 后端接上以后，这里换成 POST /canvas/node/{id}/run + SSE 回推，其余逻辑不变。
 */
async function runNode(nodeId: string, opts: { silent?: boolean } = {}): Promise<void> {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node) return
  const spec = nodeTypeSpec(node.kind)
  if (spec.stage === 'planned') {
    if (!opts.silent) showToast('这个节点本版未开放')
    return
  }
  const state = stateOf(node)
  if (state === 'blocked') {
    if (!opts.silent) showToast('上游还没就绪，先跑上游节点')
    return
  }
  if (state === 'running') return

  runningIds.value = [...runningIds.value, nodeId]
  const run: CanvasRun = {
    id: `r_${nodeId}_${Date.now().toString(36)}`,
    nodeId,
    paramsHash: paramsHash(node),
    status: 'running',
    startedAt: new Date().toISOString()
  }
  runs.value = [...runs.value, run]

  await simulateRun(node, run)

  runningIds.value = runningIds.value.filter(id => id !== nodeId)
}

/** 本地模拟：出一个新版本的产物，并把它设成当前选定（下游输入随之更新）。 */
async function simulateRun(node: CanvasNode, run: CanvasRun): Promise<void> {
  await new Promise(resolve => window.setTimeout(resolve, 900 + Math.random() * 700))
  completeRun(node, run)
}

/** 结算一条运行：写产物 + 标记成功。示例数据里预置的"运行中"也走这里落地。 */
function completeRun(node: CanvasNode, run: CanvasRun): void {
  if (run.status !== 'running') return
  const spec = nodeTypeSpec(node.kind)
  const slot = spec.outputs[0]?.slot ?? 'text'
  const type = spec.outputs[0]?.type ?? 'text'

  const version = nextVersion(artifacts.value, node.id, slot)
  const note = artifactNote(node, type)
  const artifact: CanvasArtifact = {
    id: `a_${node.id}_${version}`,
    nodeId: node.id,
    slot,
    type,
    version,
    note,
    review: 'pending',
    createdAt: new Date().toISOString()
  }
  if (type === 'image' || type === 'video') {
    artifact.url = `/mock/home/explore-0${(version % 4) + 1}.png`
  }
  if (type === 'text') artifact.text = String(node.params.text ?? '')
  if (type === 'outline') artifact.text = '拆解完成：场次与镜头已分好，可继续生成角色与分镜表'
  if (type === 'table') {
    artifact.rows = Array.from({ length: 3 }, (_, i) => ({
      idx: i + 1,
      shotSize: ['远景', '中景', '特写'][i % 3]!,
      camera: ['固定', '缓慢推近', '跟拍'][i % 3]!,
      frames: [124, 158, 141][i % 3]!,
      scene: 'SC-新场次',
      keyframePrompt: '示例提示词（本地模拟生成）'
    }))
    artifact.note = '3 镜'
  }
  if (type === 'audio') artifact.note = '配音 + 配乐'
  if (type === 'zip') artifact.note = 'E01 全镜'

  artifacts.value = [...artifacts.value, artifact]
  selectArtifact(graph.value, artifact)
  runs.value = runs.value.map(r =>
    r.id === run.id
      ? { ...r, status: 'done', costCredits: spec.estimateCredits ?? 0, finishedAt: new Date().toISOString() }
      : r
  )
}

/** 示例数据里预置了一条"运行中"的 run：挂载后让它落地，免得顶栏一直显示运行中。 */
function settleSeededRuns(): void {
  for (const run of [...runs.value].filter(r => r.status === 'running')) {
    const node = graph.value.nodes.find(n => n.id === run.nodeId)
    if (!node) continue
    window.setTimeout(() => completeRun(node, run), 2000)
  }
}

function artifactNote(node: CanvasNode, type: string): string {
  if (type === 'image') {
    if (node.kind === 'character') return '三视图 3 张'
    if (node.kind === 'scene') return '环境参考 1 张'
    return '3 张 · 768x1344'
  }
  if (type === 'video') {
    const tier = String(node.params.tier ?? 'preview')
    const frames = Number(node.params.frames ?? 158)
    return `${tier === 'final' ? '768x1344' : '432x768'} · ${framesToSeconds(frames)}s`
  }
  return ''
}

/** 运行全部：只跑脏节点，按拓扑序一个一个来（重复点应该零花费）。 */
async function runAll(): Promise<void> {
  const queue = dirtyNodes(graph.value, runs.value).filter((id) => {
    const node = graph.value.nodes.find(n => n.id === id)
    return node ? nodeTypeSpec(node.kind).stage === 'ready' && stateOf(node) !== 'blocked' : false
  })
  if (!queue.length) {
    showToast('没有需要重跑的节点（参数和输入都没变）')
    return
  }
  showToast(`开始运行 ${queue.length} 个节点`)
  for (const id of queue) {
    const node = graph.value.nodes.find(n => n.id === id)
    if (!node || stateOf(node) === 'blocked') continue
    await runNode(id, { silent: true })
  }
  showToast(`运行完成：${queue.length} 个节点`)
}

// ---------------------------------------------------------------- 产物操作

function pick(nodeId: string, artifactId: string): void {
  const artifact = artifacts.value.find(a => a.id === artifactId)
  if (!artifact) return
  selectArtifact(graph.value, artifact)
}

function review(nodeId: string, artifactId: string, action: 'approved' | 'rejected'): void {
  artifacts.value = artifacts.value.map(a => (a.id === artifactId ? { ...a, review: action } : a))
  showToast(action === 'approved' ? '已认可这一份' : '已驳回，产物还在，可重跑')
}

function openArtifact(artifact: CanvasArtifact): void {
  if (artifact.url) window.open(artifact.url, '_blank')
}

// ---------------------------------------------------------------- 详情面板

const shownArtifact = computed(() => {
  const node = selected.value
  if (!node || !selectedSpec.value) return undefined
  const slot = selectedSpec.value.outputs[0]?.slot
  if (!slot) return undefined
  const list = artifactsOf(artifacts.value, node.id, slot)
  const picked = node.outputs[slot]
  return list.find(a => a.id === picked?.artifactId) ?? list[0]
})

const nodeVersions = computed(() => {
  const node = selected.value
  if (!node || !selectedSpec.value) return []
  const slot = selectedSpec.value.outputs[0]?.slot
  return slot ? artifactsOf(artifacts.value, node.id, slot) : []
})

const nodeRuns = computed(() => {
  const node = selected.value
  if (!node) return []
  return [...runs.value].filter(r => r.nodeId === node.id).reverse().slice(0, 4)
})

const selectedTableRows = computed(() => {
  const node = selected.value
  if (!node) return []
  const board = graph.value.nodes.find(n => n.kind === 'shotlist')
  const slot = board?.outputs.table?.artifactId
  const artifact = artifacts.value.find(a => a.id === slot)
  return artifact?.rows ?? []
})

function setParam(node: CanvasNode, key: string, value: unknown): void {
  node.params = { ...node.params, [key]: value }
}

function paramValue(node: CanvasNode, key: string): string {
  const v = node.params[key]
  return v === undefined || v === null ? '' : String(v)
}

function paramOptions(p: CanvasParamSpec): { value: string, label: string }[] {
  if (p.key === 'modelId' && modelOptions.value.length) return modelOptions.value
  return p.options ?? []
}

// ---------------------------------------------------------------- 生命周期

const wideScreen = ref(true)
let mq: MediaQueryList | null = null
function syncWide(event?: MediaQueryListEvent): void {
  wideScreen.value = event ? event.matches : (mq?.matches ?? true)
}

onMounted(async () => {
  mq = window.matchMedia('(min-width: 900px)')
  syncWide()
  mq.addEventListener('change', syncWide)
  // 首屏适应一次，保证一进来就看得到整条产线
  window.setTimeout(() => fitView({ padding: 0.16, maxZoom: 0.86, minZoom: 0.4 }), 700)
  // 示例里预置的"运行中"落地，让状态机动起来
  settleSeededRuns()
  // 关键帧节点的模型下拉：有目录就用真目录，没有就留一句"服务端默认"
  try {
    const catalog = await hgApi.getCatalog()
    const list = (catalog.cloudModels ?? []).map(m => ({ value: m.id, label: m.name }))
    modelOptions.value = list.length ? list : [{ value: '', label: '服务端默认' }]
  } catch {
    modelOptions.value = [{ value: '', label: '服务端默认（目录未接通）' }]
  }
})

onBeforeUnmount(() => mq?.removeEventListener('change', syncWide))

function fit(): void {
  fitView({ padding: 0.16, maxZoom: 0.86, minZoom: 0.4 })
}

/** 重置示例：回到内置的那条产线（后端接通后这个按钮改成"载入模板"）。 */
function resetSample(): void {
  const fresh = buildCanvasSample()
  graph.value = fresh.graph
  artifacts.value = fresh.artifacts
  runs.value = fresh.runs
  selectedId.value = ''
  demo.value = true
  showToast('已重置为示例数据')
  window.setTimeout(fit, 120)
}

const zoomPercent = computed(() => `${Math.round((viewport.value?.zoom ?? 1) * 100)}%`)
</script>

<template>
  <div class="cg-page">
    <!-- 顶栏 -->
    <header class="cg-top">
      <div class="cg-top-left">
        <h1 class="cg-brand">
          织幕
        </h1>
        <span class="cg-tag">PROTOTYPE · AI 影剧无界画布</span>
        <span
          v-if="demo"
          class="cg-demo"
        >示例数据 · 本地模拟</span>
      </div>

      <div class="cg-top-mid">
        <span class="cg-metric"><i class="i-lucide-layers" /> 就绪 {{ readyCount }}/{{ graph.nodes.length }}</span>
        <span
          class="cg-metric"
          :data-tone="pending ? 'warn' : 'muted'"
        ><i class="i-lucide-bell" /> 待确认 {{ pending }}</span>
        <span
          v-if="dirtyCount"
          class="cg-metric"
          data-tone="warn"
        ><i class="i-lucide-refresh-cw" /> 待重跑 {{ dirtyCount }}</span>
        <span class="cg-metric"><i class="i-lucide-coins" /> {{ creditsToYuan(totalCost) }}</span>
      </div>

      <div class="cg-top-right">
        <div class="cg-zoom">
          <button
            type="button"
            title="缩小"
            @click="zoomOut()"
          >
            <i class="i-lucide-minus" />
          </button>
          <span>{{ zoomPercent }}</span>
          <button
            type="button"
            title="放大"
            @click="zoomIn()"
          >
            <i class="i-lucide-plus" />
          </button>
        </div>
        <button
          class="cg-ghost"
          type="button"
          @click="fit"
        >
          <i class="i-lucide-maximize" /> 适应画布
        </button>
        <button
          class="cg-ghost"
          type="button"
          @click="resetSample"
        >
          <i class="i-lucide-rotate-ccw" /> 重置示例
        </button>
        <button
          class="cg-primary"
          type="button"
          :disabled="!!runningCount"
          @click="runAll"
        >
          <i :class="runningCount ? 'i-lucide-loader-circle' : 'i-lucide-play'" />
          {{ runningCount ? `运行中 ${runningCount}` : '运行全部' }}
        </button>
      </div>
    </header>

    <div class="cg-body">
      <!-- 左栏节点库 -->
      <CanvasNodeLibrary @add="add" />

      <!-- 画布 -->
      <section
        class="cg-stage"
        @dragover.prevent
        @drop="onDrop"
      >
        <div
          v-if="wideScreen"
          class="cg-hint"
        >
          拖动空白处平移 · 滚轮缩放（或 Ctrl+滚轮）· 从端口小圆点拖出连线 · 连线只允许同类型
        </div>

        <ClientOnly>
          <VueFlow
            v-if="wideScreen"
            :nodes="flowNodes"
            :edges="flowEdges"
            :min-zoom="0.25"
            :max-zoom="1.6"
            :default-viewport="{ x: 40, y: 40, zoom: 0.6 }"
            :nodes-connectable="true"
            :nodes-draggable="true"
            :elements-selectable="true"
            :delete-key-code="null"
            class="cg-flow"
            @connect="onConnect"
            @node-drag-stop="onNodeDragStop"
            @edges-change="onEdgesChange"
            @pane-click="selectedId = ''"
          >
            <template #node-cg="{ id, data, selected: isSelected }">
              <CanvasNodeCard
                :id="id"
                :data="data"
                :selected="isSelected"
                @run="runNode"
                @expand="expand"
                @remove="drop"
                @duplicate="duplicate"
                @rename="rename"
                @pick="pick"
                @review="review"
                @open="selectedId = $event"
              />
            </template>

            <Background
              :gap="22"
              :size="1.4"
              pattern-color="rgba(255,255,255,0.07)"
            />
            <MiniMap
              pannable
              zoomable
              :node-color="(n) => groupMeta(nodeTypeSpec(graph.nodes.find(x => x.id === n.id)?.kind ?? 'script_in').group).color"
            />
          </VueFlow>

          <!-- 窄屏：画布没法用，退化成节点列表（同一份数据、同一套操作） -->
          <div
            v-else
            class="cg-narrow"
          >
            <button
              v-for="n in graph.nodes"
              :key="n.id"
              class="cg-narrow-item"
              type="button"
              :class="{ 'is-active': n.id === selectedId }"
              @click="selectedId = n.id"
            >
              <span
                class="cg-narrow-icon"
                :style="{ color: groupMeta(nodeTypeSpec(n.kind).group).color }"
              >
                <i :class="nodeTypeSpec(n.kind).icon" />
              </span>
              <span class="cg-narrow-text">
                <b>{{ n.title }}</b>
                <i>{{ nodeTypeSpec(n.kind).subtitle }}</i>
              </span>
              <span
                class="cg-narrow-state"
                :data-tone="NODE_STATE_META[stateOf(n)].tone"
              >{{ NODE_STATE_META[stateOf(n)].label }}</span>
            </button>
          </div>
        </ClientOnly>

        <p
          v-if="toast"
          class="cg-toast"
        >
          {{ toast }}
        </p>
      </section>

      <!-- 右栏：节点详情 -->
      <aside
        v-if="detailOpen"
        class="cg-detail"
      >
        <template v-if="selected && selectedSpec">
          <header class="cg-detail-head">
            <span
              class="cg-detail-icon"
              :style="{ color: groupMeta(selectedSpec.group).color }"
            >
              <i :class="selectedSpec.icon" />
            </span>
            <div class="cg-detail-title">
              <b>{{ selected.title }}</b>
              <i>{{ selectedSpec.subtitle }}</i>
            </div>
            <button
              type="button"
              title="收起"
              @click="detailOpen = false"
            >
              <i class="i-lucide-panel-right-close" />
            </button>
          </header>

          <div class="cg-detail-scroll">
            <!-- 状态与动作 -->
            <div class="cg-detail-state">
              <span
                class="cg-pill"
                :data-tone="NODE_STATE_META[stateOf(selected)].tone"
              >{{ NODE_STATE_META[stateOf(selected)].label }}</span>
              <span
                v-if="selected.ref?.shotIdx"
                class="cg-pill"
              >第 {{ selected.ref.shotIdx }} 镜</span>
              <button
                v-if="selectedSpec.stage === 'ready' && selected.kind === 'shotlist' && selectedTableRows.length"
                class="cg-mini"
                type="button"
                @click="expand(selected.id)"
              >
                生成节点（{{ selectedTableRows.length }} 镜）
              </button>
              <button
                v-else-if="selectedSpec.stage === 'ready'"
                class="cg-mini cg-mini--accent"
                type="button"
                :disabled="stateOf(selected) === 'running'"
                @click="runNode(selected.id)"
              >
                <i class="i-lucide-play" /> 运行这个节点
              </button>
              <span
                v-else
                class="cg-pill"
                data-tone="warn"
              >本版未开放</span>
            </div>

            <!-- 输入 -->
            <section
              v-if="selectedSpec.inputs.length"
              class="cg-block"
            >
              <p class="cg-block-title">
                输入
              </p>
              <div
                v-for="p in selectedSpec.inputs"
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
                  :data-tone="selected.inputs[p.slot] ? 'ok' : 'muted'"
                >
                  {{ selected.inputs[p.slot] ? `v${selected.inputs[p.slot]!.version} 已接` : '未接' }}
                </span>
              </div>
            </section>

            <!-- 参数 -->
            <section
              v-if="selectedSpec.params.length"
              class="cg-block"
            >
              <p class="cg-block-title">
                参数
              </p>
              <label
                v-for="p in selectedSpec.params"
                :key="p.key"
                class="cg-field"
              >
                <span class="cg-field-label">{{ p.label }}</span>
                <textarea
                  v-if="p.kind === 'textarea'"
                  class="cg-input cg-input--area"
                  :value="paramValue(selected, p.key)"
                  :placeholder="p.placeholder"
                  @input="setParam(selected, p.key, ($event.target as HTMLTextAreaElement).value)"
                />
                <select
                  v-else-if="p.kind === 'select'"
                  class="cg-input"
                  :value="paramValue(selected, p.key)"
                  @change="setParam(selected, p.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="o in paramOptions(p)"
                    :key="o.value"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
                <select
                  v-else-if="p.kind === 'frames'"
                  class="cg-input"
                  :value="paramValue(selected, p.key)"
                  @change="setParam(selected, p.key, Number(($event.target as HTMLSelectElement).value))"
                >
                  <option
                    v-for="f in graph.frameGrid"
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
                  :value="paramValue(selected, p.key)"
                  @input="setParam(selected, p.key, Number(($event.target as HTMLInputElement).value))"
                >
                <input
                  v-else
                  class="cg-input"
                  :value="paramValue(selected, p.key)"
                  :placeholder="p.placeholder"
                  @input="setParam(selected, p.key, ($event.target as HTMLInputElement).value)"
                >
                <span
                  v-if="p.hint"
                  class="cg-field-hint"
                >{{ p.hint }}</span>
              </label>
            </section>

            <!-- 产物版本 -->
            <section class="cg-block">
              <p class="cg-block-title">
                产物 <span class="cg-block-sub">{{ nodeVersions.length }} 个版本</span>
              </p>
              <p
                v-if="!nodeVersions.length"
                class="cg-empty-line"
              >
                还没有产物
              </p>
              <div
                v-for="a in nodeVersions"
                :key="a.id"
                class="cg-art"
                :class="{ 'is-on': a.id === shownArtifact?.id }"
              >
                <div class="cg-art-head">
                  <b>v{{ a.version }}</b>
                  <span>{{ a.note }}</span>
                  <span
                    class="cg-pill cg-pill--sm"
                    :data-tone="a.review === 'approved' ? 'ok' : a.review === 'rejected' ? 'bad' : 'warn'"
                  >
                    {{ a.review === 'approved' ? '已认可' : a.review === 'rejected' ? '已驳回' : '待确认' }}
                  </span>
                </div>
                <div class="cg-art-actions">
                  <button
                    v-if="a.id !== shownArtifact?.id"
                    class="cg-mini"
                    type="button"
                    @click="pick(selected.id, a.id)"
                  >
                    选用这份
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
                    @click="review(selected.id, a.id, 'approved')"
                  >
                    认可
                  </button>
                  <button
                    class="cg-mini"
                    type="button"
                    @click="review(selected.id, a.id, 'rejected')"
                  >
                    驳回
                  </button>
                  <button
                    v-if="a.url"
                    class="cg-mini"
                    type="button"
                    @click="openArtifact(a)"
                  >
                    打开
                  </button>
                </div>
              </div>
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

      <button
        v-if="!detailOpen"
        class="cg-detail-open"
        type="button"
        @click="detailOpen = true"
      >
        <i class="i-lucide-panel-right-open" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.cg-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--hg3-canvas);
  color: var(--hg3-ink);
}

/* 顶栏 */
.cg-top {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--hg3-topbar-h);
  flex: none;
  padding: 0 14px;
  border-bottom: 1px solid var(--hg3-line);
  background: var(--hg3-rail-active);
}

.cg-top-left { display: flex; align-items: center; gap: 9px; min-width: 0; }
.cg-brand { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: 0.06em; }

.cg-tag {
  padding: 2px 7px;
  font-size: 9.5px;
  letter-spacing: 0.1em;
  color: var(--hg3-muted);
  background: rgb(255 255 255 / 6%);
  border-radius: 5px;
  white-space: nowrap;
}

.cg-demo {
  padding: 2px 8px;
  font-size: 10.5px;
  color: var(--hg3-warn);
  background: rgb(255 180 84 / 12%);
  border-radius: 999px;
  white-space: nowrap;
}

.cg-top-mid { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.cg-metric { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--hg3-muted); white-space: nowrap; }
.cg-metric[data-tone='warn'] { color: var(--hg3-warn); }

.cg-top-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }

.cg-zoom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  font-size: 11.5px;
  color: var(--hg3-muted);
  background: rgb(255 255 255 / 5%);
  border-radius: 999px;
}

.cg-zoom button { display: inline-flex; color: var(--hg3-muted); }
.cg-zoom button:hover { color: var(--hg3-ink); }

.cg-ghost,
.cg-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
  border-radius: 999px;
}

.cg-ghost { color: var(--hg3-ink); background: rgb(255 255 255 / 7%); }
.cg-ghost:hover { background: rgb(255 255 255 / 12%); }
.cg-primary { font-weight: 600; color: var(--hg3-accent-ink); background: var(--hg3-accent); }
.cg-primary:hover:not(:disabled) { background: var(--hg3-accent-hi); }
.cg-primary:disabled { opacity: 0.6; cursor: progress; }

/* 主体 */
.cg-body { display: flex; flex: 1; min-height: 0; }

.cg-stage { position: relative; flex: 1; min-width: 0; }

.cg-flow { width: 100%; height: 100%; background: var(--hg3-canvas); }

.cg-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 5;
  transform: translateX(-50%);
  padding: 5px 12px;
  font-size: 11px;
  color: var(--hg3-muted);
  background: rgb(0 0 0 / 42%);
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.cg-toast {
  position: absolute;
  bottom: 20px;
  left: 50%;
  z-index: 30;
  transform: translateX(-50%);
  margin: 0;
  padding: 7px 14px;
  font-size: 12px;
  color: var(--hg3-ink);
  background: rgb(0 0 0 / 72%);
  border: 1px solid var(--hg3-line-strong);
  border-radius: 999px;
}

.cg-narrow { padding: 12px; overflow-y: auto; height: 100%; }

.cg-narrow-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 8px;
  padding: 10px 12px;
  text-align: left;
  background: var(--hg3-card);
  border-radius: 12px;
}

.cg-narrow-item.is-active { box-shadow: inset 0 0 0 1px var(--hg3-accent-line); }
.cg-narrow-icon { font-size: 16px; }
.cg-narrow-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.cg-narrow-text b { font-size: 12.5px; }
.cg-narrow-text i { font-size: 10.5px; font-style: normal; color: var(--hg3-faint); }

.cg-narrow-state,
.cg-pill {
  padding: 2px 7px;
  font-size: 10.5px;
  color: var(--hg3-muted);
  background: rgb(255 255 255 / 6%);
  border-radius: 999px;
  white-space: nowrap;
}

.cg-pill--sm { font-size: 9.5px; padding: 1px 6px; }
.cg-pill[data-tone='ok'],
.cg-narrow-state[data-tone='ok'] { color: var(--hg3-ok); background: rgb(46 223 154 / 12%); }
.cg-pill[data-tone='run'],
.cg-narrow-state[data-tone='run'] { color: var(--hg3-run); background: rgb(101 198 251 / 12%); }
.cg-pill[data-tone='warn'],
.cg-narrow-state[data-tone='warn'] { color: var(--hg3-warn); background: rgb(255 180 84 / 12%); }
.cg-pill[data-tone='bad'],
.cg-narrow-state[data-tone='bad'] { color: var(--hg3-i-coral); background: rgb(255 112 122 / 12%); }

/* 右栏详情 */
.cg-detail {
  display: flex;
  flex-direction: column;
  width: 326px;
  flex: none;
  min-height: 0;
  border-left: 1px solid var(--hg3-line);
  background: var(--hg3-rail-active);
}

.cg-detail-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 12px 11px;
  border-bottom: 1px solid var(--hg3-line);
}

.cg-detail-icon { font-size: 17px; }
.cg-detail-title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.cg-detail-title b { font-size: 13px; }
.cg-detail-title i { font-size: 10.5px; font-style: normal; color: var(--hg3-faint); }
.cg-detail-head button { color: var(--hg3-faint); }
.cg-detail-head button:hover { color: var(--hg3-ink); }

.cg-detail-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px 24px; }

.cg-detail-state { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }

.cg-block { padding: 10px 0; border-top: 1px solid var(--hg3-line); }
.cg-block-title { margin: 0 0 8px; font-size: 11.5px; color: var(--hg3-muted); }
.cg-block-sub { color: var(--hg3-faint); }

.cg-input-row { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
.cg-port-dot { width: 6px; height: 6px; border-radius: 50%; }
.cg-input-name { font-size: 11.5px; color: var(--hg3-ink); }
.cg-input-val { margin-left: auto; font-size: 10.5px; color: var(--hg3-faint); }
.cg-input-val[data-tone='ok'] { color: var(--hg3-ok); }

.cg-field { display: block; margin-bottom: 10px; }
.cg-field-label { display: block; margin-bottom: 4px; font-size: 11px; color: var(--hg3-muted); }
.cg-field-hint { display: block; margin-top: 3px; font-size: 10px; color: var(--hg3-faint); }

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

.cg-input--area { min-height: 66px; resize: vertical; line-height: 1.5; }
.cg-input:focus { outline: none; border-color: var(--hg3-accent-line); }

.cg-art {
  margin-bottom: 8px;
  padding: 8px 9px;
  background: var(--hg3-card);
  border-radius: 10px;
  border: 1px solid transparent;
}

.cg-art.is-on { border-color: var(--hg3-accent-line); }
.cg-art-head { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--hg3-muted); }
.cg-art-head b { color: var(--hg3-ink); }
.cg-art-head .cg-pill { margin-left: auto; }
.cg-art-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }

.cg-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  font-size: 11px;
  color: var(--hg3-ink);
  background: rgb(255 255 255 / 7%);
  border-radius: 999px;
}

.cg-mini:hover:not(:disabled) { background: rgb(255 255 255 / 13%); }
.cg-mini:disabled { opacity: 0.5; cursor: default; }
.cg-mini--accent { color: var(--hg3-accent-ink); background: var(--hg3-accent); }
.cg-mini--accent:hover:not(:disabled) { background: var(--hg3-accent-hi); }

.cg-empty-line { margin: 0; font-size: 11px; color: var(--hg3-faint); }

.cg-run { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 11px; }
.cg-run-state[data-tone='ok'] { color: var(--hg3-ok); }
.cg-run-state[data-tone='bad'] { color: var(--hg3-i-coral); }
.cg-run-state[data-tone='run'] { color: var(--hg3-run); }
.cg-run-cost { color: var(--hg3-muted); }
.cg-run-hash { margin-left: auto; color: var(--hg3-faint); font-size: 10px; }
.cg-run-error { margin: 4px 0 0; font-size: 10.5px; color: var(--hg3-i-coral); }

.cg-detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  padding: 30px;
  text-align: center;
  color: var(--hg3-faint);
}

.cg-detail-empty i { font-size: 22px; }
.cg-detail-empty p { margin: 0; font-size: 12px; }
.cg-detail-empty-sub { font-size: 11px; }

.cg-detail-open {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: var(--hg3-muted);
  background: var(--hg3-rail);
  border-radius: 8px;
}

@media (max-width: 1100px) {
  .cg-top-mid { display: none; }
}

@media (max-width: 900px) {
  .cg-detail { width: 100%; }
  .cg-lib { display: none; }
}
</style>
