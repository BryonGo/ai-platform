/**
 * 画布撤销 / 重做（页面侧的状态包装）。
 *
 * 纯逻辑在 ~/data/canvas-history.ts（可单独跑测试）；这里只管与页面接线：
 * 深监听图与产物、把快照压栈、应用快照、以及让按钮跟着栈变化重新渲染。
 *
 * 三个约定（踩过坑才写下来的）：
 *   1. **runs 不进快照** —— 任务与花费是账本，撤销不该把账抹掉
 *   2. 应用快照期间要屏蔽监听（applyingHistory），否则撤销本身会被记成一步
 *   3. 数据一变就让 Vue Flow 重新测量节点句柄 —— 连线是按句柄坐标画的，
 *      测量过期会让线"跑偏或看不见"
 */
import type { Ref } from 'vue'
import type { CanvasArtifact, CanvasGraph, CanvasNode } from '~/data/canvas-graph'
import { editableGraph, withServerOutputs } from '~/data/canvas-sync'
import { createHistory } from '~/data/canvas-history'

export interface CanvasSnapshot {
  graph: string
}

export function useCanvasHistory(opts: {
  graph: Ref<CanvasGraph>
  artifacts: Ref<CanvasArtifact[]>
  /** 选中的节点 id（撤销后节点没了就清掉）。 */
  selectedId: Ref<string>
  /** 提示（"已撤销"）。 */
  toast: (text: string) => void
  /** 让 Vue Flow 重新测量节点句柄。 */
  remeasure: () => void
}) {
  const { graph, selectedId, toast, remeasure } = opts

  function sameSnapshot(a: CanvasSnapshot, b: CanvasSnapshot): boolean {
    return a.graph === b.graph
  }

  const history = createHistory<CanvasSnapshot>(50, sameSnapshot)
  /** 让撤销/重做按钮跟着历史栈变化重新渲染（历史本身是纯对象）。 */
  const historyVersion = ref(0)
  let applyingHistory = false
  let historyTimer: number | undefined
  const serverNodes = new Map<string, CanvasNode>()
  function rememberSelections(): void {
    for (const node of graph.value.nodes) serverNodes.set(node.id, { ...node, outputs: { ...node.outputs } })
  }

  function snapshotNow(): CanvasSnapshot {
    return { graph: JSON.stringify(editableGraph(graph.value)) }
  }

  function applySnapshot(snap: CanvasSnapshot): void {
    applyingHistory = true
    rememberSelections()
    graph.value = withServerOutputs(JSON.parse(snap.graph) as CanvasGraph, { ...graph.value, nodes: [...serverNodes.values()] })
    if (selectedId.value && !graph.value.nodes.some(n => n.id === selectedId.value)) selectedId.value = ''
    nextTick(() => {
      applyingHistory = false
    })
  }

  /** 重建基线：没有它，第一次改动就没有"上一步"可回。换图（新建/套模板）后也要调。 */
  function reset(): void {
    serverNodes.clear()
    rememberSelections()
    if (typeof window !== 'undefined') window.clearTimeout(historyTimer)
    history.reset(snapshotNow())
    historyVersion.value++
  }

  // 建立基线
  reset()

  watch(
    graph,
    () => {
      rememberSelections()
      if (applyingHistory) return
      nextTick(remeasure)
      window.clearTimeout(historyTimer)
      historyTimer = window.setTimeout(() => {
        history.push(snapshotNow())
        historyVersion.value++
      }, 260)
    },
    { deep: true }
  )

  const canUndo = computed(() => {
    void historyVersion.value
    return history.canUndo()
  })
  const canRedo = computed(() => {
    void historyVersion.value
    return history.canRedo()
  })

  function checkpoint(): void {
    window.clearTimeout(historyTimer)
    history.push(snapshotNow())
    historyVersion.value++
  }

  /** Commit bulk changes as exactly one step, separate from pending edits. */
  async function transaction(change: () => void): Promise<void> {
    checkpoint()
    applyingHistory = true
    try {
      change()
      checkpoint()
      await nextTick()
    } finally {
      applyingHistory = false
      remeasure()
    }
  }

  onBeforeUnmount(() => window.clearTimeout(historyTimer))

  function undo(): void {
    checkpoint()
    const previous = history.undo()
    if (!previous) return
    historyVersion.value++
    applySnapshot(previous)
    toast('已撤销')
  }

  function redo(): void {
    checkpoint()
    const next = history.redo()
    if (!next) return
    historyVersion.value++
    applySnapshot(next)
    toast('已重做')
  }

  return { canUndo, canRedo, undo, redo, reset, transaction }
}
