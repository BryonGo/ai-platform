// 首页 → 创作页 的跨页草稿传递（仅内存，客户端路由跳转时有效）。
// 后端契约落地后由 URL 参数 + 上传接口替代。

export interface ComposerDraft {
  prompt: string
  mode: 'image' | 'video'
  ratio: string
  /** 视频时长（秒），与创作页 videoSeconds 一致 */
  durationSeconds: number
  /** 参考图（可多张，数量上限由所选模型的 maxInputs 决定）。uploadName 为第一张的文件名，兼容旧用法。 */
  uploadName: string
  files: File[]
  /** @deprecated 单图时代的字段，仅旧调用方读取；新代码用 files。 */
  file?: File | null
  /**
   * 首页已选模型。交接文档第 4 节要求首页把描述、模式、已选模型、参数与引用
   * 一并交给对话页，跳转本身不产生第二次任务。
   * channel 决定创作页用哪条选择路径恢复，不参与任何 UI 文案。
   */
  modelId?: string
  modelChannel?: 'local' | 'cloud' | 'video'
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
