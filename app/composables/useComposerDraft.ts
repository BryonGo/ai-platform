// 首页 → 创作页 的跨页草稿传递（仅内存，客户端路由跳转时有效）。
// 后端契约落地后由 URL 参数 + 上传接口替代。

export interface ComposerDraft {
  prompt: string
  mode: 'image' | 'video'
  ratio: string
  duration: string
  uploadName: string
  file: File | null
}

const draft = ref<ComposerDraft | null>(null)

export function useComposerDraft() {
  function setDraft(d: ComposerDraft) {
    draft.value = d
  }

  function takeDraft() {
    const d = draft.value
    draft.value = null
    return d
  }

  return { setDraft, takeDraft }
}
