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
import { MarkerType, SelectionMode, VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
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
  CanvasRun,
  CanvasShotRow
} from '~/data/canvas-graph'
import {
  NODE_STATE_META,
  addNode,
  artifactsOf,
  connectNodes,
  createNode,
  dirtyNodes,
  disconnect,
  artifactOfRef,
  buildExportManifest,
  incomingEdges,
  expandShotlist,
  fragmentOrder,
  isDirty,
  inputRefs,
  makeEdge,
  nextVersion,
  nodeState,
  paramsHash,
  pendingReviewCount,
  removeNode,
  selectArtifact,
  topoOrder,
  withItemPicked,
  withItemReview
} from '~/data/canvas-graph'
import type { ContextMenuItem } from '~/components/canvas/ContextMenu.vue'
import type { CanvasNodeKind, CanvasParamSpec, CanvasPortSpec } from '~/data/canvas-nodes'
import { CANVAS_GROUPS, CANVAS_NODE_TYPES, canConnect, creditsToYuan, framesToSeconds, groupMeta, nodeTypeSpec, portMeta } from '~/data/canvas-nodes'
import { createHistory } from '~/data/canvas-history'
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
/** 正在流式输出的文本（真接口接上后由 SSE 推，现在本地逐字模拟）。 */
const streaming = ref<Record<string, string>>({})
/** 「继续补充」的输入：在这一版基础上还想改什么。 */
const followUp = ref('')
/** 右键菜单：点到了什么 + 屏幕坐标。 */
const menu = ref<{ x: number, y: number, kind: 'node' | 'pane' | 'edge' | 'selection' | 'connect', nodeId?: string, edgeId?: string } | null>(null)
// ---------------------------------------------------------------- 撤销 / 重做
//
// 做法：整图快照（graph + artifacts 的 JSON），深监听变化后压栈，上限 50 步。
// 为什么不做细粒度命令模式：一张图才十几个节点，快照最省事也最不容易漏 ——
// 参数改动、连线、成组选用、分镜表编辑全都会被同一条监听抓到。
// **runs 不进快照**：任务与花费是账本，撤销不该把它抹掉。

interface CanvasSnapshot { graph: string, artifacts: string }

/**
 * 快照比较：图或产物任一不同才算变化。
 * runs 不进快照 —— 任务与花费是账本，撤销不该把账抹掉。
 */
function sameSnapshot(a: CanvasSnapshot, b: CanvasSnapshot): boolean {
  return a.graph === b.graph && a.artifacts === b.artifacts
}

const history = createHistory<CanvasSnapshot>(50, sameSnapshot)
/** 让撤销/重做按钮跟着历史栈变化重新渲染（历史本身是纯对象）。 */
const historyVersion = ref(0)
/** 正在应用历史（避免撤销本身又被记成一步）。 */
let applyingHistory = false
let historyTimer: number | undefined

function snapshotNow(): CanvasSnapshot {
  return { graph: JSON.stringify(graph.value), artifacts: JSON.stringify(artifacts.value) }
}

function applySnapshot(snap: CanvasSnapshot): void {
  applyingHistory = true
  graph.value = JSON.parse(snap.graph) as CanvasGraph
  artifacts.value = JSON.parse(snap.artifacts) as CanvasArtifact[]
  if (selectedId.value && !graph.value.nodes.some(n => n.id === selectedId.value)) selectedId.value = ''
  nextTick(() => {
    applyingHistory = false
  })
}

// 建立基线：没有它，第一次改动就没有"上一步"可回
history.reset(snapshotNow())

watch(
  [graph, artifacts],
  () => {
    if (applyingHistory) return
    window.clearTimeout(historyTimer)
    historyTimer = window.setTimeout(() => {
      history.push(snapshotNow())
      historyVersion.value++
    }, 260)
  },
  { deep: true }
)

const canUndo = computed(() => {
  void historyVersion.value
  return history.canUndo()
})
const canRedo = computed(() => {
  void historyVersion.value
  return history.canRedo()
})

function undo(): void {
  window.clearTimeout(historyTimer)
  const previous = history.undo()
  if (!previous) return
  historyVersion.value++
  applySnapshot(previous)
  showToast('已撤销')
}

function redo(): void {
  const next = history.redo()
  if (!next) return
  historyVersion.value++
  applySnapshot(next)
  showToast('已重做')
}

/** 拖线落地那一刻的出发端口（菜单按它算候选；拖拽过程中的变量会被清空）。 */
const connectFromSnapshot = ref<{ nodeId: string, slot: string, type: 'source' | 'target' } | null>(null)

/** 画布内部的剪贴板（不碰系统剪贴板）：复制一个节点，右键空白粘贴。 */
const clipboard = ref<{ kind: CanvasNodeKind, title: string, params: Record<string, unknown> } | null>(null)
/** 每次运行带进来的临时输入（补充要求），按 runId 存，模拟用。 */
const runInputs = new Map<string, { followUp?: string }>()
/** 每一步用的模型不一样：按节点声明的 modelKind 分桶，参数里的「模型」下拉按桶填。 */
const modelOptions = ref<Record<string, { value: string, label: string }[]>>({})

const hgApi = useHougongApi()

const {
  fitView,
  zoomIn,
  zoomOut,
  viewport,
  screenToFlowCoordinate,
  nodes: flowGraphNodes,
  addSelectedNodes,
  removeSelectedNodes
} = useVueFlow()

/** 当前选中的节点数（框选、Cmd+click、Cmd+A 都算）。 */
const selectedCount = computed(() => flowGraphNodes.value.filter(n => n.selected).length)

function selectAll(): void {
  addSelectedNodes(flowGraphNodes.value)
}

function clearSelection(): void {
  removeSelectedNodes(flowGraphNodes.value)
  selectedId.value = ''
}

/** 选中的节点 id 列表。 */
function selectedNodeIds(): string[] {
  return flowGraphNodes.value.filter(n => n.selected).map(n => n.id)
}

const selected = computed(() => graph.value.nodes.find(n => n.id === selectedId.value) ?? null)
const selectedSpec = computed(() => (selected.value ? nodeTypeSpec(selected.value.kind) : null))
const pending = computed(() => pendingReviewCount(artifacts.value))
const totalCost = computed(() => runs.value.reduce((sum, r) => sum + (r.costCredits ?? 0), 0))
const runningCount = computed(() => runs.value.filter(r => r.status === 'running').length)
const readyCount = computed(() =>
  graph.value.nodes.filter(n => nodeState(graph.value, n, runs.value) === 'ready').length
)
/**
 * 「待重跑」= 现在真的能跑、且需要跑的节点数。
 *
 * 未开放的（planned）不算；等待上游、等待确认的也不算 —— 它们不是"脏"，
 * 是卡在别的东西上，混进来只会让人以为点一下「运行全部」就能推下去。
 */
