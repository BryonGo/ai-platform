/** Deterministic left-to-right layout. Only returns positions; never mutates graph data. */
export interface LayoutNode {
  id: string
  kind: string
  width: number
  height: number
  shot?: number
}
export interface LayoutEdge { from: { node: string }, to: { node: string } }
export interface LayoutPoint { x: number, y: number }

const stages: Record<string, number> = {
  script_in: 0, script_gen: 0, script_split: 1,
  character: 2, scene: 2, shotlist: 2,
  keyframe: 3, i2v: 4, audio: 5, compose: 6, export: 7
}
const groups = ['script_in', 'script_gen', 'script_split', 'character', 'scene', 'shotlist', 'keyframe', 'i2v', 'audio', 'compose', 'export']

export function layoutCanvas(nodes: LayoutNode[], edges: LayoutEdge[]): Record<string, LayoutPoint> {
  const result: Record<string, LayoutPoint> = {}
  const byId = new Map(nodes.map(n => [n.id, n]))
  const outgoing = new Map(nodes.map(n => [n.id, new Set<string>()]))
  const incoming = new Map(nodes.map(n => [n.id, new Set<string>()]))
  for (const edge of edges) {
    if (!byId.has(edge.from.node) || !byId.has(edge.to.node)) continue
    outgoing.get(edge.from.node)!.add(edge.to.node)
    incoming.get(edge.to.node)!.add(edge.from.node)
  }
  // Within a group, place shared references near their downstream shot order.
  const shotOrder = (node: LayoutNode) => {
    const shots = [...outgoing.get(node.id)!].map(id => byId.get(id)?.shot).filter((shot): shot is number => shot !== undefined && Number.isFinite(shot))
    return shots.length ? shots.reduce((sum, shot) => sum + shot, 0) / shots.length : Number.POSITIVE_INFINITY
  }
  const compare = (a: LayoutNode, b: LayoutNode) => groups.indexOf(a.kind) - groups.indexOf(b.kind) || shotOrder(a) - shotOrder(b) || a.id.localeCompare(b.id)
  const sorted = [...nodes].sort(compare)
  const connected = sorted.filter(n => outgoing.get(n.id)!.size || incoming.get(n.id)!.size)
  const isolated = sorted.filter(n => !outgoing.get(n.id)!.size && !incoming.get(n.id)!.size)
  const levels = new Map(nodes.map(n => [n.id, stages[n.kind] ?? 0]))
  const degree = new Map(nodes.map(n => [n.id, incoming.get(n.id)!.size]))
  const queue = connected.filter(n => degree.get(n.id) === 0)
  let visited = 0
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!
    visited++
    for (const child of outgoing.get(node.id)!) {
      levels.set(child, Math.max(levels.get(child)!, levels.get(node.id)! + 1))
      degree.set(child, degree.get(child)! - 1)
      if (!degree.get(child)) queue.push(byId.get(child)!)
    }
  }
  if (visited !== connected.length) throw new Error('连线存在循环，请先断开循环后再整理')

  const width = (n: LayoutNode) => Number.isFinite(n.width) && n.width > 0 ? n.width : 268
  const height = (n: LayoutNode) => Number.isFinite(n.height) && n.height > 0 ? n.height : 320
  const columns = [...new Set(connected.map(n => levels.get(n.id)!))].sort((a, b) => a - b)
  const columnX = new Map<number, number>()
  let x = 48
  for (const column of columns) {
    columnX.set(column, x)
    x += Math.max(...connected.filter(n => levels.get(n.id) === column).map(width)) + 110
  }
  const hasShot = (n: LayoutNode) => n.shot !== undefined && Number.isFinite(n.shot) && n.shot >= 0
  const final = (n: LayoutNode) => n.kind === 'compose' || n.kind === 'export'
  let sharedBottom = 48
  // Group shared preparation nodes by kind within each dependency column.
  for (const column of columns) {
    let y = 48
    for (const node of connected.filter(n => levels.get(n.id) === column && !hasShot(n) && !final(n))) {
      result[node.id] = { x: columnX.get(column)!, y }
      y += height(node) + 64
    }
    sharedBottom = Math.max(sharedBottom, y)
  }
  // Reserve the same height for each shot across all columns; stack duplicate-stage nodes.
  const shots = [...new Set(connected.filter(hasShot).map(n => n.shot!))].sort((a, b) => a - b)
  let shotY = sharedBottom
  for (const shot of shots) {
    let rowHeight = 0
    for (const column of columns) {
      let y = shotY
      for (const node of connected.filter(n => n.shot === shot && levels.get(n.id) === column)) {
        result[node.id] = { x: columnX.get(column)!, y }
        y += height(node) + 64
      }
      rowHeight = Math.max(rowHeight, y - shotY)
    }
    shotY += rowHeight + 32
  }
  for (const column of columns) {
    let y = shots.length ? sharedBottom : 48
    for (const node of connected.filter(n => levels.get(n.id) === column && final(n) && !hasShot(n))) {
      // A custom edge may move other node kinds into this column too.
      const occupied = connected.filter(n => levels.get(n.id) === column && result[n.id])
      y = Math.max(y, ...occupied.map(n => result[n.id]!.y + height(n) + 64))
      result[node.id] = { x: columnX.get(column)!, y }
      y += height(node) + 64
    }
  }
  let bottom = connected.length ? Math.max(...connected.map(n => result[n.id]!.y + height(n))) + 128 : 48
  // Unconnected drafts occupy a separate shelf below the pipeline.
  for (let offset = 0; offset < isolated.length; offset += 4) {
    const row = isolated.slice(offset, offset + 4)
    let left = 48
    for (const node of row) {
      result[node.id] = { x: left, y: bottom }
      left += width(node) + 110
    }
    bottom += Math.max(...row.map(height)) + 64
  }
  return result
}
