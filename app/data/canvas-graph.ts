/**
 * 画布（织幕）图模型：节点、边、运行、产物，以及图上的几个纯函数。
 *
 * 对应后端契约见 aicodcms/docs/canvas/ZHIMU-DATA-MODEL-R2.md：
 *   · 节点与边整块存成一张图的 JSON（本文件上半部分的类型）
 *   · 运行（canvas_run）与产物（canvas_artifact）单独建表（本文件下半部分的类型）
 *
 * 三条原则，改代码前先记住：
 *   1. **产物是实体**：候选不是从任务反查出来的投影，每个版本都有 id、槽位、审核态
 *   2. **依赖是数据**：谁是谁的输入写在边和 inputs 里，不写在代码约定里
 *   3. **审核的对象是产物**（这一份图/这条视频行不行），不是节点
 */

import type { CanvasNodeKind, CanvasPortType } from './canvas-nodes'
import { canConnect, nodeTypeSpec } from './canvas-nodes'

// ---------------------------------------------------------------- 图（存 JSON）

export interface CanvasArtifactRef {
  artifactId: string
  version: number
  /** 图像类：这一组候选里选中的是第几张（0 起）。视频/表格类没有。 */
  item?: number
}

export interface CanvasInputRef extends CanvasArtifactRef {
  /** 上游节点 id（与边重复一份：读的时候不用把边索引一遍）。 */
  from: string
  /** 上游槽位名。 */
  slot: string
}

export interface CanvasNode {
  id: string
  kind: CanvasNodeKind
  /** 显示名，用户可改（默认取节点类型的 label）。 */
  title: string
  at: { x: number, y: number }
  params: Record<string, unknown>
  /**
   * 输入槽 → 上游产物引用**列表**。
   *
   * 为什么要数组：剪辑合成、成片导出要接 N 条视频，一个槽多条入边。
   * 早先写成单值，结果"3 条视频进合成"只记住了最后连的那一条。
   */
  inputs: Record<string, CanvasInputRef[]>
  /** 输出槽 → 当前选定的产物版本；空表示还没产出。 */
  outputs: Record<string, CanvasArtifactRef>
  /** 由分镜表展开出来的节点记一下自己对应第几镜（导出命名、并排比较用）。 */
  ref?: { shotIdx?: number }
  /** 折叠：只留标题栏与操作栏，图挤的时候把不看的节点收起来。 */
  collapsed?: boolean
}

export interface CanvasEdge {
  id: string
  from: { node: string, slot: string }
  to: { node: string, slot: string }
}