const dirtyCount = computed(() =>
  dirtyNodes(graph.value, runs.value).filter((id) => {
    const node = graph.value.nodes.find(n => n.id === id)
    if (!node) return false
    if (nodeTypeSpec(node.kind).stage !== 'ready') return false
    const st = stateOf(node)
    return st !== 'blocked' && st !== 'awaiting' && st !== 'running'
  }).length
)

function showToast(text: string): void {
  toast.value = text
  window.setTimeout(() => {
    if (toast.value === text) toast.value = ''
  }, 2600)
}

function stateOf(node: CanvasNode): CanvasNodeState {
  return nodeState(graph.value, node, runs.value, artifacts.value)
}

/** 这一步用的模型名（没选就写"默认模型"）。每一步的模型各不相同。 */
function modelLabelOf(node: CanvasNode): string {
  const spec = nodeTypeSpec(node.kind)
  if (!spec.modelKind) return ''
  const id = String(node.params.modelId ?? '')
  const list = modelOptions.value[spec.modelKind] ?? []
  return list.find(o => o.value === id)?.label ?? (id || '默认模型')
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
      dirty: isDirty(n, runs.value),
      artifacts: artifacts.value.filter(a => a.nodeId === n.id),
      modelLabel: modelLabelOf(n),
      streaming: streaming.value[n.id]
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

/**
 * 拖线时的即时校验：类型不对的端口根本连不上（不用等松手才报错）。
 *
 * 与 connectNodes() 里的校验同一套规则，这里只是提前到"拖的时候"。
 */
function isValidConnection(connection: { source?: string | null, target?: string | null, sourceHandle?: string | null, targetHandle?: string | null }): boolean {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false
  const from = graph.value.nodes.find(n => n.id === connection.source)
  const to = graph.value.nodes.find(n => n.id === connection.target)
  if (!from || !to || from.id === to.id) return false
  const outPort = nodeTypeSpec(from.kind).outputs.find(p => p.slot === connection.sourceHandle)
  const inPort = nodeTypeSpec(to.kind).inputs.find(p => p.slot === connection.targetHandle)
  if (!outPort || !inPort) return false
  if (!canConnect(outPort.type, inPort.type)) return false
  if (!inPort.multiple && (to.inputs[inPort.slot] ?? []).length > 0) return false
  return true
}

// ---------------------------------------------------------------- 连线拖到空白处 → 建节点并自动接上

/** 这次拖线是从哪个端口出发的（松手时若没接上任何端口，就用来挑一个新节点）。 */
let connectFrom: { nodeId: string, slot: string, type: 'source' | 'target' } | null = null
let connectMade = false

function onConnectStart(payload: { nodeId?: string, handleId: string | null, handleType?: 'source' | 'target' }): void {
  connectMade = false
  connectFrom = payload.nodeId && payload.handleId && payload.handleType
    ? { nodeId: payload.nodeId, slot: payload.handleId, type: payload.handleType }
    : null
}

/**
 * 拖到空白处松手：弹出节点选择，选完自动建节点并连上。
 *
 * 这是画布上最顺手的建节点路径 —— 不用先建再连，也不用从节点库里找。
 */
function onConnectEnd(event?: MouseEvent | TouchEvent): void {
  if (connectMade || !connectFrom || !event) return
  const from = connectFrom
  connectFrom = null
  const { x, y } = pointOf(event)
  connectFromSnapshot.value = from
  menu.value = { x, y, kind: 'connect', nodeId: from.nodeId }
}

function onConnect(connection: { source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null }): void {
  connectMade = true
  connectFrom = null
  if (!connection.sourceHandle || !connection.targetHandle) return
  const res = connectNodes(
    graph.value,
    { node: connection.source, slot: connection.sourceHandle },
    { node: connection.target, slot: connection.targetHandle }
  )
  if (!res.ok) showToast(res.reason)
}

/**
 * 拖动结束把位置写回图。
 *
 * 为什么要遍历全部节点而不是只写被抓的那个：多选拖动时（框选后拖其中任意一个），
 * Vue Flow 会把选中的一起移动，只写一个会让其余节点"弹回原位"。
 */
function onNodeDragStop(): void {
  for (const flowNode of flowGraphNodes.value) {
    const node = graph.value.nodes.find(n => n.id === flowNode.id)
    if (node) node.at = { x: Math.round(flowNode.position.x), y: Math.round(flowNode.position.y) }
  }
}

function onEdgesChange(changes: { type: string, id?: string }[]): void {
  for (const c of changes) {
    if (c.type === 'remove' && c.id) disconnect(graph.value, c.id)
  }
}

// ---------------------------------------------------------------- 右键菜单

/** 右键位置：鼠标与触摸两种事件都取一下（触屏长按也会走这里）。 */
function pointOf(event: MouseEvent | TouchEvent): { x: number, y: number } {
  if ('clientX' in event) return { x: event.clientX, y: event.clientY }
  const touch = event.touches[0] ?? event.changedTouches[0]
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 }
}

function openNodeMenu(payload: { event: MouseEvent | TouchEvent, node: { id: string } }): void {
  const { x, y } = pointOf(payload.event)
  selectedId.value = payload.node.id
  menu.value = { x, y, kind: 'node', nodeId: payload.node.id }
}

function openSelectionMenu(payload: { event: MouseEvent, nodes: { id: string }[] }): void {
  menu.value = { x: payload.event.clientX, y: payload.event.clientY, kind: 'selection' }
}

function openPaneMenu(event: MouseEvent): void {
  menu.value = { x: event.clientX, y: event.clientY, kind: 'pane' }
}

function openEdgeMenu(payload: { event: MouseEvent | TouchEvent, edge: { id: string } }): void {
  const { x, y } = pointOf(payload.event)
  menu.value = { x, y, kind: 'edge', edgeId: payload.edge.id }
}

function closeMenu(): void {
  menu.value = null
}

/** 右键菜单里的"新增节点"：按分组列出全部节点类型。 */
const addNodeItems = computed<ContextMenuItem[]>(() =>
  CANVAS_GROUPS.map(g => ({
    key: `add:${g.key}`,
    label: g.label,
    icon: 'i-lucide-folder',
    children: CANVAS_NODE_TYPES.filter(t => t.group === g.key).map(t => ({
      key: `add:${t.kind}`,
      label: t.label,
      icon: t.icon,
      hint: t.stage === 'planned' ? '未开放' : undefined
    }))
  })).filter(g => (g.children?.length ?? 0) > 0)
)

