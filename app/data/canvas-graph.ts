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
  inputs: Record<string, CanvasInputRef>
  /** 输出槽 → 当前选定的产物版本；空表示还没产出。 */
  outputs: Record<string, CanvasArtifactRef>
  /** 由分镜表展开出来的节点记一下自己对应第几镜（导出命名、并排比较用）。 */
  ref?: { shotIdx?: number }
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
  /** 表格类产物的内容（分镜表一行一镜）。 */
  rows?: CanvasShotRow[]
  /** 文字类产物的内容（剧本、大纲）。 */
  text?: string
  review: CanvasReview
  createdAt: string
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
    for (const [slot, ref] of Object.entries(n.inputs)) {
      if (ref.from === nodeId) delete n.inputs[slot]
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
    toNode.inputs[to.slot] = { from: fromNode.id, slot: from.slot, ...upstream }
  }
  return { ok: true }
}

export function disconnect(graph: CanvasGraph, edgeId: string): void {
  const edge = graph.edges.find(e => e.id === edgeId)
  if (!edge) return
  graph.edges = graph.edges.filter(e => e.id !== edgeId)
  const toNode = graph.nodes.find(n => n.id === edge.to.node)
  if (toNode) delete toNode.inputs[edge.to.slot]
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
      .map(([slot, ref]) => [slot, ref.artifactId, ref.version])
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
  if (last?.status === 'failed') return 'failed'
  if (Object.keys(node.outputs).length > 0) return 'ready'

  for (const port of nodeTypeSpec(node.kind).inputs) {
    if (!port.required) continue
    const ref = node.inputs[port.slot]
    if (!ref) return 'blocked'
    if (artifacts.length) {
      const artifact = artifacts.find(a => a.id === ref.artifactId)
      if (artifact && artifact.review !== 'approved') return 'awaiting'
    }
  }

  for (const parentId of parentsOf(graph, node.id)) {
    const parent = graph.nodes.find(n => n.id === parentId)
    if (!parent) continue
    if (nodeState(graph, parent, runs, artifacts) !== 'ready') return 'blocked'
  }
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

/** 脏节点：从没成功跑过 / 参数变了 / 输入换了版本。 */
export function isDirty(node: CanvasNode, runs: CanvasRun[]): boolean {
  const done = [...runs].reverse().find(r => r.nodeId === node.id && r.status === 'done')
  if (!done) return true
  return done.paramsHash !== paramsHash(node)
}

/** 「运行全部」要跑的节点，按拓扑序。 */
export function dirtyNodes(graph: CanvasGraph, runs: CanvasRun[]): string[] {
  return topoOrder(graph).filter((id) => {
    const node = graph.nodes.find(n => n.id === id)
    return node ? isDirty(node, runs) : false
  })
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
): { nodes: CanvasNode[], edges: CanvasEdge[], keyframes: CanvasNode[], videos: CanvasNode[] } {
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

  // 已有几镜就接着排，重复点不会把图叠成一团
  const already = graph.nodes.filter(n => n.kind === kfKind).length

  for (let i = 0; i < rowCount; i++) {
    const idx = already + i + 1
    const kf = createNode(kfKind, { x: baseX, y: baseY + i * ROW }, `S${String(idx).padStart(2, '0')} 首帧`, idx)
    const vd = createNode(vKind, { x: baseX + 300, y: baseY + i * ROW }, `S${String(idx).padStart(2, '0')} 视频`, idx)
    // 分镜表 → 首帧（这一镜的分镜）；分镜表 → 视频（这一镜的关键词）
    edges.push(makeEdge(shotlistId, 'table', kf.id, 'shot'))
    edges.push(makeEdge(shotlistId, 'table', vd.id, 'shot'))
    // 首帧 → 视频（首帧图是视频的输入）
    edges.push(makeEdge(kf.id, 'image', vd.id, 'firstFrame'))
    // 人物与场景由调用方接（一镜可能用不同的人/场景，不该替用户猜）
    nodes.push(kf, vd)
    keyframes.push(kf)
    videos.push(vd)
  }
  return { nodes, edges, keyframes, videos }
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
  node.outputs[artifact.slot] = { artifactId: artifact.id, version: artifact.version }
  const ref = { artifactId: artifact.id, version: artifact.version }
  for (const edge of graph.edges.filter(e => e.from.node === artifact.nodeId && e.from.slot === artifact.slot)) {
    const down = graph.nodes.find(n => n.id === edge.to.node)
    if (down) down.inputs[edge.to.slot] = { from: node.id, slot: artifact.slot, ...ref }
  }
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
