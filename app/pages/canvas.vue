<script setup lang="ts">
/**
 * 画布（织幕）—— 节点工作台，前端先行版。
 *
 * 照界面原型重画：顶栏（缩放 / 适应画布 / 保存 / 运行全部）、左栏节点库、
 * 无限画布（端口拖线）、节点卡（内容预览 + 节点内运行）、右栏节点详情（参数 / 产物版本 / 运行记录）。
 *
 * 数据模型与后端契约见 aicodcms/docs/canvas/ZHIMU-DATA-MODEL-R2.md：
 *   产物是实体、依赖是数据、审核的对象是产物。
 *
 * **图、产物、运行全部来自服务端**（`/api/v1/canvas/*`，运行是 SSE 流）：
 * 曾经的本地模拟（simulateRun / streamInto）与示例数据兜底已整体删除 ——
 * 那套东西留在页面上的表现是"看起来有图、其实什么都没存"。
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
  connectNodes,
  connectionAllowed,
  createNode,
  dirtyNodes,
  disconnect,
  expandShotlist,
  fragmentOrder,
  isDirty,
  inputRefs,
  makeEdge,
  nodeState,
  paramsHash,
  pendingReviewCount,
  removeNode,
  selectArtifact,
  withItemPicked,
  withItemReview
} from '~/data/canvas-graph'
import type { ContextMenuItem } from '~/components/canvas/ContextMenu.vue'
import type { CanvasNodeKind, CanvasPortSpec } from '~/data/canvas-nodes'
import { CANVAS_GROUPS, CANVAS_NODE_TYPES, canConnect, creditsToYuan, groupMeta, nodeTypeSpec, portMeta } from '~/data/canvas-nodes'
import type { CanvasTemplateInfo } from '~/data/canvas-templates'
import {
  emptyCanvas,
  listTemplates,
  loadTemplate,
  removeTemplate,
  saveTemplate
} from '~/data/canvas-templates'

useHead({ title: '画布 · 织幕' })

// ---------------------------------------------------------------- 状态

/**
 * 图与产物**来自服务端**（`/api/v1/canvas/*`）。
 *
 * 这里刻意不再有"示例数据兜底"：以前后端没通时用本地示例撑着，结果"页面上看着有图、
 * 其实什么都没存"—— 接真接口后宁可空着（空图会引导用户从节点库拖第一个节点），
 * 也不要让演示数据混进真实工作区。
 */
const canvasApi = useCanvasApi()
const graph = ref<CanvasGraph>(emptyCanvas().graph)
const artifacts = ref<CanvasArtifact[]>([])
const runs = ref<CanvasRun[]>([])

/** 当前这张图在服务端的 id（空 = 还没保存过，第一次保存时新建）。 */
const graphId = ref('')
/** 打开这张图时看到的版本号：更新时必须原样回传，服务端据此挡并发覆盖。 */
const graphRevision = ref(0)
/** 顶部标题（服务端也存一份）。 */
const graphTitle = ref('未命名图')
/** 保存/载入中：按钮转圈，避免连点。 */
const busy = ref(false)
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
// ---------------------------------------------------------------- 新建 / 模板

/** 起始面板：新建（空白或套模板）与另存为模板。 */
const startPanel = ref<{ mode: 'new' | 'save' } | null>(null)
const templates = ref<CanvasTemplateInfo[]>([])

function openStart(mode: 'new' | 'save'): void {
  templates.value = listTemplates()
  startPanel.value = { mode }
}

/** 换一张图（新建/套模板）后，历史基线要重建，否则能"撤销"回上一张图，很怪。 */
function replaceCanvas(payload: { graph: CanvasGraph, artifacts: CanvasArtifact[], runs: CanvasRun[] }): void {
  graph.value = payload.graph
  artifacts.value = payload.artifacts
  runs.value = payload.runs
  selectedId.value = ''
  clearSelection()
  clearDrafts()
  resetHistory()
  nextTick(() => fit())
}

function newBlank(): void {
  startPanel.value = null
  graphId.value = ''
  graphRevision.value = 0
  graphTitle.value = '未命名图'
  replaceCanvas(emptyCanvas())
  showToast('空白画布：从左栏拖节点，或从端口拖线到空白处建节点')
}

