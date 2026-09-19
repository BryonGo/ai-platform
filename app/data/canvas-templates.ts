/**
 * 画布模板："把当前这张图另存为模板"。
 *
 * 用户模板先存在**浏览器本地**（模板是不是运营资产要单独拍板，见 R2 §10.5）。
 *
 * **模板只给结构（节点 + 连线 + 参数），不给产物与运行记录**：模板是"产线"，
 * 不是"这一集的成果"。以前内置模板连示例产物一起塞进来，套用后图上会出现一批
 * 指向不存在产物的"已就绪"节点 —— 现在结构照给，产物必须自己跑。
 */

import type { CanvasArtifact, CanvasGraph, CanvasRun } from './canvas-graph'
import { FRAME_GRID } from './canvas-nodes'

export interface CanvasTemplateInfo {
  id: string
  name: string
  summary: string
  /** 服务端内置模板标识。 */
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

function writeStored(list: StoredTemplate[]): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** 本机用户实际保存的模板。 */
export function listTemplates(): CanvasTemplateInfo[] {
  const mine = readStored().map(t => ({ id: t.id, name: t.name, summary: '我存的模板' }))
  return mine
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
 * 仅载入用户实际保存的结构，不生成示例内容。
 */
export function loadTemplate(id: string): CanvasTemplatePayload | null {
  const stored = readStored().find(t => t.id === id)
  if (!stored) return null
  return { graph: { ...stored.graph, nodes: stored.graph.nodes.map(n => ({ ...n, outputs: {} })) }, artifacts: [], runs: [] }
}

/** 把当前这张图存成模板（只存图，不存产物与账）。 */
export function saveTemplate(name: string, graph: CanvasGraph): CanvasTemplateInfo | null {
  if (typeof window === 'undefined') return null
  const id = `t_${Date.now().toString(36)}`
  const list = readStored()
  list.push({ id, name, graph })
  if (!writeStored(list.slice(-20))) return null
  return { id, name, summary: '我存的模板' }
}

export function removeTemplate(id: string): boolean {
  return writeStored(readStored().filter(t => t.id !== id))
}