const nodeMenuItems = computed<ContextMenuItem[]>(() => {
  const node = graph.value.nodes.find(n => n.id === menu.value?.nodeId)
  if (!node) return []
  const spec = nodeTypeSpec(node.kind)
  const cost = estimateOf(node)
  return [
    { key: 'edit', label: '编辑 / 详情', icon: 'i-lucide-sliders-horizontal' },
    { key: 'rename', label: '重命名', icon: 'i-lucide-pen-line' },
    { key: 'duplicate', label: '复制节点', icon: 'i-lucide-copy', hint: '⌘C' },
    { key: 'copy', label: '复制到剪贴板', icon: 'i-lucide-clipboard-copy' },
    { key: 'run', label: '运行这个节点', icon: 'i-lucide-play', hint: cost ? `约 ${creditsToYuan(cost)}` : undefined, disabled: spec.stage !== 'ready' || stateOf(node) === 'blocked' || stateOf(node) === 'awaiting' },
    { key: 'collapse', label: node.collapsed ? '展开节点' : '折叠节点', icon: node.collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up' },
    { key: 'detach', label: '断开全部连线', icon: 'i-lucide-unlink', disabled: !graph.value.edges.some(e => e.from.node === node.id || e.to.node === node.id) },
    { key: 'remove', label: '删除节点', icon: 'i-lucide-trash-2', danger: true, hint: '⌫' }
  ]
})

const paneMenuItems = computed<ContextMenuItem[]>(() => [
  ...addNodeItems.value,
  { key: 'paste', label: '粘贴节点', icon: 'i-lucide-clipboard-paste', hint: clipboard.value ? clipboard.value.title : undefined, disabled: !clipboard.value },
  { key: 'select-all', label: '全选', icon: 'i-lucide-box-select', hint: '⌘A' },
  { key: 'deselect', label: '取消选择', icon: 'i-lucide-mouse-pointer-click', hint: 'Esc', disabled: !selectedCount.value && !selectedId.value },
  { key: 'undo', label: '撤销', icon: 'i-lucide-undo-2', hint: '⌘Z', disabled: !canUndo.value },
  { key: 'redo', label: '重做', icon: 'i-lucide-redo-2', hint: '⇧⌘Z', disabled: !canRedo.value },
  { key: 'collapse-all', label: '全部折叠', icon: 'i-lucide-minimize-2' },
  { key: 'expand-all', label: '全部展开', icon: 'i-lucide-maximize-2' },
  { key: 'fit', label: '适应画布', icon: 'i-lucide-maximize' },
  { key: 'reset', label: '重置示例', icon: 'i-lucide-rotate-ccw' },
  { key: 'run-all', label: '运行全部', icon: 'i-lucide-play', hint: estimatedBatch.value ? `约 ${creditsToYuan(estimatedBatch.value)}` : undefined }
])

/**
 * 拖线到空白处松手后的候选节点：**能接上的排前面并可用，接不上的置灰**。
 *
 * 判据是端口类型：从输出端口拖出来，就找有新节点里能吃这个类型的输入端口。
 */
const connectMenuItems = computed<ContextMenuItem[]>(() => {
  const fromId = menu.value?.nodeId
  const from = graph.value.nodes.find(n => n.id === fromId)
  const snap = connectFromSnapshot.value
  if (!from || !snap) return []
  const fromPort = snap.type === 'source'
    ? nodeTypeSpec(from.kind).outputs.find(p => p.slot === snap.slot)
    : nodeTypeSpec(from.kind).inputs.find(p => p.slot === snap.slot)
  if (!fromPort) return []

  const usable = (kind: CanvasNodeKind): CanvasPortSpec | undefined => {
    const spec = nodeTypeSpec(kind)
    const ports = snap.type === 'source' ? spec.inputs : spec.outputs
    return ports.find(p => canConnect(fromPort.type, p.type))
  }

  const all = CANVAS_NODE_TYPES.map(t => ({
    key: `connect:${t.kind}`,
    label: t.label,
    icon: t.icon,
    hint: usable(t.kind) ? t.subtitle : '类型接不上',
    disabled: !usable(t.kind) || t.stage === 'planned'
  }))
  return [...all.filter(i => !i.disabled), ...all.filter(i => i.disabled)]
})

/** 框选/多选之后右键，给的是批量动作。 */
const selectionMenuItems = computed<ContextMenuItem[]>(() => [
  { key: 'run-selected', label: `运行所选 ${selectedCount.value} 个`, icon: 'i-lucide-play' },
  { key: 'copy-selected', label: '复制所选', icon: 'i-lucide-copy' },
  { key: 'collapse-selected', label: '折叠所选', icon: 'i-lucide-minimize-2' },
  { key: 'delete-selected', label: `删除所选 ${selectedCount.value} 个`, icon: 'i-lucide-trash-2', danger: true },
  { key: 'deselect', label: '取消选择', icon: 'i-lucide-mouse-pointer-click', hint: 'Esc' }
])

const edgeMenuItems = computed<ContextMenuItem[]>(() => [
  { key: 'disconnect', label: '断开这条连线', icon: 'i-lucide-scissors', danger: true }
])

/** 复制到画布剪贴板（参数一起带走，连线不带）。 */
function copyNode(nodeId: string): void {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node) return
  clipboard.value = { kind: node.kind, title: node.title, params: { ...node.params } }
  showToast(`已复制「${node.title}」，右键空白处粘贴`)
}

function pasteNode(at?: { x: number, y: number }): void {
  const clip = clipboard.value
  if (!clip) return
  const spot = at ?? freeSpot()
  const node = createNode(clip.kind, spot, clip.title)
  node.params = { ...clip.params }
  addNode(graph.value, node)
  selectedId.value = node.id
  showToast(`已粘贴「${node.title}」`)
}

/**
 * 从拖线落地处建节点并接上。
 *
 * 方向自动判：从输出端口拖出来 → 新节点吃它（找新节点里同类型的输入端口）；
 * 从输入端口拖出来 → 新节点喂它（找新节点里同类型的输出端口）。
 */
function connectNewNode(kind: CanvasNodeKind, spot: { x: number, y: number }): void {
  const snap = connectFromSnapshot.value
  const node = createNode(kind, spot)
  addNode(graph.value, node)

  if (snap) {
    const src = graph.value.nodes.find(n => n.id === snap.nodeId)
    if (src) {
      const srcSpec = nodeTypeSpec(src.kind)
      const fromPort = snap.type === 'source'
        ? srcSpec.outputs.find(p => p.slot === snap.slot)
        : srcSpec.inputs.find(p => p.slot === snap.slot)
      const newSpec = nodeTypeSpec(kind)
      const ports = snap.type === 'source' ? newSpec.inputs : newSpec.outputs
      const hit = fromPort ? ports.find(p => canConnect(fromPort.type, p.type)) : undefined
      if (fromPort && hit) {
        const res = snap.type === 'source'
          ? connectNodes(graph.value, { node: src.id, slot: snap.slot }, { node: node.id, slot: hit.slot })
          : connectNodes(graph.value, { node: node.id, slot: hit.slot }, { node: src.id, slot: snap.slot })
        if (res.ok) hydrateInputs()
        else showToast(res.reason)
      }
    }
  }

  selectedId.value = node.id
  connectFromSnapshot.value = null
}