function useTemplate(id: string): void {
  const payload = loadTemplate(id)
  startPanel.value = null
  if (!payload) {
    showToast('这个模板读不出来了')
    return
  }
  replaceCanvas(payload)
  showToast('已套用模板')
}

function saveAsTemplate(name: string): void {
  const saved = saveTemplate(name, JSON.parse(JSON.stringify(graph.value)) as CanvasGraph)
  startPanel.value = null
  showToast(saved ? `已存成模板「${saved.name}」（存在这台浏览器本地）` : '这台浏览器存不了模板')
}

function dropTemplate(id: string): void {
  removeTemplate(id)
  templates.value = listTemplates()
  showToast('模板已删除')
}

// ---------------------------------------------------------------- 撤销 / 重做
//
// 做法：整图快照（graph + artifacts 的 JSON），深监听变化后压栈，上限 50 步。
// 为什么不做细粒度命令模式：一张图才十几个节点，快照最省事也最不容易漏 ——
// 参数改动、连线、成组选用、分镜表编辑全都会被同一条监听抓到。
// **runs 不进快照**：任务与花费是账本，撤销不该把它抹掉。
//
// 具体接线在 ~/composables/useCanvasHistory（纯逻辑在 ~/data/canvas-history，可单跑测试）。

const {
  canUndo,
  canRedo,
  undo,
  redo,
  reset: resetHistory
} = useCanvasHistory({
  graph,
  artifacts,
  selectedId,
  toast: showToast,
  // 连线按句柄坐标画：数据一变就重新测量，否则线会按过期坐标画（表现为"线没了"）
  remeasure: () => updateNodeInternals()
})

/** 拖线落地那一刻的出发端口（菜单按它算候选；拖拽过程中的变量会被清空）。 */
const connectFromSnapshot = ref<{ nodeId: string, slot: string, type: 'source' | 'target' } | null>(null)

/** 画布内部的剪贴板（不碰系统剪贴板）：复制一个节点，右键空白粘贴。 */
const clipboard = ref<{ kind: CanvasNodeKind, title: string, params: Record<string, unknown> } | null>(null)
/** 每次运行带进来的临时输入（补充要求），按 runId 存，模拟用。 */
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
  removeSelectedNodes,
  findEdge,
  updateNodeInternals
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

