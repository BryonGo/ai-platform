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
  dependencyLevels,
  disconnect,
  expandShotlist,
  fragmentOrder,
  inputRefs,
  makeEdge,
  nodeState,
  pendingReviewCount,
  removeNode,
  selectArtifact,
  selectFreshArtifacts,
  withItemPicked
} from '~/data/canvas-graph'
import { editFingerprint, mergeCanvas, nodeFingerprint } from '~/data/canvas-sync'
import { layoutCanvas, type LayoutPoint } from '~/data/canvas-layout'
import { characterEntries, sceneEntries, validateStructuredEdit } from '~/data/canvas-structured'
import type { ContextMenuItem } from '~/components/canvas/ContextMenu.vue'
import type { CanvasNodeKind, CanvasPortSpec } from '~/data/canvas-nodes'
import type { CatalogVideoModel } from '~/composables/useHougongApi'
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
/**
 * 归属：这张图画的是"哪一集 / 哪个项目"。
 *
 * 从剧集/项目页点进来时 URL 上带 `?ownerType=project&ownerId=123`，画布只当一个
 * **不透明标签**：保存时原样写入（服务端存 `owner_type`/`owner_id`）、列表时按它过滤。
 * 画布不认识"集"与"项目"（那是产品的模型），所以这里不做任何映射或校验。
 */
const route = useRoute()
const ownerType = computed(() => String(route.query.ownerType || '').trim())
const ownerId = computed(() => String(route.query.ownerId || '').trim())
const ownerQuery = computed(() => ({ type: ownerType.value, id: ownerId.value }))

const graph = ref<CanvasGraph>(emptyCanvas().graph)
const savedGraph = ref<CanvasGraph>(JSON.parse(JSON.stringify(graph.value)))
const syncConflict = ref(false)
const operationError = ref<Record<string, string>>({})
const operationStarted = new Map<string, number>()
const dirtyBaseline = ref<Record<string, { fingerprint: string, dirty: boolean }>>({})
const mutationBusy = ref(false)
const textDrafts = ref<Record<string, string>>({})
function setTextDraft(key: string, text?: string): void {
  const next = { ...textDrafts.value }
  if (text === undefined) delete next[key]
  else next[key] = text
  textDrafts.value = next
}
let graphEpoch = 0
let reloadSequence = 0
let disposed = false
const runControllers = new Map<string, AbortController>()
const graphDirty = computed(() => editFingerprint(graph.value) !== editFingerprint(savedGraph.value))
function dirtyOf(node: CanvasNode): boolean {
  const baseline = dirtyBaseline.value[node.id]
  return baseline ? baseline.dirty || baseline.fingerprint !== nodeFingerprint(node) : !runs.value.some(r => r.nodeId === node.id && r.status === 'done')
}
async function refreshPlan(snapshot: CanvasGraph, id = graphId.value): Promise<void> {
  const epoch = graphEpoch
  const revision = graphRevision.value
  try {
    const plan = await canvasApi.runPlan(id)
    if (disposed || epoch !== graphEpoch || id !== graphId.value || revision !== graphRevision.value) return
    const dirty = new Set(plan.map(n => n.nodeId))
    dirtyBaseline.value = Object.fromEntries(snapshot.nodes.map(n => [n.id, { fingerprint: nodeFingerprint(n), dirty: dirty.has(n.id) }]))
  } catch { /* 状态同步失败时保留上次明确结果，不伪造待重跑数 */ }
}

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
const loading = ref(true)
const loadError = ref('')
const batchBusy = ref(false)
const textSaving = ref(false)
const templateLoading = ref(false)
const templateError = ref('')
const selectedId = ref('')
const toast = ref('')
const detailOpen = ref(true)
/**
 * 主站侧栏的收起态（栏画在 app.vue 的壳上，这里只负责"在画布上动手时把它收起来"）。
 *
 * 画布最缺横向空间，而那条约 17vw 的侧栏一直杵着；一点画布就收成一条图标，
 * 离开画布时由壳自动展开（见 app.vue 的 route watch）。
 */
const railCollapsed = useState('hg-rail-collapsed', () => false)
/** 产物放大预览：卡片里只有两百来像素，图/视频都得能点开看清。 */
const previewOpen = ref(false)
const previewMedia = ref<{ url: string, title: string, kind: 'image' | 'video' }>({ url: '', title: '', kind: 'image' })
const runningIds = ref<string[]>([])
/** 正在流式输出的文本（真接口接上后由 SSE 实时推送）。 */
const streaming = ref<Record<string, string>>({})
/** 「继续补充」的输入：在这一版基础上还想改什么。 */
const followUpDrafts = ref<Record<string, string>>({})
const followUp = computed({ get: () => followUpDrafts.value[selectedId.value] || '', set: (value: string) => { followUpDrafts.value = { ...followUpDrafts.value, [selectedId.value]: value } } })
/** 右键菜单：点到了什么 + 屏幕坐标。 */
const menu = ref<{ x: number, y: number, kind: 'node' | 'pane' | 'edge' | 'selection' | 'connect', nodeId?: string, edgeId?: string } | null>(null)
// ---------------------------------------------------------------- 新建 / 模板

/** 起始面板：新建（空白或套模板）与另存为模板。 */
const startPanel = ref<{ mode: 'new' | 'save' } | null>(null)
const templates = ref<CanvasTemplateInfo[]>([])

/**
 * 运营下发的站点模板（只读）。拿不到就是空数组 —— 面板照常显示用户保存的本地模板。
 *
 * 这是刻意的**本地回退**：模板接口挂了不该让人打不开画布，
 * 而"运营模板"与"我自己的模板"在面板里长得一样，用户不必知道它们存哪。
 */
const siteTemplates = ref<CanvasTemplateInfo[]>([])

async function refreshSiteTemplates(): Promise<void> {
  templateLoading.value = true
  templateError.value = ''
  try {
    siteTemplates.value = canvasApi.toTemplateInfos(await canvasApi.listTemplates())
  } catch (err) {
    templateError.value = `模板加载失败：${errText(err)}`
  } finally {
    templateLoading.value = false
  }
}

async function openStart(mode: 'new' | 'save'): Promise<void> {
  if (busy.value || mutationBusy.value || runningCount.value || batchBusy.value) { showToast('请等待当前操作结束'); return }
  // 先把手里有的摆出来（本地 + 上次拉到的运营模板），**再**去拉一次：
  // 拉取是异步的，等它回来才渲染会让面板白等一个来回；但拉回来之后必须再赋一次值 ——
  // 否则这一次打开看到的永远是"拉取之前"的列表（运营模板要等下次打开才出现）。
  templates.value = [...siteTemplates.value, ...listTemplates()]
  startPanel.value = { mode }
  await refreshSiteTemplates()
  templates.value = [...siteTemplates.value, ...listTemplates()]
}

/** 换一张图（新建/套模板）后，历史基线要重建，否则能"撤销"回上一张图，很怪。 */
function replaceCanvas(payload: { graph: CanvasGraph, artifacts: CanvasArtifact[], runs: CanvasRun[] }): void {
  graphEpoch++
  reloadSequence++
  for (const controller of runControllers.values()) controller.abort()
  runControllers.clear()
  runningIds.value = []
  streaming.value = {}
  operationError.value = {}
  operationStarted.clear()
  dirtyBaseline.value = {}
  syncConflict.value = false
  savedGraph.value = JSON.parse(JSON.stringify(payload.graph))
  graph.value = payload.graph
  artifacts.value = payload.artifacts
  runs.value = payload.runs
  selectedId.value = ''
  clearSelection()
  clearDrafts()
  textDrafts.value = {}
  followUpDrafts.value = {}
  clearSlots()
  resetHistory()
  nextTick(() => fit())
}

function newBlank(): void {
  if (mutationBusy.value || textSaving.value || runningCount.value || batchBusy.value) { showToast('请等待当前操作结束'); return }
  if ((graphDirty.value || Object.keys(textDrafts.value).length || Object.values(rowDrafts.value).some(d => d.dirty)) && !window.confirm('当前画布有未保存修改，确定新建空白画布？')) return
  startPanel.value = null
  graphId.value = ''
  graphRevision.value = 0
  graphTitle.value = '未命名图'
  replaceCanvas(emptyCanvas())
  showToast('空白画布：从左栏拖节点，或从端口拖线到空白处建节点')
}