export interface CanvasGraph {
  version: 1
  /** H3 帧数网格：真源在服务端，随图一起带下来，前端不再硬编码第二份。 */
  frameGrid: number[]
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

// ---------------------------------------------------------------- 运行与产物（建表）

/** 运行态：由 canvas_run 派生，不存在节点行上。 */
export type CanvasNodeState = 'idle' | 'running' | 'ready' | 'failed' | 'blocked' | 'awaiting'

/** 审核态：挂在**产物**上，不在节点上。 */
export type CanvasReview = 'pending' | 'approved' | 'rejected'

export interface CanvasRun {
  id: string
  nodeId: string
  /** 参数 + 输入版本的指纹：一样就不重跑、不重复计费。 */
  paramsHash: string
  /**
   * 「继续补充」时带上：这一次是从哪一版产物接着改的。
   * 模型据此在原稿上改，而不是从零重写（也是版本树的父指针）。
   */
  baseArtifactId?: string
  status: 'running' | 'done' | 'failed'
  error?: string
  costCredits?: number
  startedAt: string
  finishedAt?: string
}

export interface CanvasArtifact {
  id: string
  nodeId: string
  /** 输出槽名，与 CanvasNode.outputs 的键一致。 */
  slot: string
  type: CanvasPortType
  /** 同 (node, slot) 内自增，从 1 开始。 */
  version: number
  /** 产物地址（图片/视频/音频用预签名 URL；表格与压缩包没有 URL）。 */
  url?: string
  /** 展示用备注：分辨率、时长、张数、镜数… */
  note?: string
  /** 图像类：这一次跑出来的一组候选（三视图 3 张、首帧 3 张）。 */
  items?: CanvasArtifactItem[]
  /** 组内选中的下标（0 起），与 items[].picked 保持一致，便于卡片直接读。 */
  pickedIndex?: number
  /** 表格类产物的内容（分镜表一行一镜）。 */
  rows?: CanvasShotRow[]
  /** 文字类产物的内容（剧本、大纲）。 */
  text?: string
  /** 导出类产物的结果清单（已导出 / 未导出 / 参数不一致）。 */
  manifest?: CanvasExportManifest
  review: CanvasReview
  createdAt: string
  /**
   * 文件在对象存储的骨架（服务端给的素材 id）。
   *
   * 前端只用来"把这一份交回服务端"（例如挑片后告诉后端用哪张），展示一律用 `url`
   * —— URL 是**限时签名**，每次读图都由服务端重签。
   */
  mediaAssetId?: string
  /** 这条产物是哪次跑出来的（服务端字段，排查用）。 */
  runId?: string
  /**
   * 这条文本产物属于哪个 LLM 会话（服务端字段，字符串形态）。
   *
   * 服务端靠它做"接着上文"：下游文本节点读这条会话的历史。前端**不需要**解释它，
   * 只需在保存/回传时原样带着 —— 它是服务端字段，丢了不会立刻报错，
   * 但下一次运行就会变成"模型怎么不记得上文了"。
   */
  conversationId?: string
}

/**
 * 一组候选里的一张（图像类）。
 *
 * 为什么一组要能逐张记：三视图、首帧都是"一次出几张、人挑一张"。
 * 挑中的那张才往下走（下游的输入引用带 item 下标），其余的留着对比，不删。
 */
export interface CanvasArtifactItem {
  url: string
  /** 组内标注：正面 / 侧面 / 背面；候选 1 / 2 / 3 */
  label?: string
  /** 这一张对应的素材 id（服务端用来取参考图；前端不必读，但原样带着不丢）。 */
  mediaAssetId?: string
  picked?: boolean
  review?: CanvasReview
}

/**
 * 成片导出 / 素材导出 的结果清单。
 *
 * 三组，与 R1 第 5 节、T8 的验收口径一致：已经进包的、没进包的（写原因）、
 * 进了包但参数对不上的（单列出来，不挡打包）。
 */
export interface CanvasExportManifest {
  exported: { label: string, note?: string }[]
  skipped: { label: string, reason: string }[]
  mismatch: { label: string, detail: string }[]
  /** 以下三个是服务端多带的（前端不读也不影响）：导出任务 id / 状态 / 条目数。 */
  exportId?: string
  status?: string
  total?: number
}

/** 分镜表的一行（一镜）。 */
export interface CanvasShotRow {
  idx: number
  shotSize: string
  camera: string
  frames: number
  scene: string
  keyframePrompt: string
  line?: string
}

export interface CanvasSample {
  graph: CanvasGraph
  artifacts: CanvasArtifact[]
  runs: CanvasRun[]
}

// ---------------------------------------------------------------- 图上纯函数

let seq = 0

/** 节点 id：`n_<kind>_<序号>`。服务端不用这套，这是前端新建时用的临时 id。 */
export function newId(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`
}

/** 节点默认参数：按类型声明取默认值（select 取第一项，frames 取中间档）。 */
export function defaultParams(kind: CanvasNodeKind): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const p of nodeTypeSpec(kind).params) {
    if (p.kind === 'select') params[p.key] = p.options?.[0]?.value ?? ''
    else if (p.kind === 'number') params[p.key] = 5
    else if (p.kind === 'frames') params[p.key] = 158
    else params[p.key] = ''
  }
  return params
}

export function createNode(kind: CanvasNodeKind, at: { x: number, y: number }, title?: string, shotIdx?: number): CanvasNode {
  const spec = nodeTypeSpec(kind)
  const node: CanvasNode = {
    id: newId(`n_${kind}`),
    kind,
    title: title ?? spec.label,
    at,
    params: defaultParams(kind),
    inputs: {},
    outputs: {}
  }
  if (shotIdx) node.ref = { shotIdx }
  return node
}

export function addNode(graph: CanvasGraph, node: CanvasNode): void {
  graph.nodes.push(node)
}

/** 删节点：连同它的入边、出边一起删，下游的 inputs 也清掉（不留悬空引用）。 */
export function removeNode(graph: CanvasGraph, nodeId: string): void {
  graph.nodes = graph.nodes.filter(n => n.id !== nodeId)
  graph.edges = graph.edges.filter(e => e.from.node !== nodeId && e.to.node !== nodeId)
  for (const n of graph.nodes) {
    for (const [slot, refs] of Object.entries(n.inputs)) {
      const rest = refs.filter(ref => ref.from !== nodeId)
      if (rest.length) n.inputs[slot] = rest
      else delete n.inputs[slot]
    }
  }
}

/**
 * 连线。三道校验：端口存在、类型相同、不重复连。
 * 返回错误原因而不是抛异常——画布上连线失败要给人看提示。
 */
export function connectNodes(
  graph: CanvasGraph,
  from: { node: string, slot: string },
  to: { node: string, slot: string }
): { ok: true } | { ok: false, reason: string } {
  const fromNode = graph.nodes.find(n => n.id === from.node)
  const toNode = graph.nodes.find(n => n.id === to.node)
  if (!fromNode || !toNode) return { ok: false, reason: '节点不存在' }
  if (fromNode.id === toNode.id) return { ok: false, reason: '不能连到自己' }

  const outPort = nodeTypeSpec(fromNode.kind).outputs.find(p => p.slot === from.slot)
  const inPort = nodeTypeSpec(toNode.kind).inputs.find(p => p.slot === to.slot)
  if (!outPort || !inPort) return { ok: false, reason: '端口不存在' }
  if (!canConnect(outPort.type, inPort.type)) {
    return { ok: false, reason: `类型不匹配：${outPort.label}(${outPort.type}) → ${inPort.label}(${inPort.type})` }
  }
  if (!inPort.multiple && Object.prototype.hasOwnProperty.call(toNode.inputs, to.slot)) {
    return { ok: false, reason: `「${inPort.label}」只能接一条线，先断开原来的` }
  }
  // 成环检查：连上以后 to 能不能走回 from
  if (reaches(graph, to.node, from.node)) return { ok: false, reason: '连上就成环了' }

  graph.edges.push({ id: newId('e'), from: { ...from }, to: { ...to } })
  const upstream = fromNode.outputs[from.slot]
  if (upstream) {
    const list = toNode.inputs[to.slot] ?? []
    list.push({ from: fromNode.id, slot: from.slot, ...upstream })
    toNode.inputs[to.slot] = list
  }
  return { ok: true }
}

export function disconnect(graph: CanvasGraph, edgeId: string): void {
  const edge = graph.edges.find(e => e.id === edgeId)
  if (!edge) return
  graph.edges = graph.edges.filter(e => e.id !== edgeId)
  const toNode = graph.nodes.find(n => n.id === edge.to.node)
  if (!toNode) return
  const rest = (toNode.inputs[edge.to.slot] ?? [])
    .filter(ref => !(ref.from === edge.from.node && ref.slot === edge.from.slot))
  // 清空要**显式给空数组**，不能删键：服务端保存是字段级合并（没提到的槽位保留库里的），
  // 删键等于"这次没提到"，那条引用会被服务端补回来 —— 断线就断不掉了。
  toNode.inputs[edge.to.slot] = rest
}

/** from 顺着边走能不能到 target。 */
function reaches(graph: CanvasGraph, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  return graph.edges.filter(e => e.from.node === from).some(e => reaches(graph, e.to.node, target, seen))
}

/** 拓扑序（输入先于输出）。有环时剩下的按 id 追加，绝不返回半个图或死循环。 */
export function topoOrder(graph: CanvasGraph): string[] {
  const indeg = new Map<string, number>()
  for (const n of graph.nodes) indeg.set(n.id, 0)
  for (const e of graph.edges) indeg.set(e.to.node, (indeg.get(e.to.node) ?? 0) + 1)

  const ready = graph.nodes.filter(n => (indeg.get(n.id) ?? 0) === 0).map(n => n.id)
  const out: string[] = []
  while (ready.length) {
    const id = ready.shift()!
    out.push(id)
    for (const e of graph.edges.filter(e => e.from.node === id)) {
      const left = (indeg.get(e.to.node) ?? 0) - 1
      indeg.set(e.to.node, left)
      if (left === 0) ready.push(e.to.node)
    }
  }
  for (const n of graph.nodes) if (!out.includes(n.id)) out.push(n.id)
  return out
}

export function parentsOf(graph: CanvasGraph, nodeId: string): string[] {
  return [...new Set(graph.edges.filter(e => e.to.node === nodeId).map(e => e.from.node))]
}

/** 下游（不含自己）。 */
export function downstreamOf(graph: CanvasGraph, nodeId: string): string[] {
  const out = new Set<string>()
  const walk = (id: string) => {
    for (const e of graph.edges.filter(e => e.from.node === id)) {
      if (!out.has(e.to.node)) {
        out.add(e.to.node)
        walk(e.to.node)
      }
    }
  }
  walk(nodeId)
  return [...out]
}

/**
 * 参数指纹：类型 + 参数 + 每个输入槽的产物版本。
 * 服务端用 sha256 算同一件事（以服务端为准），这里只用来判断"我是不是改过东西"。
 */
export function paramsHash(node: CanvasNode): string {
  const payload = JSON.stringify({
    kind: node.kind,
    params: node.params,
    inputs: Object.entries(node.inputs)
      .map(([slot, refs]) => [slot, ...refs.map(r => `${r.artifactId}@${r.version}#${r.item ?? 0}`)])
      .sort()
  })
  let h = 5381
  for (let i = 0; i < payload.length; i++) h = ((h << 5) + h + payload.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function lastRun(runs: CanvasRun[], nodeId: string): CanvasRun | undefined {
  return [...runs].reverse().find(r => r.nodeId === nodeId)
}

/**
 * 节点运行态：running > failed > 有产物 = ready > 必填输入没接 = blocked
 *            > 上游产物还没人确认 = awaiting > idle。
 *
 * **awaiting 就是"先确认再下一步"这条规矩**：上游产物 review 还是 pending 时，
 * 下游一律跑不了 —— 每一步都花钱、每步用的是不同模型，没确认就往下跑等于把钱花在错的东西上。
 */
export function nodeState(
  graph: CanvasGraph,
  node: CanvasNode,
  runs: CanvasRun[],
  artifacts: CanvasArtifact[] = []
): CanvasNodeState {
  const last = lastRun(runs, node.id)
  if (last?.status === 'running') return 'running'
  for (const port of nodeTypeSpec(node.kind).inputs) {
    if (!port.required) continue
    const refs = node.inputs[port.slot] ?? []
    if (!refs.length) return 'blocked'
    for (const ref of refs) {
      const artifact = artifacts.find(a => a.id === ref.artifactId)
      if (!artifact) return 'blocked'
      if (artifact.review !== 'approved') return 'awaiting'
      const parentRun = lastRun(runs, ref.from)
      if (parentRun?.status === 'running') return 'blocked'
    }
  }
  if (last?.status === 'failed') return 'failed'
  if (Object.values(node.outputs).some(ref => artifacts.some(a => a.id === ref.artifactId))) return 'ready'
  return 'idle'
}

export const NODE_STATE_META: Record<CanvasNodeState, { label: string, tone: 'muted' | 'run' | 'ok' | 'bad' | 'warn' }> = {
  idle: { label: '待运行', tone: 'muted' },
  running: { label: '运行中', tone: 'run' },
  ready: { label: '已就绪', tone: 'ok' },
  failed: { label: '失败', tone: 'bad' },
  blocked: { label: '等待上游', tone: 'warn' },
  awaiting: { label: '等待确认', tone: 'warn' }
}

/**
 * 方案 A（已拍板）：分镜表的 N 行批量展开成 N 组「关键帧生成 + 图生视频」节点并自动连线。
 *
 * 返回新建的节点与边，由调用方合并进图 —— 纯函数，不改入参。
 */
export function expandShotlist(
  graph: CanvasGraph,
  shotlistId: string,
  rowCount: number,
  opts: { keyframeKind?: CanvasNodeKind, videoKind?: CanvasNodeKind } = {}
): { nodes: CanvasNode[], edges: CanvasEdge[], keyframes: CanvasNode[], videos: CanvasNode[], reused: CanvasNode[] } {
  const kfKind = opts.keyframeKind ?? 'keyframe'
  const vKind = opts.videoKind ?? 'i2v'
  const shotlist = graph.nodes.find(n => n.id === shotlistId)
  const baseX = (shotlist?.at.x ?? 0) + 460
  const baseY = shotlist?.at.y ?? 0
  const ROW = 190

  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  const keyframes: CanvasNode[] = []
  const videos: CanvasNode[] = []
  const reused: CanvasNode[] = []

  // **按镜复用，只补缺的**：这一步必须幂等。
  //
  // 以前是"按 kind 数已有几个，从下一个编号接着排" —— 第二次点「生成节点」就把
  // 同一批镜头**再叠一套**（用户 2026-09-19：我让他点生成，结果旧的那套没删、新的叠上来）。
  // 判据是这一镜的镜号（`ref.shotIdx`）配合同一个分镜表：第 N 镜只该有一个首帧、一个视频。
  // 重复点正确的表现是"补齐缺的那几个 + 把缺的连线补上"，而不是又造一套。
  const byShot = (kind: CanvasNodeKind, idx: number) =>
    graph.nodes.find(n => n.kind === kind && n.ref?.shotIdx === idx)
    ?? nodes.find(n => n.kind === kind && n.ref?.shotIdx === idx)

  // 同一对节点之间已经有边就别再加（连带重跑时也不会长出平行线）
  const hasEdge = (fromNode: string, fromSlot: string, toNode: string, toSlot: string) =>
    graph.edges.some(e => e.from.node === fromNode && e.from.slot === fromSlot && e.to.node === toNode && e.to.slot === toSlot)
  const pushEdge = (fromNode: string, fromSlot: string, toNode: string, toSlot: string) => {
    if (hasEdge(fromNode, fromSlot, toNode, toSlot)) return
    edges.push(makeEdge(fromNode, fromSlot, toNode, toSlot))
  }

  for (let i = 0; i < rowCount; i++) {
    const idx = i + 1
    const at = { x: baseX, y: baseY + i * ROW }

    let kf = byShot(kfKind, idx)
    if (kf) {
      reused.push(kf)
    } else {
      kf = createNode(kfKind, at, `S${String(idx).padStart(2, '0')} 首帧`, idx)
      nodes.push(kf)
      keyframes.push(kf)
    }

    let vd = byShot(vKind, idx)
    if (vd) {
      reused.push(vd)
    } else {
      vd = createNode(vKind, { x: baseX + 300, y: at.y }, `S${String(idx).padStart(2, '0')} 视频`, idx)
      nodes.push(vd)
      videos.push(vd)
    }

    // 分镜表 → 首帧（这一镜的分镜）；分镜表 → 视频（这一镜的关键词）
    pushEdge(shotlistId, 'table', kf.id, 'shot')
    pushEdge(shotlistId, 'table', vd.id, 'shot')
    // 首帧 → 视频（首帧图是视频的输入）
    pushEdge(kf.id, 'image', vd.id, 'firstFrame')
    // 人物与场景由调用方接（一镜可能用不同的人/场景，不该替用户猜）
  }
  return { nodes, edges, keyframes, videos, reused }
}

/** 造一条边：from（上游）→ to（下游）。 */
export function makeEdge(fromNode: string, fromSlot: string, toNode: string, toSlot: string): CanvasEdge {
  return { id: newId('e'), from: { node: fromNode, slot: fromSlot }, to: { node: toNode, slot: toSlot } }
}

/**
 * 产出/切换某个产物版本时，把下游节点的输入槽一起改掉。
 *
 * 这就是"依赖是数据"落地的地方：上游换了版本，下游的输入引用跟着换，
 * 于是 paramsHash 变化 → 下游变脏 → 「运行全部」会重跑它，而没换的不动。
 */
export function selectArtifact(graph: CanvasGraph, artifact: CanvasArtifact): void {
  const node = graph.nodes.find(n => n.id === artifact.nodeId)
  if (!node) return
  const ref = { artifactId: artifact.id, version: artifact.version, item: artifact.pickedIndex }
  node.outputs[artifact.slot] = { ...ref }
  for (const edge of graph.edges.filter(e => e.from.node === artifact.nodeId && e.from.slot === artifact.slot)) {
    const down = graph.nodes.find(n => n.id === edge.to.node)
    if (!down) continue
    const list = down.inputs[edge.to.slot] ?? []
    const i = list.findIndex(r => r.from === node.id && r.slot === artifact.slot)
    const next = { from: node.id, slot: artifact.slot, ...ref }
    if (i >= 0) list[i] = next
    else list.push(next)
    down.inputs[edge.to.slot] = list
  }
}

/**
 * 一次运行落了**多口**产物时，逐口都成为"当前选用"。
 *
 * 为什么必须逐口都选：下游的输入引用是**按口**记的 —— 人物列表 → 角色设定、
 * 场景列表 → 场景设定、分镜大纲 → 分镜生成，三口的引用各写各的。
 * 只选第一口的表现是"拆解明明出了场景，场景设定却永远等着上游"，而且怎么点都没反应。
 */
export function selectFreshArtifacts(graph: CanvasGraph, list: CanvasArtifact[]): void {
  // 同一口在这次事件里可能来了多条（重跑/补跑）：取版本号最大的那条当当前选用。
  const newest = new Map<string, CanvasArtifact>()
  for (const a of list) {
    const seen = newest.get(a.slot)
    if (!seen || a.version > seen.version) newest.set(a.slot, a)
  }
  for (const a of newest.values()) selectArtifact(graph, a)
}

/**
 * 组内选用第 index 张：更新 picked 标记与产物镜像的 url，并把下游输入引用一起改掉。
 *
 * 返回新的产物数组（页面用不可变方式保存），下游节点的 inputs 由 selectArtifact 同步。
 */
export function withItemPicked(
  graph: CanvasGraph, artifacts: CanvasArtifact[], artifactId: string, index: number
): CanvasArtifact[] {
  const next = artifacts.map((a) => {
    if (a.id !== artifactId || !a.items?.length) return a
    const items = a.items.map((it, i) => ({ ...it, picked: i === index }))
    return { ...a, items, pickedIndex: index, url: items[index]?.url ?? a.url }
  })
  const hit = next.find(a => a.id === artifactId)
  if (hit) selectArtifact(graph, hit)
  return next
}

/** 逐张驳回/恢复：三视图里"侧面那张不行"要能单独标出来。 */
export function withItemReview(
  artifacts: CanvasArtifact[], artifactId: string, index: number, review: CanvasReview
): CanvasArtifact[] {
  return artifacts.map((a) => {
    if (a.id !== artifactId || !a.items?.length) return a
    const items = a.items.map((it, i) => (i === index ? { ...it, review } : it))
    return { ...a, items }
  })
}

/**
 * 这条连线能不能接 —— 拖线时的即时校验，也是 Vue Flow 校验**已存在边**时用的函数。
 *
 * 有一处反直觉但必须遵守的规矩：**已经存在的那条边本身必须判为合法**。
 * Vue Flow 在每次重算边的时候都会拿这个函数过一遍已有的边，判非法就直接丢掉，
 * 表现为"连线凭空消失"。所以"单一输入槽不重复接"这条要排除掉"就是它自己"的情况。
 */
export function connectionAllowed(
  graph: CanvasGraph,
  from: { node: string, slot: string },
  to: { node: string, slot: string },
  inPort: { multiple?: boolean }
): boolean {
  const fromNode = graph.nodes.find(n => n.id === from.node)
  const toNode = graph.nodes.find(n => n.id === to.node)
  if (!fromNode || !toNode || fromNode.id === toNode.id) return false

  const outPort = nodeTypeSpec(fromNode.kind).outputs.find(p => p.slot === from.slot)
  const targetPort = nodeTypeSpec(toNode.kind).inputs.find(p => p.slot === to.slot)
  if (!outPort || !targetPort) return false
  if (!canConnect(outPort.type, targetPort.type)) return false

  if (!inPort.multiple) {
    // 同一槽位已经有别的上游接着：不允许。但"这一条边自己"不算冲突。
    const conflict = graph.edges.some(e =>
      e.to.node === to.node && e.to.slot === to.slot
      && !(e.from.node === from.node && e.from.slot === from.slot)
    )
    if (conflict) return false
  }
  return true
}

/**
 * 指向这个节点的入边（可限定槽位）。
 *
 * **清单与排序都按边算，不按已记录的引用算** —— 上游还没跑过、没产出的时候，
 * 引用是不存在的，但"它本该进包"这件事只有边知道。否则包里少了谁永远说不清。
 */
export function incomingEdges(graph: CanvasGraph, nodeId: string, slots?: string[]): CanvasEdge[] {
  return graph.edges.filter(e => e.to.node === nodeId && (!slots || slots.includes(e.to.slot)))
}

/** 上游节点当前选定的产物（没跑过就是 undefined）。 */
export function upstreamArtifact(graph: CanvasGraph, edge: CanvasEdge): CanvasArtifact | undefined {
  const upstream = graph.nodes.find(n => n.id === edge.from.node)
  const ref = upstream?.outputs[edge.from.slot]
  return ref ? { id: ref.artifactId, version: ref.version } as CanvasArtifact : undefined
}

/** 某个输入槽接进来的引用（永远返回数组，别处不用再判空）。 */
export function inputRefs(node: CanvasNode, slot: string): CanvasInputRef[] {
  return node.inputs[slot] ?? []
}

/**
 * 一条引用对应的产物（找不到就是上游还没产出）。
 *
 * 只要求带 artifactId —— 因为输入引用（CanvasInputRef）和节点的输出指针
 * （CanvasArtifactRef）都拿它来查，两者结构不同但查法一样。
 */
export function artifactOfRef(artifacts: CanvasArtifact[], ref: { artifactId: string }): CanvasArtifact | undefined {
  return artifacts.find(a => a.id === ref.artifactId)
}

/**
 * 剪辑合成要拼的片段顺序。
 *
 * 默认按镜号（shotIdx）从小到大 —— "视频在排序才是成片"里的那个排序；
 * 人在界面上手动调过就按 params.orderIds 走（存的是产物 id 的顺序）。
 */
export interface CanvasFragment {
  /** 这条入边指向的上游节点 id（手动排序按它记）。 */
  upstreamId: string
  upstream?: CanvasNode
  /** 上游当前选定的产物 id（没跑过为空）。 */
  artifactId?: string
  shotIdx: number
  label: string
}

export function fragmentOrder(graph: CanvasGraph, node: CanvasNode, slot = 'video'): CanvasFragment[] {
  const items: CanvasFragment[] = incomingEdges(graph, node.id, [slot]).map((edge) => {
    const upstream = graph.nodes.find(n => n.id === edge.from.node)
    const shotIdx = upstream?.ref?.shotIdx ?? 0
    return {
      upstreamId: edge.from.node,
      upstream,
      artifactId: upstream?.outputs[edge.from.slot]?.artifactId,
      shotIdx,
      label: shotIdx ? `S${String(shotIdx).padStart(2, '0')}` : (upstream?.title ?? '片段')
    }
  })
  const manual = Array.isArray(node.params.orderIds) ? (node.params.orderIds as string[]) : []
  if (manual.length) {
    return [...items].sort((a, b) => {
      const ia = manual.indexOf(a.upstreamId)
      const ib = manual.indexOf(b.upstreamId)
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
    })
  }
  return [...items].sort((a, b) => a.shotIdx - b.shotIdx)
}

/**
 * 挑片并算出导出清单。
 *
 * 挑片规则（R1 第 5 节）：产物**已确认**才进包；没确认、没跑过的都不进，并写清原因。
 * 参数一致性：同一集里各片段的画幅应当一致，不一致的照常打包但单独列出来。
 */
export function buildExportManifest(
  graph: CanvasGraph, artifacts: CanvasArtifact[], node: CanvasNode
): { manifest: CanvasExportManifest, note: string } {
  const edges = incomingEdges(graph, node.id, ['cut', 'video'])
  const manifest: CanvasExportManifest = { exported: [], skipped: [], mismatch: [] }
  const baseline = String(node.params.baseline ?? '').trim()

  for (const edge of edges) {
    const upstream = graph.nodes.find(n => n.id === edge.from.node)
    const shotIdx = upstream?.ref?.shotIdx ?? 0
    const label = shotIdx ? `S${String(shotIdx).padStart(2, '0')}` : (upstream?.title ?? '未命名片段')
    const ref = upstream?.outputs[edge.from.slot]
    const artifact = ref ? artifacts.find(a => a.id === ref.artifactId) : undefined
    if (!artifact) {
      manifest.skipped.push({ label, reason: '上游还没跑过' })
      continue
    }
    if (artifact.review !== 'approved') {
      manifest.skipped.push({ label, reason: artifact.review === 'rejected' ? '已被驳回' : '还没确认' })
      continue
    }
    manifest.exported.push({ label, note: artifact.note })
    const size = (artifact.note ?? '').split('·')[0]?.trim() ?? ''
    if (baseline && size && size !== baseline) {
      manifest.mismatch.push({ label, detail: `${size} ≠ 基准 ${baseline}` })
    }
  }

  const note = `${manifest.exported.length} 条进包`
    + (manifest.skipped.length ? ` · ${manifest.skipped.length} 条未导` : '')
    + (manifest.mismatch.length ? ` · ${manifest.mismatch.length} 条参数不一致` : '')
  return { manifest, note }
}

/** 某个输出槽的下一个版本号（同 node + slot 内自增）。 */
export function nextVersion(artifacts: CanvasArtifact[], nodeId: string, slot: string): number {
  const versions = artifacts.filter(a => a.nodeId === nodeId && a.slot === slot).map(a => a.version)
  return versions.length ? Math.max(...versions) + 1 : 1
}

export function artifactsOf(artifacts: CanvasArtifact[], nodeId: string, slot?: string): CanvasArtifact[] {
  return artifacts
    .filter(a => a.nodeId === nodeId && (!slot || a.slot === slot))
    .sort((a, b) => b.version - a.version)
}

/** 卡点：有多少产物还在等人看（画布顶部"待处理"用这个数）。 */
export function pendingReviewCount(artifacts: CanvasArtifact[]): number {
  return artifacts.filter(a => a.review === 'pending').length
}

/** 导出文件名：E{集号}-S{镜号}.mp4，镜号补零位数按本集最大镜号，不少于两位。 */
export function exportFileName(episodeIdx: number, shotIdx: number, maxShotIdx: number): string {
  const pad = Math.max(2, String(Math.max(1, maxShotIdx)).length)
  return `E${String(episodeIdx).padStart(2, '0')}-S${String(shotIdx).padStart(pad, '0')}.mp4`
}

/**
 * 把一批节点按**依赖分层**：同一层里的节点互不依赖，可以一起跑；层与层之间串行。
 *
 * 为什么要这一层：拆解出 3 个角色、分镜表展开出 5 个首帧时，串行就是"一次一次地等"；
 * 而它们彼此没有依赖，云端本来也收并发请求。层间仍然串行 —— 下游要等上游的产物真的落库。
 */
export function dependencyLevels(graph: CanvasGraph, ids: string[]): string[][] {
  const set = new Set(ids)
  const depth = new Map<string, number>()
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    if (seen.has(id)) return 0 // 成环（本不该有）：别递归到栈溢出
    seen.add(id)
    const parents = parentsOf(graph, id).filter(p => set.has(p))
    const d = parents.length ? Math.max(...parents.map(p => depthOf(p, seen))) + 1 : 0
    depth.set(id, d)
    return d
  }
  const levels: string[][] = []
  for (const id of ids) {
    const d = depthOf(id)
    if (!levels[d]) levels[d] = []
    levels[d]!.push(id)
  }
  return levels.filter(Boolean)
}
