/**
 * 一个节点有**多口输出**时，界面当前在看/在改的是哪一口。
 *
 * 为什么要单独存一份：卡片和右栏都只能同时讲一口（卡片上逐口列产出，右栏列版本与正文），
 * 而"哪一口"不能各自猜。早先两处都写死 `outputs[0]`，于是剧本拆解拆出来的
 * **场景列表与分镜大纲在图上有行字、却点不开也改不了**（R2 §10 第 2 步里那句
 * "输出槽版本切换"当时没做）。
 *
 * 记的是 `nodeId → slot`；没记过或记的那口已经不在契约里（换了节点类型）就退回第一口 ——
 * 这样"看的是哪一口"永远是个合法槽位，不会因为模板/契约变动而指向不存在的东西。
 */
import type { CanvasNode } from '~/data/canvas-graph'
import { nodeTypeSpec } from '~/data/canvas-nodes'

export function useCanvasSlots() {
  const activeSlots = ref<Record<string, string>>({})

  /** 这个节点当前看的是哪一口（记过就用记的，否则该类型声明的第一口）。 */
  function activeSlotOf(node: CanvasNode): string {
    const outputs = nodeTypeSpec(node.kind).outputs
    const remembered = activeSlots.value[node.id]
    if (remembered && outputs.some(o => o.slot === remembered)) return remembered
    return outputs[0]?.slot ?? ''
  }

  function setActiveSlot(nodeId: string, slot: string): void {
    if (!nodeId || !slot) return
    activeSlots.value = { ...activeSlots.value, [nodeId]: slot }
  }

  /** 换图（新建 / 套模板 / 打开另一张）时清掉：记的是上一张图里某个节点的槽位。 */
  function clearSlots(): void {
    activeSlots.value = {}
  }

  return { activeSlots, activeSlotOf, setActiveSlot, clearSlots }
}
