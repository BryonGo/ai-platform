/**
 * 画布模板：内置一条产线，外加"把当前这张图另存为模板"。
 *
 * 用户模板先存在**浏览器本地**（模板是不是运营资产要单独拍板，见 R2 §10.5）。
 *
 * **模板只给结构（节点 + 连线 + 参数），不给产物与运行记录**：模板是"产线"，
 * 不是"这一集的成果"。以前内置模板连示例产物一起塞进来，套用后图上会出现一批
 * 指向不存在产物的"已就绪"节点 —— 现在结构照给，产物必须自己跑。
 */

import type { CanvasArtifact, CanvasGraph, CanvasRun } from './canvas-graph'
import { FRAME_GRID } from './canvas-nodes'
import { buildCanvasSample } from './canvas-sample'

export interface CanvasTemplateInfo {
  id: string
  name: string
  summary: string
  /** 内置产线（代码里那份，来自 canvas-sample）。 */
  builtIn?: boolean
  /**
   * 运营下发的站点模板（来自 `/canvas/template/list`）。
   *
   * 与本地模板的区别是**所有权**：站点模板全站可见、用户删不掉（要下架得去后台），
   * 本地模板是这台浏览器里的私人草稿。两者在列表里长一样，但删除按钮只给后者。
   */
  site?: boolean
}

export interface CanvasTemplatePayload {
  graph: CanvasGraph
  artifacts: CanvasArtifact[]
  runs: CanvasRun[]
}

const STORAGE_KEY = 'hougong.canvas.templates.v1'

/** 内置模板：带产物与运行记录，用来"看明白这条产线长什么样"。 */
export const BUILT_IN_TEMPLATES: CanvasTemplateInfo[] = [
  { id: 'builtin-three-shots', name: '三镜短剧产线', summary: '剧本 → 拆解 → 人物/场景/分镜 → 首帧 → 视频 → 排序合成 → 导出', builtIn: true }
]

interface StoredTemplate {
  id: string
  name: string
  graph: CanvasGraph
}

function readStored(): StoredTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredTemplate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // 本地存储被清掉或写坏了：当作没有模板，不要因此打不开画布
    return []
  }
}

function writeStored(list: StoredTemplate[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* 存不下（隐私模式/配额满）就算了，界面上会提示一句 */
  }
}

/** 全部模板：内置的在前，自己存的在后。 */
export function listTemplates(): CanvasTemplateInfo[] {
  const mine = readStored().map(t => ({ id: t.id, name: t.name, summary: '我存的模板' }))
  return [...BUILT_IN_TEMPLATES, ...mine]
}

/** 空白画布：一张什么都没连的图。 */
export function emptyCanvas(): CanvasTemplatePayload {
  return {
    // 帧数网格随图下发给前端（真源在服务端，见 data/canvas-nodes.ts 的 FRAME_GRID 说明）。
    graph: { version: 1, frameGrid: [...FRAME_GRID], nodes: [], edges: [] },
    artifacts: [],
    runs: []
  }
}

/**
 * 载入模板：**只给结构**（节点 + 连线 + 参数），产物与运行记录一律为空。
 *
 * 内置模板的结构同样来自 `canvas-sample.ts` —— 那份数据的价值是"照最短闭环摆好一条
 * 产线"，不是"替你跑出结果"。
 */
export function loadTemplate(id: string): CanvasTemplatePayload | null {
  const builtIn = BUILT_IN_TEMPLATES.find(t => t.id === id)
  if (builtIn) {
    const structure = buildCanvasSample().graph
    return {
      graph: { ...structure, nodes: structure.nodes.map(n => ({ ...n, outputs: {} })), edges: structure.edges },
      artifacts: [],
      runs: []
    }
  }
  const stored = readStored().find(t => t.id === id)
  if (!stored) return null
  return { graph: stored.graph, artifacts: [], runs: [] }
}

/** 把当前这张图存成模板（只存图，不存产物与账）。 */
export function saveTemplate(name: string, graph: CanvasGraph): CanvasTemplateInfo | null {
  if (typeof window === 'undefined') return null
  const id = `t_${Date.now().toString(36)}`
  const list = readStored()
  list.push({ id, name, graph })
  writeStored(list.slice(-20))
  return { id, name, summary: '我存的模板' }
}

export function removeTemplate(id: string): void {
  writeStored(readStored().filter(t => t.id !== id))
}
