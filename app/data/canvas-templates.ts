/**
 * 画布模板：内置一条产线，外加"把当前这张图另存为模板"。
 *
 * 现在没有后端（后端正在重构，接口还没定），所以用户模板先存在**浏览器本地**。
 * 等后端就绪，把这里换成 canvas_template 的两个接口即可，界面不用改。
 *
 * 只存图（节点 + 连线 + 参数），不存产物与运行记录：模板是"产线"，不是"这一集的成果"。
 */

import type { CanvasArtifact, CanvasGraph, CanvasRun } from './canvas-graph'
import { buildCanvasSample } from './canvas-sample'

export interface CanvasTemplateInfo {
  id: string
  name: string
  summary: string
  builtIn?: boolean
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
    graph: { version: 1, frameGrid: [...buildCanvasSample().graph.frameGrid], nodes: [], edges: [] },
    artifacts: [],
    runs: []
  }
}

/** 载入模板。内置模板带示例产物；自己存的只有图。 */
export function loadTemplate(id: string): CanvasTemplatePayload | null {
  const builtIn = BUILT_IN_TEMPLATES.find(t => t.id === id)
  if (builtIn) return { ...buildCanvasSample(), graph: { ...buildCanvasSample().graph } }
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