/** 悬停某条线时，它两端的节点算"被关联"。 */
function linkHighlighted(nodeId: string): boolean {
  const edgeId = hoveredEdge.value
  if (!edgeId) return false
  const edge = graph.value.edges.find(e => e.id === edgeId)
  return !!edge && (edge.from.node === nodeId || edge.to.node === nodeId)
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
      linked: linkHighlighted(n.id),
      artifacts: artifacts.value.filter(a => a.nodeId === n.id),
      modelLabel: modelLabelOf(n),
      frameGrid: graph.value.frameGrid,
      tableRows: tableRowsOf(n),
      tableDirty: rowsDirty(n.id),
      modelOptions: modelOptions.value,
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
      // 悬停时加粗发亮：靠重算 style 实现，不用自定义边组件
      style: hoveredEdge.value === e.id
        ? { stroke: color, strokeWidth: 2.8, filter: 'drop-shadow(0 0 4px rgb(233 150 84 / 55%))' }
        : { stroke: color, strokeWidth: 1.6 },
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
  const toSpec = graph.value.nodes.find(n => n.id === connection.target)
  if (!toSpec) return false
  const inPort = nodeTypeSpec(toSpec.kind).inputs.find(p => p.slot === connection.targetHandle)
  if (!inPort) return false
  return connectionAllowed(
    graph.value,
    { node: connection.source, slot: connection.sourceHandle },
    { node: connection.target, slot: connection.targetHandle },
    inPort
  )
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

/** 鼠标停在哪条线上（两端节点跟着轻微高亮，线本身也加粗发亮）。 */
const hoveredEdge = ref<string | null>(null)
/** 指针停在"断开"按钮上时不要因为离开线而把按钮收走。 */
const edgeBtnHover = ref(false)
let edgeLeaveTimer: number | undefined

function onEdgeHover(edgeId: string): void {
  window.clearTimeout(edgeLeaveTimer)
  hoveredEdge.value = edgeId
}

function onEdgeLeave(): void {
  window.clearTimeout(edgeLeaveTimer)
  edgeLeaveTimer = window.setTimeout(() => {
    if (!edgeBtnHover.value) hoveredEdge.value = null
  }, 140)
}

/**
 * 悬停那条线的中点（屏幕坐标）。
 *
 * Vue Flow 会把两端句柄的坐标写回边对象（sourceX/sourceY/targetX/targetY），
 * 拿它算中点、再按视口缩放平移换算成屏幕坐标 —— 于是 ⊗ 正好压在线的中间。
 * 这样做的好处是不用自定义 SVG 边：线还是内置的（稳定），按钮是普通 DOM。
 */
const edgeButtonPos = computed(() => {
  const id = hoveredEdge.value
  if (!id) return null
  const edge = findEdge(id) as unknown as { sourceX?: number, sourceY?: number, targetX?: number, targetY?: number } | undefined
  if (!edge || edge.sourceX === undefined || edge.sourceY === undefined
    || edge.targetX === undefined || edge.targetY === undefined) return null
  const zoom = viewport.value?.zoom ?? 1
  const vx = viewport.value?.x ?? 0
  const vy = viewport.value?.y ?? 0
  return {
    x: ((edge.sourceX + edge.targetX) / 2) * zoom + vx,
    y: ((edge.sourceY + edge.targetY) / 2) * zoom + vy
  }
})

function removeEdge(edgeId: string): void {
  disconnect(graph.value, edgeId)
  hoveredEdge.value = null
  edgeBtnHover.value = false
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
    { key: 'rerun', label: '重跑（忽略缓存）', icon: 'i-lucide-refresh-cw', disabled: spec.stage !== 'ready' },
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
  { key: 'new', label: '新建画布 / 套模板', icon: 'i-lucide-file-plus-2' },
  { key: 'save-template', label: '另存为模板', icon: 'i-lucide-bookmark-plus' },
  { key: 'fit', label: '适应画布', icon: 'i-lucide-maximize' },
  { key: 'save', label: '保存到服务端', icon: 'i-lucide-save' },
  { key: 'reload', label: '重新载入（放弃本地修改）', icon: 'i-lucide-refresh-cw' },
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
    case 'rerun': if (nodeId) void rerunNode(nodeId); break
    case 'reload': void reloadFromServer(); break
    case 'detach': if (nodeId) detachNode(nodeId); break
    case 'remove': if (nodeId) drop(nodeId); break
    case 'paste': pasteNode(at ? { x: Math.round(at.x), y: Math.round(at.y) } : undefined); break
    case 'new': openStart('new'); break
    case 'save-template': openStart('save'); break
    case 'fit': fit(); break
    case 'save': void saveToServer(); break
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

// ---------------------------------------------------------------- 与服务端同步

/** 载入一张图（默认载入最近编辑的那张；一张都没有就留空白图）。 */
async function loadFromServer(id?: string): Promise<void> {
  busy.value = true
  try {
    let target = id || ''
    if (!target) {
      const list = await canvasApi.listGraphs('hougong')
      target = list[0]?.id || ''
    }
    if (!target) {
      newBlank()
      return
    }
    const view = await canvasApi.getGraph(target)
    graphId.value = view.summary.id
    graphRevision.value = view.summary.revision
    graphTitle.value = view.summary.title || '未命名图'
    replaceCanvas({ graph: view.graph, artifacts: view.artifacts, runs: view.runs })
    showToast(`已载入「${graphTitle.value}」`)
  } catch (err) {
    showToast(`载入失败：${errText(err)}`)
  } finally {
    busy.value = false
  }
}

/**
 * 保存整张图。
 *
 * 更新时带 `revision`（打开时看到的版本号）：另一个标签页改过就会被服务端挡下来，
 * 提示"先重新载入"——而不是把对方的工作静默盖掉。
 */
async function saveToServer(silent = false): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const summary = await canvasApi.saveGraph({
      id: graphId.value,
      title: graphTitle.value,
      product: 'hougong',
      graph: graph.value,
      revision: graphRevision.value
    })
    graphId.value = summary.id
    graphRevision.value = summary.revision
    if (!silent) showToast(`已保存（v${summary.revision}）`)
  } catch (err) {
    const message = errText(err)
    showToast(message.includes('stale') || message.includes('版本')
      ? '这张图在别处被改过了 —— 先重新载入，再改'
      : `保存失败：${message}`)
  } finally {
    busy.value = false
  }
}