async function useTemplate(id: string): Promise<void> {
  if (busy.value || mutationBusy.value || textSaving.value || runningCount.value || batchBusy.value) { showToast('请等待当前操作结束'); return }
  if ((graphDirty.value || Object.keys(textDrafts.value).length || Object.values(rowDrafts.value).some(d => d.dirty)) && !window.confirm('当前画布有未保存修改，确定切换到模板？')) return
  startPanel.value = null
  // 站点模板要现拉结构（列表里只有名字与步数：一张图可能很大，不该随列表下发）。
  if (id.startsWith('site:')) {
    try {
      const detail = await canvasApi.getTemplate(id.slice(5))
      if (!detail.graph) {
        showToast('这个模板已经下架了')
        return
      }
      // 与内置模板同一口径：**只给结构**，产物与运行记录一律为空。
      graphId.value = ''
      graphRevision.value = 0
      replaceCanvas({
        graph: { ...detail.graph, nodes: (detail.graph.nodes ?? []).map(n => ({ ...n, outputs: {} })) },
        artifacts: [],
        runs: []
      })
      showToast('已套用运营模板')
    } catch {
      showToast('这个模板暂时拉不下来，稍后再试')
    }
    return
  }
  const payload = loadTemplate(id)
  if (!payload) {
    showToast('这个模板读不出来了')
    return
  }
  graphId.value = ''
  graphRevision.value = 0
  replaceCanvas(payload)
  showToast('已套用模板')
}

function saveAsTemplate(name: string): void {
  const saved = saveTemplate(name, JSON.parse(JSON.stringify(graph.value)) as CanvasGraph)
  startPanel.value = null
  showToast(saved ? `已存成模板「${saved.name}」（存在这台浏览器本地）` : '这台浏览器存不了模板')
}

function dropTemplate(id: string): void {
  const removed = removeTemplate(id)
  templates.value = [...siteTemplates.value, ...listTemplates()]
  showToast(removed ? '模板已删除' : '模板删除失败：无法写入本机存储')
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
  transaction: historyTransaction,
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
/** 每一步用的模型不一样：按节点声明的 modelKind 分桶，参数里的「模型」下拉按桶填。 */
const modelOptions = ref<Record<string, { value: string, label: string }[]>>({})

/** 目录里的可用视频模型（带能力表；画幅/清晰度候选与创作框取自同一处）。 */
const videoModels = ref<CatalogVideoModel[]>([])

/** 目录里所有可用视频模型声明的分辨率档（后台可配，与创作框同一份来源）。 */
const videoModelResolutions = ref<{ ratio: string, label?: string, width: number, height: number }[]>([])

/**
 * 成片导出「基准画幅」的候选：**视频模型能力表的并集**。
 *
 * 为什么不能写死：产物备注里的分辨率就是按模型能力表算出来的（服务端 `videoSizeOf`
 * 读的是同一张表），写死的 768x1344 与云端模型实际出的 736x1280 永远对不上 ——
 * 导出清单会把每个片段都误标成"与基准不一致"。候选与产物同源，才不会自相矛盾。
 * 这与创作框那边取分辨率/画幅的方式一致（都是读 catalog 的模型能力）。
 */
const baselineOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const m of videoModelResolutions.value) {
    const value = `${m.width}x${m.height}`
    if (!m.width || !m.height || seen.has(value)) continue
    seen.set(value, `${value} · ${m.ratio}${m.label ? `（${m.label}）` : ''}`)
  }
  return [...seen.entries()].map(([value, label]) => ({ value, label }))
})

/**
 * 某个节点要用到的动态候选（按参数 key）。
 *
 * 两类：
 *   - 全局的（`baseline`）：候选是**所有**视频模型分辨率档的并集 —— 导出的基准是
 *     "这一集按哪个尺寸交付"，与具体哪个模型无关；
 *   - 跟节点所选模型走的（`ratio` / `resolution`）：画幅与清晰度是**模型的能力**，
 *     换模型就该换候选。创作框那边也是这么取的（`videoRatios` / `videoSizeFor`）。
 *
 * 取不到能力（离线、目录没接通）时返回空 —— 组件会退回节点定义里的静态选项，
 * 而不是给一个空下拉（空下拉让人以为"界面坏了"）。
 */
/**
 * 连线指过来的上游产物：**这一步真正会用的那一版**，以及这个槽位的全部版本。
 *
 * "真正会用哪一版"以**本节点的输入引用**为准（`inputs[slot][].artifactId`）——
 * 依赖本来就是按"哪个产物的哪个版本"记的（R2 §2），所以两个角色设定节点可以各用各的版本。
 * 只有引用没写时（老图、刚连的线）才退回上游的"当前选用"。
 *
 * 这一步搞反过一次：提示读的是**上游的当前选用**，于是上游跑到 v5、这一步接的还是
 * 已认可的 v4，界面却在喊"上游「场景列表」还没认可 · 当前选用 v4" ——
 * 说的是别人家的版本，用户既没法处理、也不敢往下跑（用户 2026-09-19 反馈）。
 *
 * 候选只认**已认可**的版本（§0.7 先确认再下一步）。但"这一步接的那版恰好没认可"是常态
 * （重跑上游会自动把下游引到新版），所以另给 `approved`：候选退回到同槽位最新的已认可版本，
 * 绝不空下拉 —— 空下拉不是"更安全"，是让人以为功能坏了。
 */
function upstreamSlotOf(node: CanvasNode, slot: string) {
  return graph.value.edges
    .filter(e => e.to.node === node.id && e.to.slot === slot)
    .flatMap((e) => {
      const upstream = graph.value.nodes.find(n => n.id === e.from.node)
      if (!upstream) return []
      const ownRef = (node.inputs?.[slot] ?? []).find(r => r.from === upstream.id && r.slot === e.from.slot)
      const wired = ownRef?.artifactId ? artifacts.value.find(a => a.id === ownRef.artifactId) : undefined
      const picked = wired ?? artifacts.value.find(a => a.id === upstream.outputs[e.from.slot]?.artifactId)
      const approved = artifacts.value
        .filter(a => a.nodeId === upstream.id && a.slot === e.from.slot && a.review === 'approved')
        .sort((a, b) => b.version - a.version)
      // `latest`：上游那一口现在选的是哪一版（用于"上游有新版本"的非阻断提示）
      const latest = artifacts.value.find(a => a.id === upstream.outputs[e.from.slot]?.artifactId)
      return [{ upstream, picked, approved, latest, wired: !!wired }]
    })
}

/**
 * 角色候选。值绑定 `<产物ID>:<第几项>`（不是名字）：上游出新版时能提示"重新选择"，
 * 而不会悄悄换成另一个人。
 *
 * 当前选用的那一版没认可时，退回到**同槽位最新的已认可版本**并照常在标签里写版本号 ——
 * 空下拉不是"更安全"，而是让人以为功能坏了（用户 2026-09-19 报的"拉不到上游"）。
 */
function charactersOf(node: CanvasNode) {
  return upstreamSlotOf(node, 'characters').flatMap(({ upstream, picked, approved }) => {
    const artifact = picked?.review === 'approved' ? picked : approved[0]
    if (!artifact) return []
    return characterEntries(artifact.text || '').map(c => ({
      ...c,
      value: `${artifact.id}:${c.index}`,
      label: `${c.name} · v${artifact.version} · ${upstream.title || '人物列表'}`
    }))
  })
}

function characterPrompt(node: CanvasNode): string | undefined {
  const chosen = charactersOf(node).find(c => c.value === node.params.characterSource)
  if (!chosen) return undefined
  return `仅生成角色「${chosen.name}」的设定参考，不生成其他角色。以以下已确认的人物信息为准：\n${chosen.description}\n补充外观要求（不得改变人物身份）：${String(node.params.characterNotes || '无')}`
}

/**
 * 场景候选。与角色完全同一套口径（同一份 `upstreamSlotOf`，退回最新已认可版本、
 * 值绑定 `<产物ID>:<第几项>`）—— 场景此前是**自由文本的「场景名」**，
 * 于是同一个场景被写成两个不同的字面量，图上就多出一个假场景（用户 2026-09-19 指出）。
 */
function scenesOf(node: CanvasNode) {
  return upstreamSlotOf(node, 'scenes').flatMap(({ upstream, picked, approved }) => {
    const artifact = picked?.review === 'approved' ? picked : approved[0]
    if (!artifact) return []
    return sceneEntries(artifact.text || '').map(s => ({
      ...s,
      value: `${artifact.id}:${s.index}`,
      label: `${s.name} · v${artifact.version} · ${upstream.title || '场景列表'}`
    }))
  })
}

function scenePrompt(node: CanvasNode): string | undefined {
  const chosen = scenesOf(node).find(s => s.value === node.params.sceneSource)
  if (!chosen) return undefined
  return `仅生成场景「${chosen.name}」的环境参考，不生成其他场景。以以下已确认的场景信息为准：\n${chosen.description}\n补充环境要求（不得改变场景身份）：${String(node.params.sceneNotes || '无')}`
}