/** 断开一个节点的全部连线（含它下游的输入引用）。 */
function detachNode(nodeId: string): void {
  const edges = graph.value.edges.filter(e => e.from.node === nodeId || e.to.node === nodeId)
  for (const e of edges) disconnect(graph.value, e.id)
  showToast(`已断开 ${edges.length} 条连线`)
}

/** 菜单选中后执行。 */
function onMenuPick(key: string): void {
  const target = menu.value
  const at = target ? screenToFlowCoordinate({ x: target.x, y: target.y }) : undefined
  closeMenu()

  if (key.startsWith('connect:')) {
    const kind = key.slice(8) as CanvasNodeKind
    connectNewNode(kind, at ? { x: Math.round(at.x), y: Math.round(at.y) } : freeSpot())
    return
  }

  if (key.startsWith('add:')) {
    const value = key.slice(4)
    const type = CANVAS_NODE_TYPES.find(t => t.kind === value)
    if (type) add(type.kind, at ? { x: Math.round(at.x), y: Math.round(at.y) } : undefined)
    return
  }

  const nodeId = target?.nodeId
  switch (key) {
    case 'edit': detailOpen.value = true; break
    case 'rename': if (nodeId) renameInline(nodeId); break
    case 'duplicate': if (nodeId) duplicate(nodeId); break
    case 'copy': if (nodeId) copyNode(nodeId); break
    case 'run': if (nodeId) void runNode(nodeId); break
    case 'detach': if (nodeId) detachNode(nodeId); break
    case 'remove': if (nodeId) drop(nodeId); break
    case 'paste': pasteNode(at ? { x: Math.round(at.x), y: Math.round(at.y) } : undefined); break
    case 'fit': fit(); break
    case 'reset': resetSample(); break
    case 'run-all': void runAll(); break
    case 'collapse': {
      const node = graph.value.nodes.find(n => n.id === nodeId)
      if (node) node.collapsed = !node.collapsed
      break
    }
    case 'collapse-all': for (const n of graph.value.nodes) n.collapsed = true; break
    case 'expand-all': for (const n of graph.value.nodes) n.collapsed = false; break
    case 'select-all': selectAll(); break
    case 'deselect': clearSelection(); break
    case 'undo': undo(); break
    case 'redo': redo(); break
    case 'delete-selected': deleteSelected(); break
    case 'collapse-selected': for (const id of selectedNodeIds()) { const n = graph.value.nodes.find(x => x.id === id); if (n) n.collapsed = true } break
    case 'copy-selected': {
      const ids = selectedNodeIds()
      const first = graph.value.nodes.find(n => n.id === ids[0])
      if (first) copyNode(first.id)
      // 复制多个：贴的时候逐个落位（用同一份剪贴板依次粘贴太绕，这里先支持一个 + 提示）
      if (ids.length > 1) showToast(`已复制「${first?.title ?? ''}」（多选批量复制先只带第一个）`)
      break
    }
    case 'run-selected': void runSelected(); break
    case 'disconnect': if (target?.edgeId) disconnect(graph.value, target.edgeId); break
  }
}

/** 删除选中的多个节点。 */
function deleteSelected(): void {
  const ids = selectedNodeIds()
  for (const id of ids) removeNode(graph.value, id)
  if (ids.includes(selectedId.value)) selectedId.value = ''
  showToast(`已删除 ${ids.length} 个节点`)
}

/** 依次运行选中的节点（跳过错过的：等上游/等确认的）。 */
async function runSelected(): Promise<void> {
  const ids = selectedNodeIds()
  let done = 0
  for (const id of ids) {
    const node = graph.value.nodes.find(n => n.id === id)
    if (!node) continue
    const st = stateOf(node)
    if (st === 'blocked' || st === 'awaiting' || st === 'running') continue
    await runNode(id, { silent: true })
    done++
  }
  showToast(done ? `已运行 ${done} 个节点` : '选中的节点都在等上游或等确认，没跑')
}

/** 重命名：把名字送给节点卡，让它进入输入态（简单起见用 prompt 之外的方式：直接改）。 */
function renameInline(nodeId: string): void {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node) return
  selectedId.value = nodeId
  detailOpen.value = true
  // 卡片上的 ⋯ 菜单里有重命名输入框；这里直接聚焦详情面板的名字字段
  showToast('在右侧详情里改，或点节点右上的 ⋯ → 重命名')
}

// ---------------------------------------------------------------- 键盘快捷键（复制 / 粘贴 / 删除 / Esc）

function onKeydown(event: KeyboardEvent): void {
  const el = event.target as HTMLElement | null
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  if (typing) return

  const mod = event.metaKey || event.ctrlKey
  if (mod && event.key.toLowerCase() === 'c' && selectedId.value) {
    copyNode(selectedId.value)
    return
  }
  if (mod && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selectAll()
    return
  }
  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if (mod && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
    return
  }
  if (mod && event.key.toLowerCase() === 'v') {
    pasteNode()
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const ids = selectedNodeIds()
    if (ids.length) {
      event.preventDefault()
      deleteSelected()
      return
    }
    if (selectedId.value) {
      event.preventDefault()
      drop(selectedId.value)
      return
    }
  }
  if (event.key === 'Escape') {
    closeMenu()
    clearSelection()
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
      if (!upstream || !ref) continue
      const list = node.inputs[edge.to.slot] ?? []
      if (!list.some(r => r.from === upstream.id && r.slot === edge.from.slot)) {
        list.push({ from: upstream.id, slot: edge.from.slot, ...ref })
        node.inputs[edge.to.slot] = list
      }
    }
  }
}

