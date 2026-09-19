/**
 * 分镜表的逐行编辑（草稿）。
 *
 * 为什么要有草稿这一层：分镜表是一行一镜，**改一镜不该把整张图重跑**。
 * 编辑先落草稿，点「保存为新版本」才生成 v(n+1) 并设为当前选用 ——
 * 于是只有依赖这一镜的下游变脏。
 *
 * 草稿**按节点 id 存**（不是只跟"当前选中的节点"绑定）：卡片上直接改、右栏里改，
 * 用的是同一份，不会出现两处显示不一样。
 */
import type { Ref } from 'vue'
import type { CanvasArtifact, CanvasGraph, CanvasNode, CanvasShotRow } from '~/data/canvas-graph'
import { nodeTypeSpec } from '~/data/canvas-nodes'

export function useCanvasRows(opts: {
  graph: Ref<CanvasGraph>
  artifacts: Ref<CanvasArtifact[]>
  toast: (text: string) => void
}) {
  const { graph, artifacts } = opts

  const rowDrafts = ref<Record<string, { rows: CanvasShotRow[], dirty: boolean }>>({})

  function keyOf(nodeId: string): string {
    const node = graph.value.nodes.find(n => n.id === nodeId)
    const slot = node ? nodeTypeSpec(node.kind).outputs[0]?.slot ?? '' : ''
    return `${nodeId}:${node?.outputs[slot]?.artifactId || ''}`
  }

  /** 该节点当前的分镜表：有草稿用草稿，否则用当前选用产物的行。 */
  function tableRowsOf(node: CanvasNode): CanvasShotRow[] {
    const draft = rowDrafts.value[keyOf(node.id)]
    if (draft) return draft.rows
    const slot = nodeTypeSpec(node.kind).outputs[0]?.slot ?? ''
    const picked = node.outputs[slot]
    const artifact = picked ? artifacts.value.find(a => a.id === picked.artifactId) : undefined
    return artifact?.rows ?? []
  }

  function rowsDirty(nodeId: string): boolean {
    return !!rowDrafts.value[keyOf(nodeId)]?.dirty
  }

  function updateRow(nodeId: string, index: number, key: keyof CanvasShotRow, value: string | number): void {
    const node = graph.value.nodes.find(n => n.id === nodeId)
    if (!node) return
    const rows = (rowDrafts.value[keyOf(nodeId)]?.rows ?? tableRowsOf(node)).map(r => ({ ...r }))
    const row = rows[index]
    if (!row) return
    if (key === 'frames' || key === 'idx') row[key] = Number(value)
    else (row as Record<string, unknown>)[key] = value
    rowDrafts.value = { ...rowDrafts.value, [keyOf(nodeId)]: { rows, dirty: true } }
  }

  function discardRows(nodeId: string, artifactId?: string): void {
    const rest = { ...rowDrafts.value }
    delete rest[artifactId === undefined ? keyOf(nodeId) : `${nodeId}:${artifactId}`]
    rowDrafts.value = rest
  }

  /** 换图时清空草稿。 */
  function clearDrafts(): void {
    rowDrafts.value = {}
  }

  return { rowDrafts, tableRowsOf, rowsDirty, updateRow, discardRows, clearDrafts }
}