/**
 * 「这一镜」候选：上游分镜表的每一行。
 *
 * 首帧/视频节点接的是**整张分镜表**，服务端按 `node.ref.shotIdx` 取那一行
 * （没有就退回第一行）。批量「生成节点」会带上镜号，手动建的不会 ——
 * 所以这里把行列出来让用户选，值就是行号（与分镜表里的 `idx` 同一个数字）。
 */
function shotsOf(node: CanvasNode) {
  return upstreamSlotOf(node, 'shot').flatMap(({ upstream, picked, approved }) => {
    const artifact = picked?.review === 'approved' ? picked : approved[0]
    const rows = artifact?.rows ?? []
    return rows.map(r => ({
      value: String(r.idx),
      label: `S${String(r.idx).padStart(2, '0')}${r.shotSize ? ` · ${r.shotSize}` : ''}${r.line ? ` · ${r.line}` : ''} · v${artifact?.version} · ${upstream.title || '分镜表'}`
    }))
  })
}

function dynamicOptionsOf(node: CanvasNode): Record<string, { value: string, label: string }[]> {
  const out: Record<string, { value: string, label: string }[]> = { baseline: baselineOptions.value }
  if (node.kind === 'character') out.characterSource = charactersOf(node).map(c => ({ value: c.value, label: c.label }))
  if (node.kind === 'scene') out.sceneSource = scenesOf(node).map(s => ({ value: s.value, label: s.label }))
  // 「这一镜」：首帧与视频都接分镜表，两个节点用同一份候选（同一张表，不该有两种取法）。
  if (node.kind === 'keyframe' || node.kind === 'i2v') out.shotIdx = shotsOf(node)
  const modelId = String(node.params.modelId ?? '')
  const resolutions = videoModelResolutionsOf(modelId)
  if (resolutions.length) {
    // 画幅：去重；标签带上像素尺寸，用户才知道 9:16 意味着多少（与创作框一致）。
    const seenRatio = new Map<string, string>()
    for (const r of resolutions) {
      if (!r.ratio || seenRatio.has(r.ratio)) continue
      seenRatio.set(r.ratio, r.width && r.height ? `${r.ratio} · ${r.width}x${r.height}` : r.ratio)
    }
    out.ratio = [...seenRatio.entries()].map(([value, label]) => ({ value, label }))

    // 清晰度：**只给当前画幅下的档**（不同画幅可能配不同 label）；
    // 没选画幅时给该模型所有 label（去重）。
    const ratio = String(node.params.ratio ?? '')
    const labels = [...new Set(
      resolutions
        .filter(r => !ratio || r.ratio === ratio)
        .map(r => r.label)
        .filter((label): label is string => !!label)
    )]
    if (labels.length) out.resolution = labels.map(label => ({ value: label, label }))
  }
  return out
}

/** 某个视频模型声明的分辨率档（模型没选/不是视频模型时为空）。 */
function videoModelResolutionsOf(modelId: string) {
  if (!modelId) return []
  return videoModels.value.find(m => m.id === modelId)?.resolutions ?? []
}

/**
 * 换模型后把画幅/清晰度收敛到新模型支持的档。
 *
 * 为什么要收敛：候选换了但值还留着旧模型的值时，服务端会**静默回落到首选档**
 * （`videoFormatOf`），用户看到的是"我选的画幅没生效"；更糟的是清晰度可能发成
 * 新模型不认的 label，被上游拒。创作框那边有同样的收敛（watch modelId）。
 */
function convergeVideoFormat(node: CanvasNode): void {
  const resolutions = videoModelResolutionsOf(String(node.params.modelId ?? ''))
  if (!resolutions.length) return
  const preferred = resolutions.find(r => r.ratio === '9:16') ?? resolutions[0]
  const ratio = String(node.params.ratio ?? '')
  if (!resolutions.some(r => r.ratio === ratio)) {
    setParam(node, 'ratio', preferred?.ratio ?? '')
  }
  const currentRatio = String(node.params.ratio ?? '') || preferred?.ratio || ''
  const labels = resolutions.filter(r => r.ratio === currentRatio).map(r => r.label).filter(Boolean)
  const resolution = String(node.params.resolution ?? '')
  if (labels.length && !labels.includes(resolution)) {
    setParam(node, 'resolution', labels[0])
  }
}

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

/**
 * 多口输出的节点当前在看哪一口（卡片与右栏共用一份，见 useCanvasSlots）。
 *
 * 点卡片上那一口、或点右栏的口，都走 openSlot / setActiveSlot —— 一处记住，两处显示一致。
 */
const { activeSlotOf, setActiveSlot, clearSlots } = useCanvasSlots()

/** 点卡片上某一口：切到这一口并把它选出来（右栏于是显示这一口的版本与正文）。 */
function openSlot(nodeId: string, name: string): void {
  setActiveSlot(nodeId, name)
  selectedId.value = nodeId
  detailOpen.value = true
  focusCanvas()
}

/** 一点画布（空白处或节点）就把主站侧栏收起来：这一页的横向空间要留给图。 */
function focusCanvas(): void {
  if (!railCollapsed.value) railCollapsed.value = true
}

/** 点空白处：取消选中，并收起侧栏。 */
function onPaneClick(): void {
  selectedId.value = ''
  focusCanvas()
}

/** 点节点卡：选中它，并收起侧栏。 */
function onNodeOpen(nodeId: string): void {
  selectedId.value = nodeId
  detailOpen.value = true
  focusCanvas()
}
const pending = computed(() => pendingReviewCount(artifacts.value))
const totalCost = computed(() => runs.value.reduce((sum, r) => sum + (r.costCredits ?? 0), 0))
const runningCount = computed(() => new Set([...runningIds.value, ...runs.value.filter(r => r.status === 'running').map(r => r.nodeId)]).size)
const readyCount = computed(() =>
  graph.value.nodes.filter(n => stateOf(n) === 'ready').length
)
/**
 * 「待重跑」= 现在真的能跑、且需要跑的节点数。
 *
 * 未开放的（planned）不算；等待上游、等待确认的也不算 —— 它们不是"脏"，
 * 是卡在别的东西上，混进来只会让人以为点一下「运行全部」就能推下去。
 */