/** 把服务端返回的产物并进本地（按 id 去重；同 id 以服务端为准）。 */
function mergeArtifacts(list: CanvasArtifact[]): void {
  if (!list.length) return
  const byId = new Map(artifacts.value.map(a => [a.id, a]))
  for (const a of list) byId.set(a.id, a)
  artifacts.value = [...byId.values()]
}

/**
 * 订阅平台事件：任务完成/失败时刷新整图。
 *
 * 断线退避重连（1s → 5s），重连成功后**补拉一次整图**（R2 §6.5 的口径：
 * 断线期间漏掉的事件不重放，靠整图兜底）。
 */
let eventAbort: AbortController | null = null
async function watchEvents(): Promise<void> {
  let delay = 1000
  for (;;) {
    if (eventAbort?.signal.aborted) return
    eventAbort = new AbortController()
    try {
      await canvasApi.subscribeEvents((event, data) => {
        if (!graphId.value || String(data.graphId ?? '') !== graphId.value) return
        if (!event.startsWith('task.')) return
        // 同一批事件可能连着来（完成 + 花费）：稍微攒一下再拉，避免连着拉好几遍整图。
        scheduleReload()
      }, eventAbort.signal)
      delay = 1000
    } catch {
      /* 断线：等一会儿重连 */
    }
    if (eventAbort.signal.aborted) return
    await new Promise(resolve => window.setTimeout(resolve, delay))
    delay = Math.min(delay * 2, 5000)
    await reloadGraph()
  }
}

/** 攒一下再刷新（事件是连着的，逐条拉整图没必要）。 */
let reloadTimer: number | undefined
function scheduleReload(): void {
  if (reloadTimer) window.clearTimeout(reloadTimer)
  reloadTimer = window.setTimeout(() => {
    reloadTimer = undefined
    void reloadGraph()
  }, 800)
}

/** 载入失败/接口报错的文案。 */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ---------------------------------------------------------------- 运行

/**
 * 跑一个节点：`POST /canvas/node/run`，响应是 **SSE 流**。
 *
 * 三种结果都在同一条流里：文本逐字吐（delta）、图/视频回 `queued`（产物稍后由服务端
 * 收敛钩子落库，刷新整图就能看到）、当场出产物（artifact）。
 */
async function runNode(
  nodeId: string,
  opts: { silent?: boolean, base?: CanvasArtifact, followUp?: string, force?: boolean } = {}
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
  // 跑之前**先把当前编辑落库**：服务端按库里的图算参数指纹与输入引用，
  // 用屏幕上的草稿跑会得到"参数没变却重跑"或"用的是旧参数"这种对不上的结果。
  await saveToServer(true)
  if (!graphId.value) {
    if (!opts.silent) showToast('这张图还没保存成功，先解决保存问题')
    return
  }

  runningIds.value = [...runningIds.value, nodeId]
  streaming.value = { ...streaming.value, [nodeId]: '' }
  const startedAt = new Date().toISOString()

  try {
    await canvasApi.runNodeStream({
      id: graphId.value,
      nodeId,
      force: !!opts.force,
      baseArtifactId: opts.base?.id,
      instruction: opts.followUp
    }, {
      onDelta: (text) => {
        streaming.value = { ...streaming.value, [nodeId]: (streaming.value[nodeId] ?? '') + text }
      },
      onArtifact: (payload) => {
        const list = (payload.artifacts?.length ? payload.artifacts : (payload.artifact ? [payload.artifact] : []))
          .map(toCanvasArtifact)
        mergeArtifacts(list)
        // 服务端返回的 run 是权威：用它的 id/状态/花费覆盖本地那条。
        if (payload.run) upsertRun(toCanvasRun(payload.run))
        const fresh = list.find(a => a.nodeId === nodeId)
        if (fresh) selectArtifact(graph.value, fresh)
        if (payload.cached) showToast('内容没变，直接用已有产物（没有重新计费）')
      },
      onQueued: (payload) => {
        if (payload.run) upsertRun(toCanvasRun(payload.run))
      },
      onError: (message) => {
        upsertRun({
          id: `local_${nodeId}_${Date.now().toString(36)}`,
          nodeId,
          paramsHash: paramsHash(node),
          status: 'failed',
          error: message,
          startedAt
        })
        showToast(message)
      }
    })
  } catch (err) {
    showToast(`运行失败：${errText(err)}`)
  } finally {
    const rest = { ...streaming.value }
    delete rest[nodeId]
    streaming.value = rest
    runningIds.value = runningIds.value.filter(id => id !== nodeId)
  }
}

