/**
 * 画布撤销 / 重做：与框架无关的一小块纯逻辑。
 *
 * 为什么单独成文件：撤销栈的边界条件（首次记录、撤销后再改动要清空重做栈、
 * 相同状态不该占一步）最容易"看着对、实际错"，抽出来就能直接跑一遍验证。
 *
 * 用法：
 *   const history = createHistory<Snapshot>(50, sameSnapshot)
 *   history.reset(current)        // 建立基线（初次与重置示例后都要调）
 *   history.push(current)         // 每次状态变化后记录
 *   const prev = history.undo()   // 拿到上一步的状态，由调用方应用
 */

export interface CanvasHistory<T> {
  canUndo: () => boolean
  canRedo: () => boolean
  /** 记录一次状态。与当前相同则忽略；有分歧则清空重做栈。 */
  push: (state: T) => void
  /** 建立基线：清空两侧栈，把 state 当作"当前"。 */
  reset: (state: T) => void
  /** 撤销一步并返回该状态；没得撤销时返回 undefined。 */
  undo: () => T | undefined
  /** 重做一步并返回该状态；没得重做时返回 undefined。 */
  redo: () => T | undefined
  /** 当前状态（用于判定"是否真的变了"）。 */
  current: () => T | undefined
}

export function createHistory<T>(
  limit = 50,
  isSame: (a: T, b: T) => boolean = (a, b) => a === b
): CanvasHistory<T> {
  let past: T[] = []
  let future: T[] = []
  let current: T | undefined

  return {
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    current: () => current,

    reset(state: T) {
      past = []
      future = []
      current = state
    },

    push(state: T) {
      // 第一次记录：只建立基线，不产生"可撤销的一步"
      if (current === undefined) {
        current = state
        return
      }
      if (isSame(current, state)) return
      past = [...past, current].slice(-limit)
      current = state
      // 有了新改动，原来的重做分支就作废了
      future = []
    },

    undo() {
      if (!past.length) return undefined
      const previous = past[past.length - 1]!
      past = past.slice(0, -1)
      if (current !== undefined) future = [...future, current].slice(-limit)
      current = previous
      return previous
    },

    redo() {
      if (!future.length) return undefined
      const next = future[future.length - 1]!
      future = future.slice(0, -1)
      if (current !== undefined) past = [...past, current].slice(-limit)
      current = next
      return next
    }
  }
}
