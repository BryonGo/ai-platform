// 互动鎏光的指针跟随：把指针位置写进 --mx/--my，样式层再用径向渐变画亮点。
// 样式与行为分离，组件只需 @pointermove 绑一次。
export function useGlowPointer() {
  function onGlowPointerMove(event: PointerEvent) {
    const el = event.currentTarget as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    el.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`)
    el.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`)
  }
  return { onGlowPointerMove }
}