/** 「继续补充」：带着这一版 + 新的补充要求重跑，产出下一版。 */
async function continueFrom(nodeId: string): Promise<void> {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node) return
  const note = followUp.value.trim()
  if (!note) {
    showToast('先写一句"还要改什么"')
    return
  }
  const spec = nodeTypeSpec(node.kind)
  const slot = spec.outputs[0]?.slot ?? ''
  const picked = slot ? node.outputs[slot] : undefined
  const base = picked ? artifacts.value.find(a => a.id === picked.artifactId) : undefined
  followUp.value = ''
  // 强制重跑：同一版 + 不同补充要求本来就该出新版本（服务端也把它算进参数指纹）。
  await runNode(nodeId, { base, followUp: note, force: true })
}

/** 写入/覆盖一条本地 run（同名 run 以最新一次为准）。 */
function upsertRun(run: CanvasRun): void {
  const idx = runs.value.findIndex(r => r.id === run.id)
  if (idx >= 0) {
    const next = [...runs.value]
    next[idx] = run
    runs.value = next
    return
  }
  runs.value = [...runs.value, run]
}

/**
 * 重跑（节点上的「运行」按钮）：忽略缓存，强制出新的一版。
 */
async function rerunNode(nodeId: string): Promise<void> {
  await runNode(nodeId, { force: true })
}

/**
 * 运行全部：**计划由服务端算**（拓扑序 + 脏节点判定），前端只负责循环。
 *
 * 为什么不由前端算：脏 = 没跑过 / 参数变了 / 上游换了新版，其中"参数变了"靠
 * `params_hash`，那是服务端口径。前端算的结果一旦与服务端不一致，表现是
 * "点了运行全部却白花钱"或"该跑的没跑"，而且都不报错。
 */
async function runAll(): Promise<void> {
  if (!graphId.value) {
    await saveToServer(true)
    if (!graphId.value) {
      showToast('先保存成功才能运行整张图')
      return
    }
  }
  // 先把当前编辑落库：服务端算计划用的是**库里的图**，不是屏幕上的草稿。
  await saveToServer(true)
  let plan: CanvasPlanNode[] = []
  try {
    plan = await canvasApi.runPlan(graphId.value)
  } catch (err) {
    showToast(`取运行计划失败：${errText(err)}`)
    return
  }
  const runnable = plan.filter(p => !p.blocked)
  const blocked = plan.length - runnable.length
  if (!runnable.length) {
    showToast(blocked
      ? `没有可跑的节点（${blocked} 个卡在输入或确认上）`
      : '没有需要重跑的节点（参数和输入都没变）')
    return
  }
  showToast(`开始运行 ${runnable.length} 个节点${blocked ? `（${blocked} 个卡住，跳过）` : ''}`)
  for (const item of runnable) {
    await runNode(item.nodeId, { silent: true })
  }
  // 跑完再拉一次整图：异步任务（图/视频）的产物是后端收敛后落库的。
  await reloadGraph()
  showToast(`运行完成：${runnable.length} 个节点`)
}

/** 重新拉一遍整图（产物/运行以服务端为准）。 */
async function reloadGraph(): Promise<void> {
  if (!graphId.value) return
  try {
    const view = await canvasApi.getGraph(graphId.value)
    graphRevision.value = view.summary.revision
    // 图内容可能被服务端改过（选定走的是服务端的读改写）：**以服务端为准**，
    // 但保留本地正在编辑的节点参数会带来"到底哪份是新的"的歧义，所以整个换掉。
    graph.value = view.graph
    artifacts.value = view.artifacts
    runs.value = view.runs
  } catch (err) {
    showToast(`刷新失败：${errText(err)}`)
  }
}

// ---------------------------------------------------------------- 产物操作