const dirtyCount = computed(() =>
  graph.value.nodes.filter(dirtyOf).map(n => n.id).filter((id) => {
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

/**
 * 节点运行态。
 *
 * **本地"正在跑"优先于 runs 表**：前端开跑时只往 `runningIds` 记了一笔，
 * 并没有往 runs 里塞一条 running（服务的记录要等第一个事件回来）——
 * 只看 runs 的话，右栏那块「实时输出」的显示条件（`state === 'running'`）永远不成立，
 * 表现就是用户看到的**"吐字只在卡片上，右栏一个字都没有、也没有动效"**。
 */
function stateOf(node: CanvasNode): CanvasNodeState {
  if (runningIds.value.includes(node.id)) return 'running'
  if (runningIds.value.includes(node.id)) return 'running'
  const state = nodeState(graph.value, node, runs.value, artifacts.value)
  return operationError.value[node.id] && !['running', 'blocked', 'awaiting'].includes(state) ? 'failed' : state
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

const arranging = ref(false)
const layoutPositions = shallowRef<Record<string, LayoutPoint> | null>(null)
let layoutFrame = 0
let layoutDisposed = false
const canArrange = computed(() => graph.value.nodes.length > 0 && wideScreen.value && !busy.value && !loading.value && !loadError.value && !runningCount.value && !runningIds.value.length && !batchBusy.value)

const flowNodes = computed<Node[]>(() =>
  graph.value.nodes.map(n => ({
    id: n.id,
    type: 'cg',
    position: layoutPositions.value?.[n.id] ?? { x: n.at.x, y: n.at.y },
    data: {
      node: n,
      spec: nodeTypeSpec(n.kind),
      state: stateOf(n),
      dirty: dirtyOf(n),
      linked: linkHighlighted(n.id),
      artifacts: artifacts.value.filter(a => a.nodeId === n.id),
      modelLabel: modelLabelOf(n),
      frameGrid: graph.value.frameGrid,
      tableRows: tableRowsOf(n),
      tableDirty: rowsDirty(n.id),
      activeSlot: activeSlotOf(n),
      modelOptions: modelOptions.value,
      optionsByKey: dynamicOptionsOf(n),
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
  if (arranging.value) return
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
  const state = stateOf(node)
  const disabled = busy.value || spec.stage !== 'ready' || ['running', 'blocked', 'awaiting'].includes(state)
  return [
    { key: 'status', tone: NODE_STATE_META[state].tone, label: NODE_STATE_META[state].label, icon: state === 'running' ? 'i-lucide-loader-circle' : 'i-lucide-info', disabled: true },
    { key: 'edit', label: '编辑 / 详情', icon: 'i-lucide-sliders-horizontal' },
    { key: 'rename', label: '重命名', icon: 'i-lucide-pen-line' },
    { key: 'duplicate', label: '复制节点', icon: 'i-lucide-copy', hint: '⌘C' },
    { key: 'copy', label: '复制到剪贴板', icon: 'i-lucide-clipboard-copy' },
    { key: 'run', label: '运行这个节点', icon: 'i-lucide-play', hint: cost ? `约 ${creditsToYuan(cost)}` : undefined, disabled },
    { key: 'rerun', label: '重新生成（忽略缓存）', icon: 'i-lucide-refresh-cw', disabled },
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
  { key: 'reload', label: '同步服务端状态（保留编辑）', icon: 'i-lucide-refresh-cw' },
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
  if (ids.some(id => runningIds.value.includes(id) || runs.value.some(r => r.nodeId === id && r.status === 'running'))) { showToast('选区包含运行中的节点，暂不能删除'); return }
  for (const id of ids) removeNode(graph.value, id)
  if (ids.includes(selectedId.value)) selectedId.value = ''
  showToast(`已删除 ${ids.length} 个节点`)
}

/** 依次运行选中的节点（跳过错过的：等上游/等确认的）。 */
async function runSelected(): Promise<void> {
  const ids = selectedNodeIds()
  const counts = { done: 0, queued: 0, failed: 0, skipped: 0 }
  if (batchBusy.value || busy.value || runningCount.value) return
  batchBusy.value = true
  try {
    for (const id of ids) {
      const node = graph.value.nodes.find(n => n.id === id)
      if (!node) continue
      const st = stateOf(node)
      if (st === 'blocked' || st === 'awaiting' || st === 'running') { counts.skipped++; continue }
      counts[await runNode(id, { silent: true, batch: true })]++
    }
    showToast(`已完成 ${counts.done} · 已提交 ${counts.queued} · 失败 ${counts.failed} · 跳过 ${counts.skipped}`)
  } finally { batchBusy.value = false }
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
  if (arranging.value) return
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
  if (runningIds.value.includes(nodeId) || runs.value.some(r => r.nodeId === nodeId && r.status === 'running')) { showToast('节点仍在运行，暂不能删除'); return }
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
  // 幂等：重复点只补缺的，说清"新建了几个、复用了几个"，别让人以为又叠了一套
  showToast(res.nodes.length
    ? `新建 ${res.nodes.length} 个节点${res.reused.length ? `，复用已有 ${res.reused.length} 个` : ''}（同一镜不会重复建）`
    : `这一批 ${res.reused.length} 个节点都已存在，只补了缺的连线`)

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
  loading.value = true
  loadError.value = ''
  try {
    let target = id || ''
    if (!target) {
      const list = await canvasApi.listGraphs('hougong', ownerQuery.value)
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
    await refreshPlan(view.graph)
    // 把"在看哪张图"写回 URL：刷新、发给别人、回退都落到同一张
    // （不然刷新一下又回到"最近那张"，看起来就像图丢了）
    const currentID = String(route.query.id || '')
    if (currentID !== graphId.value) {
      const query = { ...route.query, id: graphId.value }
      history.replaceState(history.state, '', `${route.path}?${new URLSearchParams(query as Record<string, string>).toString()}`)
    }
    showToast(`已载入「${graphTitle.value}」`)
  } catch (err) {
    loadError.value = `载入失败：${errText(err)}`
    showToast(loadError.value)
  } finally {
    busy.value = false
    loading.value = false
  }
}

/**
 * 保存整张图。
 *
 * 更新时带 `revision`（打开时看到的版本号）：另一个标签页改过就会被服务端挡下来，
 * 提示"先重新载入"——而不是把对方的工作静默盖掉。
 */
/**
 * 正在进行的保存。**并发调用共用同一次**：各存各的会在 revision 上互相打架
 * （后一个拿旧 revision 提交 → 被服务端挡成 stale），而且"边跑边落库"的场景里
 * 每个节点开跑前都要存一次 —— 不共用的话，第二个节点会看到"正在保存"直接放弃，
 * 表现就是"生产 A 的时候 B 点不动"（用户 2026-09-19）。
 */
let saveInFlight: Promise<boolean> | null = null

function saveToServer(silent = false): Promise<boolean> {
  if (saveInFlight) return saveInFlight
  saveInFlight = persistGraph(silent).finally(() => { saveInFlight = null })
  return saveInFlight
}

async function persistGraph(silent = false): Promise<boolean> {
  if (syncConflict.value || loadError.value) {
    showToast(syncConflict.value
      ? '这张图在别处被改过，已暂停保存 —— 点上面那行「放弃本地修改并重新载入」'
      : '图还没载入成功，保存不了 —— 点「放弃本地修改并重新载入」重来一次')
    return false
  }
  busy.value = true
  const epoch = graphEpoch
  const sentGraph = JSON.parse(JSON.stringify(graph.value)) as CanvasGraph
  try {
    const summary = await canvasApi.saveGraph({
      id: graphId.value,
      title: graphTitle.value,
      product: 'hougong',
      // 归属：URL 里带了就写进去（"先画后挂"也走这里 —— 服务端只在带了归属时覆盖）。
      ownerType: ownerType.value || undefined,
      ownerId: ownerId.value || undefined,
      graph: sentGraph,
      revision: graphRevision.value
    })
    if (disposed || epoch !== graphEpoch) return false
    savedGraph.value = sentGraph
    graphId.value = summary.id
    graphRevision.value = summary.revision
    await refreshPlan(sentGraph, summary.id)
    if (!silent) showToast(`已保存（v${summary.revision}）`)
    return true
  } catch (err) {
    const message = errText(err)
    showToast(message.includes('stale') || message.includes('版本')
      ? '这张图在别处被改过了 —— 先重新载入，再改'
      : `保存失败：${message}`)
    return false
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
    if (disposed || eventAbort?.signal.aborted) return
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
    if (disposed || eventAbort.signal.aborted) return
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
  opts: { silent?: boolean, base?: CanvasArtifact, followUp?: string, force?: boolean, batch?: boolean } = {}
): Promise<'done' | 'queued' | 'failed' | 'skipped'> {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node) return 'skipped'
  const spec = nodeTypeSpec(node.kind)
  if (spec.stage === 'planned') {
    if (!opts.silent) showToast('这个节点本版未开放')
    return 'skipped'
  }
  if (Object.keys(textDrafts.value).some(key => key.startsWith(`${nodeId}:`)) || rowsDirty(nodeId)) { showToast('请先保存或放弃这个节点的草稿，再运行'); return 'skipped' }
  const state = stateOf(node)
  if (state === 'blocked') {
    if (!opts.silent) showToast('上游还没就绪，先跑上游节点')
    return 'skipped'
  }
  if (state === 'awaiting') {
    if (!opts.silent) showToast('上游产物还没确认 —— 先在上游节点里点「认可」，再跑这一步')
    return 'skipped'
  }
  if (state === 'running') return 'skipped'
  if (node.kind === 'character') {
    const prompt = characterPrompt(node)
    if (!prompt) {
      onNodeOpen(node.id)
      showToast('请先确认上游人物列表，再选择本节点的角色；上游版本变化后需重新选择')
      return 'skipped'
    }
    node.params = { ...node.params, appearance: prompt }
  }
  // 场景与角色同一条规矩：跑之前把"这一版里的这一个场景"拼进提示词，
  // 没选就直说（而不是拿一个自由文本的旧场景名去出图）。
  if (node.kind === 'scene') {
    const prompt = scenePrompt(node)
    if (!prompt) {
      onNodeOpen(node.id)
      showToast('请先确认上游场景列表，再选择本节点的场景；上游版本变化后需重新选择')
      return 'skipped'
    }
    node.params = { ...node.params, appearance: prompt }
  }
  // 「这一镜」：接了分镜表却没选镜号时，按**第一镜**跑之前说清（服务端 want=-1 就是第一行），
  // 免得用户以为按的是他接的那一镜。
  if ((node.kind === 'keyframe' || node.kind === 'i2v') && !opts.silent) {
    const want = Number(node.params.shotIdx ?? node.ref?.shotIdx ?? 0)
    if (!want && shotRowsOf(node).length) showToast('没选「这一镜」，这次按第一镜算')
  }
  if (syncConflict.value) { showToast('这张图在别处被改过 —— 点上面那行「放弃本地修改并重新载入」，再继续'); return 'skipped' }
  if (mutationBusy.value) { showToast('上一个操作还没落库，稍等一下再点'); return 'skipped' }
  if (batchBusy.value && !opts.batch) { showToast('「运行全部」正在进行中'); return 'skipped' }
  const epoch = graphEpoch
  const current = () => !disposed && epoch === graphEpoch
  const controller = new AbortController()
  runControllers.set(nodeId, controller)
  runningIds.value = [...runningIds.value, nodeId]
  const errors = { ...operationError.value }
  delete errors[nodeId]
  operationError.value = errors
  operationStarted.set(nodeId, Math.floor(Date.now() / 1000) * 1000)
  streaming.value = { ...streaming.value, [nodeId]: '' }
  let result: 'done' | 'queued' | 'failed' | 'skipped' = 'skipped'
  try {
    if (!await saveToServer(true) || !current()) return 'skipped'
    await canvasApi.runNodeStream({
      id: graphId.value,
      nodeId,
      force: !!opts.force,
      baseArtifactId: opts.base?.id,
      instruction: opts.followUp,
      // 单点「运行」= 用户正在等这一步：给高分，插到批量任务前面
      // （「运行全部」逐节点调用时走 priority 0，见 runAll）。
      priority: opts.batch ? 0 : 10
    }, {
      onDelta: (text) => {
        if (!current()) return
        streaming.value = { ...streaming.value, [nodeId]: (streaming.value[nodeId] ?? '') + text }
      },
      onArtifact: (payload) => {
        if (!current()) return
        result = 'done'
        const list = (payload.artifacts?.length ? payload.artifacts : (payload.artifact ? [payload.artifact] : []))
          .map(toCanvasArtifact)
        mergeArtifacts(list)
        // 服务端返回的 run 是权威：用它的 id/状态/花费覆盖本地那条。
        if (payload.run) upsertRun(toCanvasRun(payload.run))
        // 这一口的产物跑完即成为"当前选用"。**多口一起落**（剧本拆解三口）时
        // 每一口都要选：下游的输入引用是按口记的，只选第一口会让另外两口的下游永远"等待上游"。
        const fresh = list.filter(a => a.nodeId === nodeId)
        selectFreshArtifacts(graph.value, fresh)
        // 选完**立刻落盘**：只在内存里改的话，刷新/别的标签页看到的还是旧版 ——
        // "上游已经跑到 v5，界面还写当前选用 v4"就是这么来的（用户 2026-09-19）。
        if (fresh.length) void saveToServer(true)
        showToast(payload.cached ? '内容没变，直接用已有产物（没有重新计费）' : '产物已生成，请确认结果')
      },
      onQueued: (payload) => {
        if (!current()) return
        result = 'queued'
        if (payload.run) upsertRun(toCanvasRun(payload.run))
        showToast('任务已提交，等待服务端返回结果')
      }
    }, controller.signal)
  } catch (err) {
    result = 'failed'
    if (current()) {
      operationError.value = { ...operationError.value, [nodeId]: errText(err) }
      showToast(`运行失败：${errText(err)}`)
    }
  } finally {
    runControllers.delete(nodeId)
    if (current()) {
      runningIds.value = runningIds.value.filter(id => id !== nodeId)
      if (result !== 'failed') {
        const rest = { ...streaming.value }
        delete rest[nodeId]
        streaming.value = rest
      }
      await reloadGraph()
    }
  }
  return result
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
  // 接着改的是**右栏正在看的那一口**（剧本拆解三口各自能"带补充再生成一版"）。
  const slot = activeSlotOf(node) || spec.outputs[0]?.slot || ''
  const picked = slot ? node.outputs[slot] : undefined
  const base = picked ? artifacts.value.find(a => a.id === picked.artifactId) : undefined
  // 强制重跑：同一版 + 不同补充要求本来就该出新版本（服务端也把它算进参数指纹）。
  const result = await runNode(nodeId, { base, followUp: note, force: true })
  if ((result === 'done' || result === 'queued') && followUpDrafts.value[nodeId] === note) followUpDrafts.value = { ...followUpDrafts.value, [nodeId]: '' }
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
 * 运行全部：**计划由服务端算**（拓扑序 + 脏节点判定），前端只负责按层并发地跑。
 *
 * 为什么不由前端算脏：脏 = 没跑过 / 参数变了 / 上游换了新版，其中"参数变了"靠
 * `params_hash`，那是服务端口径。前端算的结果一旦与服务端不一致，表现是
 * "点了运行全部却白花钱"或"该跑的没跑"，而且都不报错。
 */
async function runAll(): Promise<void> {
  if (batchBusy.value || busy.value || runningCount.value) return
  batchBusy.value = true
  try {
    if (!graphId.value) {
      await saveToServer(true)
      if (!graphId.value) {
        showToast('先保存成功才能运行整张图')
        return
      }
    }
    // 先把当前编辑落库：服务端算计划用的是**库里的图**，不是屏幕上的草稿。
    if (!await saveToServer(true)) return
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
    const counts = { done: 0, queued: 0, failed: 0, skipped: blocked }
    // 一层一层来：层内并发（互不依赖），层间串行（下游要等上游产物落库）。
    for (const level of dependencyLevels(graph.value, runnable.map(p => p.nodeId))) {
      const results = await Promise.all(level.map(id =>
        // batch: true → 建单优先级 0：批量任务给"用户正在等的单点操作"让路。
        runNode(id, { silent: true, batch: true })
      ))
      for (const r of results) counts[r]++
    }
    // 跑完再拉一次整图：异步任务（图/视频）的产物是后端收敛后落库的。
    if (await reloadGraph()) showToast(`已完成 ${counts.done} · 已提交 ${counts.queued} · 失败 ${counts.failed} · 跳过 ${counts.skipped}；下游确认后再执行`)
  } finally {
    batchBusy.value = false
  }
}

/** 重新拉一遍整图（产物/运行以服务端为准）。 */
async function reloadGraph(): Promise<boolean> {
  if (!graphId.value || disposed) return false
  if (busy.value || mutationBusy.value || textSaving.value) { scheduleReload(); return false }
  const id = graphId.value
  const epoch = graphEpoch
  const sequence = ++reloadSequence
  try {
    const view = await canvasApi.getGraph(id)
    if (disposed || epoch !== graphEpoch || id !== graphId.value || sequence !== reloadSequence || view.summary.revision < graphRevision.value) return false
    if (busy.value || mutationBusy.value || textSaving.value) { scheduleReload(); return false }
    const merged = mergeCanvas(graph.value, savedGraph.value, view.graph)
    syncConflict.value = merged.conflict
    graph.value = merged.graph
    artifacts.value = view.artifacts
    runs.value = view.runs
    const errors = { ...operationError.value }
    for (const [nodeId, started] of operationStarted) {
      if (view.runs.some(r => r.nodeId === nodeId && r.status === 'done' && Date.parse(r.startedAt) >= started)) delete errors[nodeId]
    }
    operationError.value = errors
    if (!merged.conflict) {
      graphRevision.value = view.summary.revision
      savedGraph.value = JSON.parse(JSON.stringify(view.graph))
    }
    await refreshPlan(view.graph, id)
    return true
  } catch (err) {
    if (!disposed && epoch === graphEpoch) showToast(`状态同步失败：${errText(err)}`)
    return false
  }
}

async function resolveConflict(): Promise<void> {
  if (!window.confirm('服务端也修改了这张图。重新载入会放弃本地画布修改，确定继续？')) return
  // 硬重置瞬态标记：这是**唯一的出路**，如果它被卡住的 busy/在飞状态挡住，
  // 用户就会陷入"保存不了、运行不了、连重载也没反应"（用户 2026-09-19）。
  busy.value = false
  mutationBusy.value = false
  textSaving.value = false
  batchBusy.value = false
  runningIds.value = []
  streaming.value = {}
  operationError.value = {}
  syncConflict.value = false
  loadError.value = ''
  await loadFromServer(graphId.value)
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
  if (!graphId.value || mutationBusy.value || textSaving.value || busy.value) return
  mutationBusy.value = true
  const epoch = graphEpoch
  try {
    const revision = await canvasApi.pickArtifact({
      id: graphId.value,
      nodeId,
      slot: artifact.slot,
      artifactId
    })
    if (epoch !== graphEpoch || disposed) return
    graphRevision.value = revision
    selectArtifact(graph.value, artifact)
  } catch (err) {
    showToast(`选定没能保存：${errText(err)}`)
  } finally { mutationBusy.value = false }
}

/** 组内选用第几张 —— 三视图/首帧"挑一张"，选中的那张才往下走。 */
async function pickItem(nodeId: string, artifactId: string, index: number): Promise<void> {
  const artifact = artifacts.value.find(a => a.id === artifactId)
  if (!artifact) return
  if (!graphId.value || mutationBusy.value || textSaving.value || busy.value) return
  mutationBusy.value = true
  const epoch = graphEpoch
  try {
    const revision = await canvasApi.pickArtifact({
      id: graphId.value,
      nodeId,
      slot: artifact.slot,
      artifactId,
      item: index
    })
    if (epoch !== graphEpoch || disposed) return
    graphRevision.value = revision
    artifacts.value = withItemPicked(graph.value, artifacts.value, artifactId, index)
    showToast(`已选用第 ${index + 1} 张，下游按这张走`)
  } catch (err) {
    showToast(`选定没能保存：${errText(err)}`)
  } finally { mutationBusy.value = false }
}

/** 审核一份产物（审核对象是**产物**，不是节点）。 */
async function review(nodeId: string, artifactId: string, action: 'approved' | 'rejected'): Promise<void> {
  if (action === 'approved' && (Object.keys(textDrafts.value).some(key => key.startsWith(`${nodeId}:`)) || rowsDirty(nodeId))) { showToast('请先保存或放弃草稿，再确认产物'); return }
  if (!graphId.value || mutationBusy.value || textSaving.value || busy.value) return
  mutationBusy.value = true
  const epoch = graphEpoch
  try {
    await canvasApi.reviewArtifact({ id: graphId.value, artifactId, review: action })
    if (epoch !== graphEpoch || disposed) return
    artifacts.value = artifacts.value.map(a => (a.id === artifactId ? { ...a, review: action } : a))
    showToast(action === 'approved' ? '已认可这一份' : '已驳回，产物还在，可重跑')
  } catch (err) {
    showToast(`审核没能保存：${errText(err)}`)
  } finally { mutationBusy.value = false }
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
  const rows = tableRowsOf(node)
  const oldId = node.outputs[nodeTypeSpec(node.kind).outputs[0]?.slot || 'table']?.artifactId || ''
  if (!rows.length) { showToast('没有可保存的分镜'); return }
  if (await commitArtifact(node, nodeTypeSpec(node.kind).outputs[0]?.slot || 'table', { rows: JSON.parse(JSON.stringify(rows)), note: `${rows.length} 镜 · 手工修改` })) discardRows(nodeId, oldId)
}

async function saveText(nodeId: string, text: string): Promise<void> {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (!node || !text.trim()) return
  const slot = activeSlotOf(node)
  const oldId = node.outputs[slot]?.artifactId || ''
  if (node.kind === 'script_split') {
    const original = artifacts.value.find(a => a.id === oldId)?.text || ''
    const error = validateStructuredEdit(original, text, slot)
    if (error) { showToast(error); return }
  }
  if (await commitArtifact(node, slot, { text: text.trim(), note: `${text.length} 字 · 手工修改` })) setTextDraft(`${nodeId}:${slot}:${oldId}`)
}

async function commitArtifact(node: CanvasNode, slot: string, body: { text?: string, rows?: CanvasShotRow[], note: string }): Promise<boolean> {
  if (textSaving.value || mutationBusy.value || busy.value || stateOf(node) === 'running') return false
  textSaving.value = true
  const epoch = graphEpoch
  try {
    if (!await saveToServer(true) || disposed || epoch !== graphEpoch) return false
    const id = graphId.value
    const saved = await canvasApi.saveArtifact({ id, nodeId: node.id, slot, type: nodeTypeSpec(node.kind).outputs.find(o => o.slot === slot)?.type, ...body })
    const artifact = toCanvasArtifact(saved)
    const revision = await canvasApi.pickArtifact({ id, nodeId: node.id, slot, artifactId: artifact.id })
    if (disposed || epoch !== graphEpoch) return false
    graphRevision.value = revision
    mergeArtifacts([artifact])
    selectArtifact(graph.value, artifact)
    showToast(`已保存并选用 v${artifact.version}，确认后供下游使用`)
    return true
  } catch (err) {
    if (!disposed && epoch === graphEpoch) showToast(`保存或选用失败，草稿已保留：${errText(err)}`)
    return false
  } finally {
    textSaving.value = false
    if (!disposed && epoch === graphEpoch) await reloadGraph()
  }
}

/** 删一份产物（被选定的删不掉 —— 服务端会拒，前端先把话说清楚）。 */
async function removeArtifact(artifactId: string): Promise<void> {
  if (!graphId.value || mutationBusy.value || busy.value || textSaving.value) return
  mutationBusy.value = true
  const epoch = graphEpoch
  try {
    await canvasApi.delArtifact({ id: graphId.value, artifactId })
    if (disposed || epoch !== graphEpoch) return
    artifacts.value = artifacts.value.filter(a => a.id !== artifactId)
    showToast('产物已删除')
  } catch (err) {
    showToast(`删不掉：${errText(err)}`)
  } finally { mutationBusy.value = false }
}

/** 放大看产物：图/视频都在**页面内**看大的（新标签页会把画布顶掉，回来看不到上下文）。 */
function openArtifact(artifact: CanvasArtifact): void {
  if (!artifact.url) return
  const kind = artifact.type === 'video' || artifact.type === 'cut' ? 'video' : 'image'
  openPreview(artifact.url, `${artifact.note || '产物'} · v${artifact.version}`, kind)
}

/** 通用放大：卡片缩略图、右栏候选都走这里（复用首页/素材页那个完整预览）。 */
function openPreview(url: string, title: string, kind: 'image' | 'video' = 'image'): void {
  if (!url) return
  previewMedia.value = { url, title, kind }
  previewOpen.value = true
}

// ---------------------------------------------------------------- 详情面板

/**
 * 角色设定节点：上游那一口"选了但还没认可"的版本（右栏据此提示 + 一键认可）。
 *
 * 为什么要专门算一遍：候选是从**已认可的旧版**退回来的，界面必须说清"你现在看到的
 * 角色来自 v2、而图跑到 v3 了"，否则用户会以为选错了版本 —— 或者像 2026-09-19 那样，
 * 只看到空下拉，以为"拉不到上游"。
 */
/** 哪些节点"某一个参数要从上游清单里挑一条"，以及挑的是哪一口。 */
const SOURCE_SLOT: Record<string, string> = {
  character: 'characters',
  scene: 'scenes',
  // 首帧/视频接的是分镜表："这一镜"同样是"从上游清单里挑一条"，
  // 所以它也享受同一套提示（上游那版表格没认可时，右栏会说清并给一键认可）。
  keyframe: 'shot',
  i2v: 'shot'
}
/** 挑中的结果落在哪个参数上（首帧/视频没有这个参数，它们的"挑"落在 node.ref.shotIdx）。 */
const SOURCE_PARAM: Record<string, string> = { character: 'characterSource', scene: 'sceneSource' }

/** 这一口在**本节点**上的中文名（人物列表 / 场景列表 / 这一镜的分镜）。 */
function sourcePortLabel(node: CanvasNode, slot: string): string {
  return nodeTypeSpec(node.kind).inputs.find(p => p.slot === slot)?.label ?? slot
}

/**
 * 上游那一口的"下一步该怎么办"。
 *
 * **动作永远对着"上游当前选用的那一版"**（用户 2026-09-19 指出）：
 * v5 已经确认了、这一步还接在没认可的 v4 上，界面却给一个「认可 v4」的按钮 ——
 * 那是把用户往后退。版本的选择与认可归**上游节点**管，这里只有两条路：
 *   - 上游当前那版还没认可 → 认它（顺带一句"也可以在上游节点里认"）
 *   - 上游当前那版已经认可、这一步接的不是它 → 只给「改用 vN」
 */
const selectedUpstreamAdvice = computed(() => {
  const node = selected.value
  const slot = node ? SOURCE_SLOT[node.kind] : ''
  if (!node || !slot) return undefined
  const info = upstreamSlotOf(node, slot)[0]
  if (!info) return undefined
  const { upstream, picked, latest } = info
  const current = latest ?? picked
  if (!current) return undefined
  const base = {
    label: sourcePortLabel(node, slot),
    upstreamTitle: upstream.title || '上游节点',
    version: current.version,
    artifactId: current.id
  }
  const wiredDiffers = !!picked && picked.id !== current.id
  const wired = wiredDiffers && picked
    ? { version: picked.version, approved: picked.review === 'approved' }
    : undefined
  // ① 上游当前选用的那版还没认可：要认就认**它**
  if (current.review !== 'approved') {
    return { ...base, kind: 'pending-current' as const, wired, approve: true, follow: !!wired }
  }
  // ② 上游当前选用的那版已认可，而这一步接的不是它（旧版 / 旧版还没认可）：只给「改用」
  if (wiredDiffers) {
    return { ...base, kind: 'stale-wiring' as const, wired, approve: false, follow: true }
  }
  return undefined
})

/**
 * 把这一步改接到上游的新版本。
 *
 * 只改**本节点**的输入引用（不抢上游的"当前选用"）：依赖按"哪个产物的哪个版本"记，
 * 两个角色设定节点本来就可以各接各的版本。改完要重新选一次角色/场景 —— 提示里说清。
 */
async function followNewerUpstream(artifactId: string): Promise<void> {
  const node = selected.value
  const slot = node ? SOURCE_SLOT[node.kind] : ''
  const artifact = artifacts.value.find(a => a.id === artifactId)
  if (!node || !slot || !artifact) return
  const refs = node.inputs[slot] ?? []
  node.inputs = {
    ...node.inputs,
    [slot]: refs.map(r => ({ ...r, artifactId: artifact.id, version: artifact.version }))
  }
  // 「这一镜」这类参数也一起清掉：它记的是旧表里的行号，换表后没意义。
  if (SOURCE_PARAM[node.kind]) node.params = { ...node.params, [SOURCE_PARAM[node.kind]!]: '' }
  if (node.kind === 'keyframe' || node.kind === 'i2v') node.params = { ...node.params, shotIdx: '' }
  await saveToServer(true)
  showToast(`这一步改接 v${artifact.version}；它还没认可的话，先认可再重新选一次`)
}

/**
 * 这次会带哪些参考图、按什么顺序。
 *
 * 顺序不是随手定的：服务端 `snapshotInputs` 按**槽名排序**、槽内按连线顺序依次编号
 * （`position` 0,1,2…），而上游模型只按顺序收图、看不到我们的编号。所以界面必须
 * 照**同一顺序**写「参考图N」，用户写"参考图2 的光线"才对得上
 * （这个措辞在 `app/utils/image-ref.ts` 里实测过：2 张、3 张场景都成立）。
 */
const selectedReferences = computed(() => {
  const node = selected.value
  if (!node || (node.kind !== 'keyframe' && node.kind !== 'i2v')) return undefined
  const spec = nodeTypeSpec(node.kind)
  // 与服务端同一口径：图像类槽按槽名排序，槽内按连线顺序
  const slots = spec.inputs.filter(p => p.type === 'image').map(p => p.slot).sort()
  let n = 0
  const groups = slots.map((slot) => {
    const items = (node.inputs[slot] ?? []).map((ref) => {
      const artifact = artifacts.value.find(a => a.id === ref.artifactId)
      const upstream = graph.value.nodes.find(x => x.id === ref.from)
      n += 1
      return {
        index: n,
        label: String(upstream?.params?.name || upstream?.title || '参考'),
        thumb: artifact?.url || ''
      }
    })
    return { slotLabel: spec.inputs.find(p => p.slot === slot)?.label ?? slot, items }
  }).filter(g => g.items.length)
  return groups.length ? { groups, total: n } : undefined
})

/**
 * 选中的角色/场景那一条的设定。参数区把它露出来：真正进提示词的是**上游这一条**，
 * 只给一个名字、一个空着的"补充要求"，用户没法确认出图是按谁来的。
 */
const selectedSourcePreview = computed(() => {
  const node = selected.value
  const slot = node ? SOURCE_SLOT[node.kind] : ''
  const key = node ? SOURCE_PARAM[node.kind] : ''
  if (!node || !slot || !key) return undefined
  const chosen = String(node.params[key] ?? '')
  if (!chosen) return undefined
  // 首帧/视频：把**这一镜会用的关键词原文**列出来（运镜 + 画面 + 台词）。
  // 以前这些只在服务端取，界面看不到，用户不知道"不写提示词会用什么"（用户 2026-09-19）。
  if (node.kind === 'keyframe' || node.kind === 'i2v') {
    const idx = Number(node.params.shotIdx ?? node.ref?.shotIdx ?? 0)
    const rows = shotRowsOf(node)
    const row = rows.find(r => r.idx === idx) ?? rows[0]
    if (!row) return undefined
    const promptKey = nodeTypeSpec(node.kind).promptKey ?? 'prompt'
    const own = String(node.params[promptKey] ?? '').trim()
    const parts = [
      own ? `你写的：${own}` : '',
      row.camera ? `运镜：${row.camera}` : '',
      row.keyframePrompt ? `画面：${row.keyframePrompt}` : '',
      row.line ? `台词：${row.line}` : ''
    ].filter(Boolean)
    return {
      label: own ? '这一镜会用的关键词（你写的优先）' : '这一镜会用的关键词（来自分镜表）',
      title: `S${String(row.idx).padStart(2, '0')}${row.shotSize ? ` · ${row.shotSize}` : ''}`,
      description: parts.join('\n'),
      from: '分镜表'
    }
  }
  const artifact = artifacts.value.find(a => a.id === chosen.split(':')[0])
  const entries = node.kind === 'character' ? charactersOf(node) : scenesOf(node)
  const hit = entries.find(e => e.value === chosen)
  if (!hit || !artifact) return undefined
  // 出处写"人物列表 v3"这种：用户一眼知道候选是这一版的，而不是某个旧版。
  return { title: hit.name, description: hit.description, from: `${sourcePortLabel(node, slot)} v${artifact.version}` }
})

/** 右栏「认可 v3」：认的是上游那一版，用**它自己的节点 id** 走同一套审核。 */
function approveUpstream(artifactId: string): void {
  const art = artifacts.value.find(a => a.id === artifactId)
  if (!art) return
  void review(art.nodeId, artifactId, 'approved')
}

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
  graph.value.nodes.filter(dirtyOf).map(n => n.id).reduce((sum, id) => {
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
  rowDrafts,
  tableRowsOf,
  rowsDirty,
  updateRow,
  discardRows,
  clearDrafts
} = useCanvasRows({ graph, artifacts, toast: showToast })

function setParam(node: CanvasNode, key: string, value: unknown): void {
  node.params = { ...node.params, [key]: value }
  if (node.kind === 'character' && (key === 'characterSource' || key === 'characterNotes')) {
    const chosen = charactersOf(node).find(c => c.value === node.params.characterSource)
    node.params = { ...node.params, name: chosen?.name || '', appearance: characterPrompt(node) || '' }
  }
  // 场景与角色同一条路：选完把「场景名」和「环境锚点」一起写死成这一条的内容。
  if (node.kind === 'scene' && (key === 'sceneSource' || key === 'sceneNotes')) {
    const chosen = scenesOf(node).find(s => s.value === node.params.sceneSource)
    node.params = { ...node.params, name: chosen?.name || '', appearance: scenePrompt(node) || '' }
  }
  // 「这一镜」：镜号是**图 JSON 的一部分**（`node.ref.shotIdx`，服务端按它取那一行），
  // 所以选完要同时写到 ref 上；画面提示词还空着的话顺手用这一镜的关键帧提示词填上。
  if ((node.kind === 'keyframe' || node.kind === 'i2v') && key === 'shotIdx') {
    const idx = Number(value) || 0
    node.ref = { ...(node.ref ?? {}), shotIdx: idx }
    const row = shotRowsOf(node).find(r => r.idx === idx)
    const promptKey = nodeTypeSpec(node.kind).promptKey ?? 'prompt'
    if (row?.keyframePrompt && !String(node.params[promptKey] ?? '').trim()) {
      node.params = { ...node.params, [promptKey]: row.keyframePrompt }
    }
  }
  // 换了模型：画幅/清晰度候选跟着换，旧值可能已经不是这个模型支持的档 ——
  // 不收敛的话服务端会静默回落首选档（用户以为"我选的没生效"）。
  if (key === 'modelId') convergeVideoFormat(node)
}

/** 上游分镜表当前这一版的每一行（首帧/视频按镜号取其中的一行）。 */
function shotRowsOf(node: CanvasNode): CanvasShotRow[] {
  const found = upstreamSlotOf(node, 'shot').map(({ picked, approved }) => picked?.review === 'approved' ? picked : approved[0])
  for (const artifact of found) {
    if (artifact?.rows?.length) return artifact.rows
  }
  return []
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

const hasUnsavedWork = computed(() => graphDirty.value || Object.keys(textDrafts.value).length > 0 || Object.values(rowDrafts.value).some(d => d.dirty) || Object.values(followUpDrafts.value).some(Boolean))
onBeforeRouteLeave(() => !hasUnsavedWork.value || window.confirm('当前画布有未保存内容，确定离开？'))
function beforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedWork.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload)
  mq = window.matchMedia('(min-width: 720px)')
  syncWide()
  mq.addEventListener('change', syncWide)
  window.addEventListener('keydown', onKeydown)
  // 首屏适应一次，保证一进来就看得到整条产线
  window.setTimeout(() => fitView({ padding: 0.16, maxZoom: 0.86, minZoom: 0.4 }), 700)
  // 载入服务端最近编辑的那张图（没有就留空白图）。
  // 未登录时接口会失败，前端只提示一次、把画布留空 —— 不拿示例数据兜底。
  // URL 上带了 ?id= 就打开那一张（旧图、别人发来的图都要能打开）——
  // 以前只认"最近编辑的那张"，于是"我另一张图看不到、也没入口打开"（用户 2026-09-19）。
  void loadFromServer(typeof route.query.id === 'string' ? route.query.id : undefined)
  // 任务完成/失败由事件流推送 → 刷新整图（异步产物只有这样才会自己冒出来）。
  void watchEvents()
  // 模板先拉一次：等用户点「新建」时才拉会白等一个来回。
  void refreshSiteTemplates()
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
    // 分辨率候选：所有可用视频模型声明的档（去重后给「基准画幅」用）。
    videoModels.value = (catalog.videoModels ?? []).filter(m => m.available !== false)
    videoModelResolutions.value = videoModels.value.flatMap(m => m.resolutions ?? [])
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
  window.removeEventListener('beforeunload', beforeUnload)
  disposed = true
  graphEpoch++
  for (const controller of runControllers.values()) controller.abort()
  layoutDisposed = true
  cancelAnimationFrame(layoutFrame)
  mq?.removeEventListener('change', syncWide)
  window.removeEventListener('keydown', onKeydown)
  eventAbort?.abort()
  if (reloadTimer) window.clearTimeout(reloadTimer)
})

async function arrangeCanvas(): Promise<void> {
  if (arranging.value || !canArrange.value) return
  const measurements = new Map(flowGraphNodes.value.map(n => [n.id, n.dimensions]))
  let positions: Record<string, LayoutPoint>
  try {
    positions = layoutCanvas(graph.value.nodes.map(n => ({
      id: n.id, kind: n.kind, shot: n.ref?.shotIdx,
      width: measurements.get(n.id)?.width || nodeTypeSpec(n.kind).width,
      height: measurements.get(n.id)?.height || (n.collapsed ? 100 : 360)
    })), graph.value.edges)
  } catch (err) {
    showToast(`整理失败：${errText(err)}`)
    return
  }
  const before = Object.fromEntries(graph.value.nodes.map(n => [n.id, { ...n.at }]))
  const changed = graph.value.nodes.some(n => n.at.x !== positions[n.id]!.x || n.at.y !== positions[n.id]!.y)
  if (!changed) {
    fit()
    showToast('画布已经整理好了')
    return
  }
  arranging.value = true
  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  layoutPositions.value = animate ? before : null
  await historyTransaction(() => {
    graph.value = { ...graph.value, nodes: graph.value.nodes.map(n => ({ ...n, at: positions[n.id]! })) }
  })
  if (layoutDisposed) return
  const finish = async () => {
    layoutPositions.value = null
    await nextTick()
    if (layoutDisposed) return
    updateNodeInternals()
    try {
      await fitView({ padding: 0.16, maxZoom: 0.86, minZoom: 0.08, duration: animate ? 220 : 0 })
      showToast('已整理画布，可一步撤销；保存后保留布局')
    } finally {
      arranging.value = false
    }
  }
  if (!animate) { void finish(); return }
  const started = performance.now()
  const frame = (now: number) => {
    const t = Math.min(1, (now - started) / 280)
    const progress = 1 - (1 - t) ** 3
    layoutPositions.value = Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, {
      x: before[id]!.x + (p.x - before[id]!.x) * progress,
      y: before[id]!.y + (p.y - before[id]!.y) * progress
    }]))
    if (t < 1) layoutFrame = requestAnimationFrame(frame)
    else void finish()
  }
  layoutFrame = requestAnimationFrame(frame)
}

function fit(): void {
  fitView({ padding: 0.16, maxZoom: 0.86, minZoom: 0.08 })
}

/** 重新载入：把这张图从服务端再拉一次（别人改了 / 异步任务落了产物的场景）。 */
async function reloadFromServer(): Promise<void> {
  if (!await reloadGraph()) return
  showToast('已重新载入')
  window.setTimeout(fit, 120)
}

const zoomPercent = computed(() => `${Math.round((viewport.value?.zoom ?? 1) * 100)}%`)
</script>

<template>
  <div
    class="cg-page"
    :class="{ 'is-arranging': arranging }"
    :aria-busy="arranging"
  >
    <!-- 顶栏 -->
    <CanvasTopbar

      :arranging="arranging"
      :can-arrange="canArrange"
      :busy="busy || batchBusy || loading || !!loadError || arranging || mutationBusy || textSaving"
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
      @arrange="arrangeCanvas"
      @save="saveToServer()"
      @run-all="runAll"
    />

    <p
      v-if="syncConflict"
      class="cg-sync-error"
      role="alert"
    >
      服务端与本地都有修改，已保留本地编辑并暂停保存。<button
        type="button"
        @click="resolveConflict"
      >
        放弃本地修改并重新载入
      </button>
    </p>
    <div
      class="cg-body"
      :inert="arranging"
    >
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
            :min-zoom="0.08"
            :max-zoom="1.6"
            :default-viewport="{ x: 40, y: 40, zoom: 0.6 }"
            :nodes-connectable="true"
            :nodes-draggable="!arranging"
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
            @pane-click="onPaneClick"
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
                @rerun="rerunNode"
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
                @open="onNodeOpen"
                @slot="openSlot"
                @preview="(url: string, title: string, kind?: 'image' | 'video') => openPreview(url, title, kind)"
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

        <div
          v-if="loading || loadError"
          class="cg-blank"
          role="status"
          aria-live="polite"
        >
          <i :class="loading ? 'i-lucide-loader-circle cg-spin' : 'i-lucide-circle-alert'" />
          <p>{{ loading ? '正在加载画布…' : loadError }}</p>
          <button
            v-if="loadError"
            class="cg-primary"
            type="button"
            @click="loadFromServer()"
          >
            重新加载
          </button>
        </div>

        <!-- 空画布引导：没有任何节点时告诉人从哪儿开始 -->
        <div
          v-if="!loading && !loadError && !graph.nodes.length"
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
          :loading="templateLoading"
          :error="templateError"
          @retry="openStart('new')"
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
          role="status"
          aria-live="polite"
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
        :options-by-key="selected ? dynamicOptionsOf(selected) : {}"
        :table-rows="selected ? tableRowsOf(selected) : []"
        :table-dirty="selected ? rowsDirty(selected.id) : false"
        :active-slot="selected ? activeSlotOf(selected) : ''"
        :upstream-advice="selectedUpstreamAdvice"
        :source-preview="selectedSourcePreview"
        :references="selectedReferences"
        :streaming="selected ? streaming[selected.id] : ''"
        :follow-up="followUp"
        :busy="busy || textSaving || mutationBusy"
        :error="selected ? operationError[selected.id] : undefined"
        :drafts="textDrafts"
        @draft="setTextDraft"
        @rerun="rerunNode"
        @close="detailOpen = false"
        @run="runNode"
        @expand="expand"
        @param="(id: string, key: string, value: unknown) => setParam(graph.nodes.find(n => n.id === id)!, key, value)"
        @row-update="updateRow"
        @rows-save="saveRows"
        @rows-discard="discardRows"
        @slot="setActiveSlot"
        @text-save="saveText"
        @pick="pick"
        @pick-item="pickItem"
        @review="review"
        @approve-upstream="approveUpstream"
        @follow-upstream="followNewerUpstream"
        @preview="(url: string, title: string, kind?: 'image' | 'video') => openPreview(url, title, kind)"
        @open-artifact="openArtifact"
        @delete-artifact="removeArtifact"
        @update:follow-up="followUp = $event"
        @continue="continueFrom"
        @move-fragment="moveFragment"
      />

      <HgMediaPreview
        v-model:open="previewOpen"
        :src="previewMedia.url"
        :title="previewMedia.title"
        :kind="previewMedia.kind"
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