/** 某个输入槽接了几条、其中几条已确认（详情面板显示用）。 */
function inputSummary(node: CanvasNode, slot: string): string {
  const edges = incomingEdges(graph.value, node.id, [slot])
  if (!edges.length) return '未接'
  const ok = edges.filter((e) => {
    const up = graph.value.nodes.find(n => n.id === e.from.node)
    const ref = up?.outputs[e.from.slot]
    return ref ? artifacts.value.find(a => a.id === ref.artifactId)?.review === 'approved' : false
  }).length
  return `${edges.length} 条 · ${ok} 条已确认`
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
    .find(n => n.kind === 'keyframe' && inputRefs(n, 'person').length && inputRefs(n, 'scene').length && !res.keyframes.includes(n))
  if (template) {
    for (const kf of res.keyframes) {
      for (const slot of ['person', 'scene'] as const) {
        const ref = inputRefs(template, slot)[0]
        if (!ref) continue
        kf.inputs[slot] = [{ ...ref }]
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
async function runNode(
  nodeId: string,
  opts: { silent?: boolean, base?: CanvasArtifact, followUp?: string } = {}
): Promise<void> {
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
  if (state === 'awaiting') {
    if (!opts.silent) showToast('上游产物还没确认 —— 先在上游节点里点「认可」，再跑这一步')
    return
  }
  if (state === 'running') return

  runningIds.value = [...runningIds.value, nodeId]
  const run: CanvasRun = {
    id: `r_${nodeId}_${Date.now().toString(36)}`,
    nodeId,
    // 「继续补充」时带上基础版本：模型在原稿上改，而不是从零重写
    baseArtifactId: opts.base?.id,
    paramsHash: paramsHash(node),
    status: 'running',
    startedAt: new Date().toISOString()
  }
  if (opts.followUp) runInputs.set(run.id, { followUp: opts.followUp })
  runs.value = [...runs.value, run]

  await simulateRun(node, run)

  runningIds.value = runningIds.value.filter(id => id !== nodeId)
}

/** 本地模拟：出一个新版本的产物，并把它设成当前选定（下游输入随之更新）。 */
async function simulateRun(node: CanvasNode, run: CanvasRun): Promise<void> {
  const type = nodeTypeSpec(node.kind).outputs[0]?.type ?? 'text'
  if (type === 'text' || type === 'outline') {
    // 文本类走流式（真接口是 SSE）：逐字推给界面，人能看到它在写
    await streamInto(node.id, buildText(node, run))
  } else {
    await new Promise(resolve => window.setTimeout(resolve, 900 + Math.random() * 700))
  }
  completeRun(node, run)
}

/** 本地模拟的流式输出：每 30ms 推几个字。 */
async function streamInto(nodeId: string, full: string): Promise<void> {
  streaming.value = { ...streaming.value, [nodeId]: '' }
  for (let i = 4; i <= full.length; i += 4) {
    await new Promise(resolve => window.setTimeout(resolve, 30))
    streaming.value = { ...streaming.value, [nodeId]: full.slice(0, i) }
  }
  streaming.value = { ...streaming.value, [nodeId]: full }
}

/**
 * 本地模拟"模型写出来的东西"。
 *
 * 真接口接上后这一段整个删掉 —— 文本由模型流式返回，这里只是为了让界面先跑起来。
 */
function buildText(node: CanvasNode, run: CanvasRun): string {
  const ask = String(node.params.prompt ?? '').trim()
  const instruction = String(node.params.instruction ?? '').trim()
  const base = run.baseArtifactId ? artifacts.value.find(a => a.id === run.baseArtifactId) : undefined
  const follow = runInputs.get(run.id)?.followUp
  const spec = nodeTypeSpec(node.kind)

  let body: string
  if (node.kind === 'script_gen') {
    const title = ask ? ask.slice(0, 14) : '回魂夜'
    body = `第 1 集 · ${title}\n\n`
      + '场 1 破庙 · 夜（外）\n暴雨敲着残破的屋脊。少年抱着断了腿的纸灯躲进来，神像的阴影里有人先到。\n\n'
      + '场 2 灵堂 · 夜（内）\n白幡低垂，棺木半开。他认出供桌上的名字——那是他自己。\n\n'
      + `（按「${ask || '破庙里少年的奇遇'}」写的第 1 稿，${spec.subtitle}）`
  } else if (node.kind === 'script_split') {
    body = '人物：少年（主角）· 守夜人（反派）\n'
      + '场景：破庙 · 夜 / 灵堂 · 夜\n'
      + '分镜大纲：3 场 · 3 镜（远景破庙 → 中景回头 → 特写瞳孔）\n'
      + `（拆解依据：${instruction || '默认拆法'}）`
  } else {
    body = `${spec.label}完成：按「${ask || instruction || '当前设置'}」产出的第 ${nextVersion(artifacts.value, node.id, spec.outputs[0]?.slot ?? 'text')} 版`
  }

  if (base?.text) {
    body = `（在第 ${base.version} 版基础上改：${follow || instruction || '按新要求重写'}）\n\n${body}`
  } else if (follow) {
    body = `（补充要求：${follow}）\n\n${body}`
  }
  return body
}

/** 继续补充：带着这一版 + 新的补充要求重跑，产出下一版。 */
async function continueFrom(nodeId: string): Promise<void> {
  const base = shownArtifact.value
  if (!base) return
  const note = followUp.value.trim()
  if (!note) {
    showToast('先写一句"还要改什么"')
    return
  }
  followUp.value = ''
  await runNode(nodeId, { base, followUp: note })
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
  if (type === 'image') {
    // 一次出一组候选：三视图 3 张 / 场景 1~3 张 / 首帧 3 张（参数里可改）
    const labels = node.kind === 'character'
      ? ['正面', '侧面', '背面']
      : node.kind === 'scene'
        ? ['全景', '中景', '近景']
        : ['候选 1', '候选 2', '候选 3']
    const want = node.kind === 'scene'
      ? Number(node.params.angles ?? 1)
      : Number(node.params.count ?? node.params.views ?? 3)
    const count = Math.max(1, Math.min(3, Number.isFinite(want) ? want : 3))
    artifact.items = Array.from({ length: count }, (_, i) => ({
      url: `/mock/home/explore-0${((version + i) % 4) + 1}.png`,
      label: labels[i] ?? `候选 ${i + 1}`,
      // 第一张默认选用：人可以直接改，也可以先跑下游
      picked: i === 0
    }))
    artifact.pickedIndex = 0
    artifact.url = artifact.items[0]!.url
  } else if (type === 'video') {
    artifact.url = `/mock/home/explore-0${(version % 4) + 1}.png`
  }
  if (type === 'text' || type === 'outline') {
    artifact.text = buildText(node, run)
    const rest = { ...streaming.value }
    delete rest[node.id]
    streaming.value = rest
  }
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
  if (type === 'zip') {
    // 导出不是"随便打个包"：挑片、写清谁没进来、谁的参数对不上
    const { manifest, note: zipNote } = buildExportManifest(graph.value, artifacts.value, node)
    artifact.manifest = manifest
    artifact.note = zipNote
  }

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
    if (!node) return false
    if (nodeTypeSpec(node.kind).stage !== 'ready') return false
    // 等待上游 / 等待确认的都不跑：不是"脏"，是"卡在人的确认上"
    const st = stateOf(node)
    return st !== 'blocked' && st !== 'awaiting'
  })
  if (!queue.length) {
    showToast('没有需要重跑的节点（参数和输入都没变）')
    return
  }
  showToast(`开始运行 ${queue.length} 个节点`)
  for (const id of queue) {
    const node = graph.value.nodes.find(n => n.id === id)
    if (!node) continue
    const st = stateOf(node)
    if (st === 'blocked' || st === 'awaiting') continue
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

/** 组内选用第几张 —— 三视图/首帧"挑一张"，选中的那张才往下走。 */
function pickItem(nodeId: string, artifactId: string, index: number): void {
  artifacts.value = withItemPicked(graph.value, artifacts.value, artifactId, index)
  showToast(`已选用第 ${index + 1} 张，下游按这张走`)
}

/** 组内逐张驳回（三视图里"侧面那张不行"）。 */
function reviewItem(nodeId: string, artifactId: string, index: number, action: 'approved' | 'rejected'): void {
  artifacts.value = withItemReview(artifacts.value, artifactId, index, action)
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

/** 剪辑合成要拼的片段顺序（默认按镜号；手动调过就按存的顺序）。 */
const fragments = computed(() => {
  const node = selected.value
  if (!node || node.kind !== 'compose') return []
  return fragmentOrder(graph.value, node).map(f => ({
    ...f,
    artifact: f.artifactId ? artifacts.value.find(a => a.id === f.artifactId) : undefined
  }))
})

/** 手动调顺序：存成 orderIds（产物 id 的顺序），顺序一变就算"参数变了"。 */
function moveFragment(index: number, dir: -1 | 1): void {
  const node = selected.value
  if (!node) return
  const ids = fragments.value.map(f => f.upstreamId)
  const j = index + dir
  if (j < 0 || j >= ids.length) return
  const a = ids[index]!
  ids[index] = ids[j]!
  ids[j] = a
  node.params = { ...node.params, orderIds: ids }
}

/** 跑一次大约花多少（分）。 */
function estimateOf(node: CanvasNode): number {
  return nodeTypeSpec(node.kind).estimateCredits ?? 0
}

/** 「运行全部」这一遍的预估花费：只算真会跑的节点。 */
const estimatedBatch = computed(() =>
  dirtyNodes(graph.value, runs.value).reduce((sum, id) => {
    const node = graph.value.nodes.find(n => n.id === id)
    if (!node) return sum
    if (nodeTypeSpec(node.kind).stage !== 'ready') return sum
    const st = stateOf(node)
    if (st === 'blocked' || st === 'awaiting' || st === 'running') return sum
    return sum + estimateOf(node)
  }, 0)
)

const selectedTableRows = computed(() => {
  const node = selected.value
  if (!node) return []
  const board = graph.value.nodes.find(n => n.kind === 'shotlist')
  const slot = board?.outputs.table?.artifactId
  const artifact = artifacts.value.find(a => a.id === slot)
  return artifact?.rows ?? []
})

// ---------------------------------------------------------------- 分镜表逐行编辑

/**
 * 分镜表是一行一镜，改一镜不该把整张图重跑。
 *
 * 所以编辑不直接改老版本：攒一份草稿，点「保存为新版本」才生成 v(n+1)，
 * 并把新的那一版设为当前选用 —— 下游因此变脏，只有依赖这一镜的节点需要重跑。
 */
const draftRows = ref<CanvasShotRow[]>([])
const draftDirty = ref(false)

watch(
  () => shownArtifact.value?.id,
  () => {
    const rows = shownArtifact.value?.rows
    draftRows.value = rows ? rows.map(r => ({ ...r })) : []
    draftDirty.value = false
  },
  { immediate: true }
)

function updateRow(index: number, key: keyof CanvasShotRow, value: string | number): void {
  const row = draftRows.value[index]
  if (!row) return
  if (key === 'frames') row.frames = Number(value)
  else if (key === 'idx') row.idx = Number(value)
  else (row as Record<string, unknown>)[key] = value
  draftDirty.value = true
}

/** 把草稿存成新版本（不动老版本）。 */
function saveRowsAsVersion(): void {
  const node = selected.value
  const base = shownArtifact.value
  if (!node || !base) return
  const version = nextVersion(artifacts.value, node.id, base.slot)
  const artifact: CanvasArtifact = {
    ...base,
    id: `a_${node.id}_${version}`,
    version,
    rows: draftRows.value.map(r => ({ ...r })),
    note: `${draftRows.value.length} 镜 · 手工改过`,
    review: 'pending',
    createdAt: new Date().toISOString()
  }
  artifacts.value = [...artifacts.value, artifact]
  selectArtifact(graph.value, artifact)
  draftDirty.value = false
  showToast(`已存为 v${version}（待确认）—— 认可后下游才能跑`)
}

function setParam(node: CanvasNode, key: string, value: unknown): void {
  node.params = { ...node.params, [key]: value }
}

function paramValue(node: CanvasNode, key: string): string {
  const v = node.params[key]
  return v === undefined || v === null ? '' : String(v)
}

function paramOptions(p: CanvasParamSpec, kind?: string): { value: string, label: string }[] {
  if (p.key === 'modelId') {
    const list = modelOptions.value[kind ?? ''] ?? []
    return list.length ? list : [{ value: '', label: '服务端默认' }]
  }
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
  window.addEventListener('keydown', onKeydown)
  // 首屏适应一次，保证一进来就看得到整条产线
  window.setTimeout(() => fitView({ padding: 0.16, maxZoom: 0.86, minZoom: 0.4 }), 700)
  // 示例里预置的"运行中"落地，让状态机动起来
  settleSeededRuns()
  // 每一步的模型下拉：按模态取目录。目录里还没有文本/音频那两类，
  // 取不到就留一句"服务端默认"，等后端在 catalog 里补上（见 R2 文档 0.7）。
  const fallback = { value: '', label: '服务端默认（目录未接通）' }
  try {
    const catalog = await hgApi.getCatalog()
    const image = (catalog.cloudModels ?? []).map(m => ({ value: m.id, label: m.name }))
    const video = (catalog.videoModels ?? [])
      .filter(m => m.available !== false)
      .map(m => ({ value: m.id, label: m.name }))
    modelOptions.value = {
      text: [],
      audio: [],
      image: image.length ? image : [fallback],
      video: video.length ? video : [fallback]
    }
  } catch {
    modelOptions.value = { text: [], audio: [], image: [fallback], video: [fallback] }
  }
})

onBeforeUnmount(() => {
  mq?.removeEventListener('change', syncWide)
  window.removeEventListener('keydown', onKeydown)
})

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
        <span
          v-if="selectedCount"
          class="cg-metric"
          data-tone="warn"
        ><i class="i-lucide-box-select" /> 已选 {{ selectedCount }}</span>
        <span class="cg-metric"><i class="i-lucide-coins" /> 已花 {{ creditsToYuan(totalCost) }}</span>
        <span
          v-if="estimatedBatch"
          class="cg-metric"
          data-tone="warn"
        ><i class="i-lucide-calculator" /> 本次预计 {{ creditsToYuan(estimatedBatch) }}</span>
      </div>

      <div class="cg-top-right">
        <button
          class="cg-icon"
          type="button"
          title="撤销（⌘Z）"
          :disabled="!canUndo"
          @click="undo"
        >
          <i class="i-lucide-undo-2" />
        </button>
        <button
          class="cg-icon"
          type="button"
          title="重做（⇧⌘Z）"
          :disabled="!canRedo"
          @click="redo"
        >
          <i class="i-lucide-redo-2" />
        </button>

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
          {{ runningCount ? `运行中 ${runningCount}` : `运行全部${estimatedBatch ? ` · 约 ${creditsToYuan(estimatedBatch)}` : ''}` }}
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
          拖动空白处平移 · 滚轮缩放 · Shift 拖动框选 · ⌘/Ctrl+点选多个 · 从端口小圆点拖出连线（只允许同类型）
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
            :is-valid-connection="isValidConnection"
            :elements-selectable="true"
            :selection-mode="SelectionMode.Full"
            :selection-key-code="'Shift'"
            :multi-selection-key-code="['Meta', 'Control']"
            :delete-key-code="null"
            class="cg-flow"
            @connect="onConnect"
            @connect-start="onConnectStart"
            @connect-end="onConnectEnd"
            @node-drag-stop="onNodeDragStop"
            @edges-change="onEdgesChange"
            @pane-click="selectedId = ''"
            @selection-context-menu="openSelectionMenu"
            @node-context-menu="openNodeMenu"
            @pane-context-menu="openPaneMenu"
            @edge-context-menu="openEdgeMenu"
            @contextmenu.prevent
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
                @pick-item="pickItem"
                @collapse="(id: string, collapsed: boolean) => { const n = graph.nodes.find(x => x.id === id); if (n) n.collapsed = collapsed }"
                @review="review"
                @param="(id: string, key: string, value: string) => setParam(graph.nodes.find(n => n.id === id)!, key, value)"
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

        <!-- 多选时的悬浮工具条：批量动作不用再右键 -->
        <div
          v-if="selectedCount > 1"
          class="cg-selbar"
        >
          <span class="cg-selbar-count">已选 {{ selectedCount }}</span>
          <button
            type="button"
            @click="runSelected"
          >
            <i class="i-lucide-play" /> 运行所选
          </button>
          <button
            type="button"
            @click="for (const id of selectedNodeIds()) { const n = graph.nodes.find(x => x.id === id); if (n) n.collapsed = true }"
          >
            <i class="i-lucide-minimize-2" /> 折叠
          </button>
          <button
            type="button"
            class="is-danger"
            @click="deleteSelected"
          >
            <i class="i-lucide-trash-2" /> 删除
          </button>
          <button
            type="button"
            @click="clearSelection"
          >
            取消选择
          </button>
        </div>

        <CanvasContextMenu
          v-if="menu"
          :x="menu.x"
          :y="menu.y"
          :title="menu.kind === 'node' ? graph.nodes.find(n => n.id === menu?.nodeId)?.title : menu.kind === 'edge' ? '连线' : menu.kind === 'selection' ? `已选 ${selectedCount} 个节点` : menu.kind === 'connect' ? '接一个节点' : '画布'"
          :subtitle="menu.kind === 'node' ? nodeTypeSpec(graph.nodes.find(n => n.id === menu?.nodeId)?.kind ?? 'script_in').subtitle : menu.kind === 'edge' ? '连线可以断开后重连' : menu.kind === 'selection' ? '可批量运行、折叠或删除' : menu.kind === 'connect' ? '能接上的排前面' : '在空白处可以新建节点'"
          :items="menu.kind === 'node' ? nodeMenuItems : menu.kind === 'edge' ? edgeMenuItems : menu.kind === 'selection' ? selectionMenuItems : menu.kind === 'connect' ? connectMenuItems : paneMenuItems"
          @pick="onMenuPick"
          @close="closeMenu"
        />

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
                <i class="i-lucide-play" /> 运行这个节点{{ estimateOf(selected) ? ` · 约 ${creditsToYuan(estimateOf(selected))}` : '' }}
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
                  :data-tone="incomingEdges(graph, selected.id, [p.slot]).length ? 'ok' : 'muted'"
                >
                  {{ inputSummary(selected, p.slot) }}
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
                    v-for="o in paramOptions(p, selectedSpec.modelKind)"
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

            <!-- 分镜表：逐行可改，改的是草稿，存成新版本 -->
            <section
              v-if="selected.kind === 'shotlist' && draftRows.length"
              class="cg-block"
            >
              <p class="cg-block-title">
                分镜表 <span class="cg-block-sub">v{{ shownArtifact?.version }} · 改完存新版本，老版本不动</span>
              </p>
              <div
                v-for="(row, i) in draftRows"
                :key="i"
                class="cg-row"
              >
                <div class="cg-row-head">
                  <b>S{{ String(row.idx).padStart(2, '0') }}</b>
                  <input
                    class="cg-input cg-input--tiny"
                    :value="row.shotSize"
                    placeholder="景别"
                    @input="updateRow(i, 'shotSize', ($event.target as HTMLInputElement).value)"
                  >
                  <input
                    class="cg-input cg-input--tiny"
                    :value="row.camera"
                    placeholder="运镜"
                    @input="updateRow(i, 'camera', ($event.target as HTMLInputElement).value)"
                  >
                  <select
                    class="cg-input cg-input--tiny"
                    :value="row.frames"
                    @change="updateRow(i, 'frames', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option
                      v-for="f in graph.frameGrid"
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
                  @input="updateRow(i, 'keyframePrompt', ($event.target as HTMLInputElement).value)"
                >
                <input
                  class="cg-input cg-input--tiny"
                  :value="row.line ?? ''"
                  placeholder="台词"
                  @input="updateRow(i, 'line', ($event.target as HTMLInputElement).value)"
                >
              </div>
              <div class="cg-row-actions">
                <button
                  class="cg-mini cg-mini--accent"
                  type="button"
                  :disabled="!draftDirty"
                  @click="saveRowsAsVersion"
                >
                  <i class="i-lucide-save" /> 保存为新版本
                </button>
                <button
                  class="cg-mini"
                  type="button"
                  :disabled="!draftDirty"
                  @click="draftRows = (shownArtifact?.rows ?? []).map(r => ({ ...r })); draftDirty = false"
                >
                  放弃修改
                </button>
              </div>
            </section>

            <!-- 当前选用产物的正文（剧本/大纲要能整段读） -->
            <section
              v-if="shownArtifact?.text"
              class="cg-block"
            >
              <p class="cg-block-title">
                当前选用 · v{{ shownArtifact.version }} 正文
              </p>
              <pre class="cg-fulltext">{{ shownArtifact.text }}</pre>
            </section>

            <!-- 片段顺序：视频在排序才是成片 -->
            <section
              v-if="selected.kind === 'compose' && fragments.length"
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
                  @click="moveFragment(i, -1)"
                >
                  ↑
                </button>
                <button
                  class="cg-tiny cg-frag-move"
                  type="button"
                  :disabled="i === fragments.length - 1"
                  title="下移"
                  @click="moveFragment(i, 1)"
                >
                  ↓
                </button>
              </div>
            </section>

            <!-- 导出清单：已导出 / 未导出（原因）/ 参数不一致 -->
            <section
              v-if="shownArtifact?.manifest"
              class="cg-block"
            >
              <p class="cg-block-title">
                导出清单
              </p>
              <p class="cg-mani-group">
                已导出 <b>{{ shownArtifact.manifest.exported.length }}</b>
              </p>
              <div
                v-for="x in shownArtifact.manifest.exported"
                :key="`ok-${x.label}`"
                class="cg-mani-row"
              >
                <i class="i-lucide-check" /> {{ x.label }} <span>{{ x.note }}</span>
              </div>
              <p class="cg-mani-group">
                未导出 <b>{{ shownArtifact.manifest.skipped.length }}</b>
              </p>
              <div
                v-for="x in shownArtifact.manifest.skipped"
                :key="`skip-${x.label}`"
                class="cg-mani-row cg-mani-row--warn"
              >
                <i class="i-lucide-minus" /> {{ x.label }} <span>{{ x.reason }}</span>
              </div>
              <p
                v-if="shownArtifact.manifest.mismatch.length"
                class="cg-mani-group"
              >
                参数不一致 <b>{{ shownArtifact.manifest.mismatch.length }}</b>
              </p>
              <div
                v-for="x in shownArtifact.manifest.mismatch"
                :key="`mm-${x.label}`"
                class="cg-mani-row cg-mani-row--bad"
              >
                <i class="i-lucide-triangle-alert" /> {{ x.label }} <span>{{ x.detail }}</span>
              </div>
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
                        @click="pickItem(selected.id, a.id, i)"
                      >
                        {{ it.picked ? '已选用' : '选用' }}
                      </button>
                      <button
                        class="cg-tiny"
                        type="button"
                        @click="reviewItem(selected.id, a.id, i, it.review === 'rejected' ? 'approved' : 'rejected')"
                      >
                        {{ it.review === 'rejected' ? '恢复' : '驳回' }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="cg-art-actions">
                  <button
                    v-if="a.id !== shownArtifact?.id"
                    class="cg-mini"
                    type="button"
                    @click="pick(selected.id, a.id)"
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

            <!-- 继续补充：带着选中的这一版接着改 -->
            <section
              v-if="shownArtifact && selectedSpec.stage === 'ready'"
              class="cg-block"
            >
              <p class="cg-block-title">
                继续补充 <span class="cg-block-sub">在第 {{ shownArtifact.version }} 版上改</span>
              </p>
              <textarea
                v-model="followUp"
                class="cg-input cg-input--area"
                placeholder="还要改什么？例如：第 2 场太拖，压到 20 秒内"
              />
              <button
                class="cg-mini cg-mini--accent cg-follow"
                type="button"
                :disabled="!!runningCount"
                @click="continueFrom(selected.id)"
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
                >改自 v{{ nodeVersions.find(a => a.id === r.baseArtifactId)?.version ?? '?' }}</span>
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

.cg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--hg3-muted);
  background: rgb(255 255 255 / 5%);
  border-radius: 8px;
}

.cg-icon:hover:not(:disabled) { color: var(--hg3-ink); background: rgb(255 255 255 / 11%); }
.cg-icon:disabled { opacity: 0.38; cursor: not-allowed; }

.cg-selbar {
  position: absolute;
  left: 50%;
  bottom: 18px;
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 6px;
  transform: translateX(-50%);
  padding: 5px 8px;
  background: rgb(20 21 24 / 92%);
  border: 1px solid var(--hg3-line-strong);
  border-radius: 999px;
  box-shadow: 0 12px 30px rgb(0 0 0 / 46%);
  backdrop-filter: blur(8px);
}

.cg-selbar-count { padding: 0 4px; font-size: 11.5px; color: var(--hg3-warn); }

.cg-selbar button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
  color: var(--hg3-ink);
  background: rgb(255 255 255 / 8%);
  border-radius: 999px;
}

.cg-selbar button:hover { background: rgb(255 255 255 / 14%); }
.cg-selbar button.is-danger { color: var(--hg3-i-coral); }

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

.cg-art-thumbs { display: flex; gap: 6px; margin-top: 7px; }

.cg-art-thumb {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: 4px;
  background: var(--hg3-well);
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px var(--hg3-line);
}

.cg-art-thumb.is-picked { box-shadow: inset 0 0 0 2px var(--hg3-ok); }
.cg-art-thumb.is-rejected { opacity: 0.45; }
.cg-art-thumb img { width: 100%; height: 52px; object-fit: cover; border-radius: 5px; }
.cg-art-thumb-name { display: block; margin-top: 3px; font-size: 9.5px; color: var(--hg3-faint); text-align: center; }
.cg-art-thumb-actions { display: flex; gap: 3px; margin-top: 3px; }

.cg-tiny {
  flex: 1;
  height: 20px;
  font-size: 9.5px;
  color: var(--hg3-ink);
  background: rgb(255 255 255 / 8%);
  border-radius: 5px;
}

.cg-tiny:disabled { opacity: 0.5; }

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

.cg-frag {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
  padding: 5px 6px;
  background: var(--hg3-card);
  border-radius: 8px;
}

.cg-frag-no { flex: none; width: 14px; font-size: 11px; color: var(--hg3-muted); }
.cg-frag-thumb { flex: none; width: 42px; height: 30px; object-fit: cover; border-radius: 5px; }
.cg-frag-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.cg-frag-text b { font-size: 11px; }
.cg-frag-text i { font-size: 10px; font-style: normal; color: var(--hg3-faint); }
.cg-frag-move { flex: none; width: 22px; }

.cg-mani-group { margin: 8px 0 4px; font-size: 11px; color: var(--hg3-muted); }
.cg-mani-group b { color: var(--hg3-ink); }
.cg-mani-row { display: flex; align-items: center; gap: 5px; font-size: 11px; padding: 2px 0; }
.cg-mani-row span { margin-left: auto; color: var(--hg3-faint); font-size: 10px; }
.cg-mani-row--warn { color: var(--hg3-warn); }
.cg-mani-row--bad { color: var(--hg3-i-coral); }

.cg-row { margin-bottom: 7px; padding: 6px 7px; background: var(--hg3-card); border-radius: 8px; }
.cg-row-head { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
.cg-row-head b { font-size: 11px; color: var(--hg3-ink); flex: none; }
.cg-input--tiny { min-height: 24px; padding: 2px 6px; font-size: 10.5px; }
.cg-row .cg-input--tiny + .cg-input--tiny { margin-top: 4px; }
.cg-row-actions { display: flex; gap: 6px; margin-top: 4px; }

.cg-fulltext {
  margin: 0;
  max-height: 210px;
  overflow: auto;
  padding: 8px 9px;
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  color: var(--hg3-ink);
  background: var(--hg3-well);
  border-radius: 8px;
}

.cg-follow { margin-top: 7px; }
.cg-run-base { color: var(--hg3-i-orange); font-size: 10px; }

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