/**
 * 选定一个产物版本。
 *
 * **写回服务端**（`nodes[].outputs[slot]` 存在图的 JSON 里），因为它决定下游用哪一版；
 * 只改本地内存的话，刷新就回到旧版，而下游已经按新版跑过 —— 两边对不上。
 */
async function pick(nodeId: string, artifactId: string): Promise<void> {
  const artifact = artifacts.value.find(a => a.id === artifactId)
  if (!artifact) return
  // 先本地生效（点下去立刻有反馈），再落服务端。
  selectArtifact(graph.value, artifact)
  if (!graphId.value) return
  try {
    graphRevision.value = await canvasApi.pickArtifact({
      id: graphId.value,
      nodeId,
      slot: artifact.slot,
      artifactId
    })
  } catch (err) {
    showToast(`选定没能保存：${errText(err)}`)
  }
}

/** 组内选用第几张 —— 三视图/首帧"挑一张"，选中的那张才往下走。 */
async function pickItem(nodeId: string, artifactId: string, index: number): Promise<void> {
  const artifact = artifacts.value.find(a => a.id === artifactId)
  if (!artifact) return
  artifacts.value = withItemPicked(graph.value, artifacts.value, artifactId, index)
  if (!graphId.value) return
  try {
    graphRevision.value = await canvasApi.pickArtifact({
      id: graphId.value,
      nodeId,
      slot: artifact.slot,
      artifactId,
      item: index
    })
    showToast(`已选用第 ${index + 1} 张，下游按这张走`)
  } catch (err) {
    showToast(`选定没能保存：${errText(err)}`)
  }
}

/** 组内逐张驳回（三视图里"侧面那张不行"）—— 只动这一张的标注，整个产物的审核态另说。 */
function reviewItem(nodeId: string, artifactId: string, index: number, action: 'approved' | 'rejected'): void {
  artifacts.value = withItemReview(artifacts.value, artifactId, index, action)
}

/** 审核一份产物（审核对象是**产物**，不是节点）。 */
async function review(nodeId: string, artifactId: string, action: 'approved' | 'rejected'): Promise<void> {
  artifacts.value = artifacts.value.map(a => (a.id === artifactId ? { ...a, review: action } : a))
  if (!graphId.value) return
  try {
    await canvasApi.reviewArtifact({ id: graphId.value, artifactId, review: action })
    showToast(action === 'approved' ? '已认可这一份' : '已驳回，产物还在，可重跑')
  } catch (err) {
    showToast(`审核没能保存：${errText(err)}`)
  }
}

/**
 * 把分镜表的草稿存成**服务端的新版本**（不动老版本，并把新的那版设为当前选用）。
 *
 * 为什么要落服务端：以前这里在浏览器内存里造一条产物，刷新就没了 —— 而下游已经
 * 按它跑过，两边对不上。服务端按 (node, slot) 自增版本，回传的那条就是权威。
 */
async function saveRows(nodeId: string): Promise<void> {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node) return
  const spec = nodeTypeSpec(node.kind)
  const slot = spec.outputs[0]?.slot ?? ''
  const rows = tableRowsOf(node)
  if (!slot || !rows.length) {
    showToast('这一版没有可保存的行')
    return
  }
  if (!graphId.value) {
    await saveToServer(true)
    if (!graphId.value) {
      showToast('先保存成功才能存新版本')
      return
    }
  }
  try {
    const saved = await canvasApi.saveArtifact({
      id: graphId.value,
      nodeId,
      slot,
      type: spec.outputs[0]?.type,
      rows,
      note: `${rows.length} 镜 · 手工改过`
    })
    const artifact = toCanvasArtifact(saved)
    mergeArtifacts([artifact])
    selectArtifact(graph.value, artifact)
    discardRows(nodeId)
    showToast(`已存为 v${artifact.version}（待确认）—— 认可后下游才能跑`)
  } catch (err) {
    showToast(`存新版本失败：${errText(err)}`)
  }
}

/** 删一份产物（被选定的删不掉 —— 服务端会拒，前端先把话说清楚）。 */
async function removeArtifact(artifactId: string): Promise<void> {
  if (!graphId.value) return
  try {
    await canvasApi.delArtifact({ id: graphId.value, artifactId })
    artifacts.value = artifacts.value.filter(a => a.id !== artifactId)
    showToast('产物已删除')
  } catch (err) {
    showToast(`删不掉：${errText(err)}`)
  }
}

