// 窄屏判定：移动端要把模型/参数从 popover 换成底部面板（交互图面板 04）。
// SSR 阶段按 false 处理，挂载后再用 matchMedia 校正，避免水合不一致。
export function useIsNarrow(query = '(max-width: 640px)') {
  const matches = ref(false)
  let mql: MediaQueryList | null = null

  function update(event?: MediaQueryListEvent) {
    matches.value = event ? event.matches : !!mql?.matches
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mql = window.matchMedia(query)
    update()
    mql.addEventListener('change', update)
  })
  onUnmounted(() => {
    mql?.removeEventListener('change', update)
  })

  return matches
}
