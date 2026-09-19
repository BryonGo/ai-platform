import type { CanvasGraph, CanvasNode } from './canvas-graph'

/** Server-owned output selections and derived inputs never belong to edit history. */
export function editableGraph(graph: CanvasGraph): CanvasGraph {
  return { ...graph, nodes: graph.nodes.map(n => ({ ...n, inputs: {}, outputs: {} })) }
}
export function editFingerprint(graph: CanvasGraph): string {
  return JSON.stringify(editableGraph(graph))
}
export function nodeFingerprint(node: CanvasNode): string {
  return JSON.stringify({ kind: node.kind, params: node.params, inputs: node.inputs })
}
export function withServerOutputs(local: CanvasGraph, remote: CanvasGraph): CanvasGraph {
  const nodes = local.nodes.map(n => ({ ...n, outputs: remote.nodes.find(r => r.id === n.id)?.outputs ?? {}, inputs: {} as CanvasNode['inputs'] }))
  for (const edge of local.edges) {
    const target = nodes.find(n => n.id === edge.to.node)
    const source = nodes.find(n => n.id === edge.from.node)
    const ref = source?.outputs[edge.from.slot]
    if (!target || !source || !ref) continue
    ;(target.inputs[edge.to.slot] ??= []).push({ ...ref, from: source.id, slot: edge.from.slot })
  }
  return { ...local, nodes }
}
export function mergeCanvas(local: CanvasGraph, baseline: CanvasGraph, remote: CanvasGraph) {
  const localChanged = editFingerprint(local) !== editFingerprint(baseline)
  const remoteChanged = editFingerprint(remote) !== editFingerprint(baseline)
  const conflict = localChanged && remoteChanged && editFingerprint(local) !== editFingerprint(remote)
  return { graph: localChanged ? withServerOutputs(local, remote) : remote, conflict }
}