function openArtifact(artifact: CanvasArtifact): void {
  if (artifact.url) window.open(artifact.url, '_blank')
}

// ---------------------------------------------------------------- 详情面板

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
//
// 草稿按节点 id 存，卡片与右栏共用一份；存的时候才出新版本（改一镜不重跑整图）。
// 实现见 ~/composables/useCanvasRows。

const {
  tableRowsOf,
  rowsDirty,
  updateRow,
  discardRows,
  clearDrafts
} = useCanvasRows({ graph, artifacts, toast: showToast })

function setParam(node: CanvasNode, key: string, value: unknown): void {
  node.params = { ...node.params, [key]: value }
}

// ---------------------------------------------------------------- 生命周期

/**
 * 宽屏才挂画布：太窄时 Vue Flow 量不到尺寸，节点会叠成一团。
 *
 * 阈值取 720 而不是 900 —— 笔记本上把开发者工具往旁边一停，视口就只剩 800 出头，
 * 900 的话画布会被整个卸载，人只会觉得"线没了"，还找不到原因。
 */
const wideScreen = ref(true)
let mq: MediaQueryList | null = null
function syncWide(event?: MediaQueryListEvent): void {
  wideScreen.value = event ? event.matches : (mq?.matches ?? true)
}

onMounted(async () => {
  mq = window.matchMedia('(min-width: 720px)')
  syncWide()
  mq.addEventListener('change', syncWide)
  window.addEventListener('keydown', onKeydown)
  // 首屏适应一次，保证一进来就看得到整条产线
  window.setTimeout(() => fitView({ padding: 0.16, maxZoom: 0.86, minZoom: 0.4 }), 700)
  // 载入服务端最近编辑的那张图（没有就留空白图）。
  // 未登录时接口会失败，前端只提示一次、把画布留空 —— 不拿示例数据兜底。
  void loadFromServer()
  // 任务完成/失败由事件流推送 → 刷新整图（异步产物只有这样才会自己冒出来）。
  void watchEvents()
  // 每一步的模型下拉：按模态取目录。
  // 文本与音频都由后端下发（catalog.textModels / catalog.audioModels）；
  // 取不到就留一句"服务端默认"（音频还没接上游时这一桶本来就是空的）。
  const fallback = { value: '', label: '服务端默认（目录未接通）' }
  try {
    const catalog = await hgApi.getCatalog()
    const image = (catalog.cloudModels ?? []).map(m => ({ value: m.id, label: m.name }))
    const video = (catalog.videoModels ?? [])
      .filter(m => m.available !== false)
      .map(m => ({ value: m.id, label: m.name }))
    const text = (catalog.textModels ?? [])
      .filter(m => m.available !== false)
      .map(m => ({ value: m.id, label: m.name }))
    const audio = (catalog.audioModels ?? [])
      .filter(m => m.available !== false)
      .map(m => ({ value: m.id, label: m.name }))
    modelOptions.value = {
      text: text.length ? text : [fallback],
      // 音频这一桶在没接音频上游时本来就是空的：给一句能照着做的提示，
      // 而不是让下拉空着（空下拉让人以为"界面坏了"）。
      audio: audio.length ? audio : [{ value: '', label: '本站暂无音频模型（先在后台接入）' }],
      image: image.length ? image : [fallback],
      video: video.length ? video : [fallback]
    }
  } catch {
    modelOptions.value = {
      text: [fallback],
      audio: [{ value: '', label: '本站暂无音频模型（先在后台接入）' }],
      image: [fallback],
      video: [fallback]
    }
  }
})

onBeforeUnmount(() => {
  mq?.removeEventListener('change', syncWide)
  window.removeEventListener('keydown', onKeydown)
  eventAbort?.abort()
  if (reloadTimer) window.clearTimeout(reloadTimer)
})

function fit(): void {
  fitView({ padding: 0.16, maxZoom: 0.86, minZoom: 0.4 })
}

/** 重新载入：把这张图从服务端再拉一次（别人改了 / 异步任务落了产物的场景）。 */
async function reloadFromServer(): Promise<void> {
  await reloadGraph()
  showToast('已重新载入')
  window.setTimeout(fit, 120)
}

const zoomPercent = computed(() => `${Math.round((viewport.value?.zoom ?? 1) * 100)}%`)
</script>

<template>
  <div class="cg-page">
    <!-- 顶栏 -->
    <CanvasTopbar

      :node-count="graph.nodes.length"
      :ready-count="readyCount"
      :pending="pending"
      :dirty-count="dirtyCount"
      :selected-count="selectedCount"
      :total-cost="totalCost"
      :estimated-batch="estimatedBatch"
      :running-count="runningCount"
      :zoom-percent="zoomPercent"
      :can-undo="canUndo"
      :can-redo="canRedo"
      @undo="undo"
      @redo="redo"
      @zoom-in="zoomIn()"
      @zoom-out="zoomOut()"
      @new="openStart('new')"
      @fit="fit"
      @save="saveToServer()"
      @run-all="runAll"
    />

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
            @edge-mouse-enter="(payload: { edge: { id: string } }) => onEdgeHover(payload.edge.id)"
            @edge-mouse-leave="onEdgeLeave"
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
                @row-update="(id: string, index: number, key: keyof CanvasShotRow, value: string | number) => updateRow(id, index, key, value)"
                @rows-save="saveRows"
                @rows-discard="discardRows"
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
            <p class="cg-narrow-tip">
              <i class="i-lucide-info" />
              窗口太窄，画布换成了节点列表（拉宽窗口、或把开发者工具停到独立窗口就回到画布）
            </p>
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

        <!-- 悬停连线时压在线中间的"断开"按钮 -->
        <button
          v-if="edgeButtonPos && hoveredEdge"
          class="cg-edge-cut"
          type="button"
          title="断开这条连线"
          :style="{ left: `${edgeButtonPos.x}px`, top: `${edgeButtonPos.y}px` }"
          @mouseenter="edgeBtnHover = true"
          @mouseleave="edgeBtnHover = false"
          @click="removeEdge(hoveredEdge)"
        >
          <i class="i-lucide-scissors" />
        </button>

        <!-- 空画布引导：没有任何节点时告诉人从哪儿开始 -->
        <div
          v-if="!graph.nodes.length"
          class="cg-blank"
        >
          <i class="i-lucide-mouse-pointer-2" />
          <p class="cg-blank-title">
            这张画布还是空的
          </p>
          <p class="cg-blank-sub">
            从左边「节点库」拖一个节点进来（先放「剧本输入」），<br>
            也可以从端口拖线到空白处、松手直接建下一个节点。
          </p>
          <div class="cg-blank-actions">
            <button
              class="cg-primary"
              type="button"
              @click="openStart('new')"
            >
              <i class="i-lucide-sparkles" /> 套一条现成产线
            </button>
            <button
              class="cg-ghost"
              type="button"
              @click="openStart('new')"
            >
              看看有哪些模板
            </button>
          </div>
        </div>

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

        <CanvasStartDialog
          v-if="startPanel"
          :mode="startPanel.mode"
          :templates="templates"
          @blank="newBlank"
          @use="useTemplate"
          @remove="dropTemplate"
          @save="saveAsTemplate"
          @close="startPanel = null"
        />

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
      <CanvasDetailPanel
        v-if="detailOpen"
        :graph="graph"
        :node="selected"
        :spec="selectedSpec"
        :state="selected ? stateOf(selected) : 'idle'"
        :artifacts="artifacts"
        :runs="runs"
        :frame-grid="graph.frameGrid"
        :model-options="modelOptions"
        :table-rows="selected ? tableRowsOf(selected) : []"
        :table-dirty="selected ? rowsDirty(selected.id) : false"
        :follow-up="followUp"
        :busy="!!runningCount"
        @close="detailOpen = false"
        @run="runNode"
        @expand="expand"
        @param="(id: string, key: string, value: unknown) => setParam(graph.nodes.find(n => n.id === id)!, key, value)"
        @row-update="updateRow"
        @rows-save="saveRows"
        @rows-discard="discardRows"
        @pick="pick"
        @pick-item="pickItem"
        @review="review"
        @review-item="reviewItem"
        @open-artifact="openArtifact"
        @delete-artifact="removeArtifact"
        @update:follow-up="followUp = $event"
        @continue="continueFrom"
        @move-fragment="moveFragment"
      />

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
