// 登录弹窗的跨组件开关。
// 首页、对话创作页等都可能因为「生成／发布前未登录」而拉起同一个弹窗，
// 因此用 useState 持有，由 app.vue 统一渲染 HgAuthDialog。
//
// 交互契约（首页设计说明 §8.2 / 效果图面板 04）：
// - 弹窗可关闭，关闭后保留草稿；
// - 登录成功后回到费用确认，不自动执行付费任务。

export interface AuthDialogIntent {
  /** 触发场景，用于弹窗内的说明文案 */
  reason: 'generate' | 'publish' | 'account'
  /** 登录成功后要回到的动作（由调用方自己消费，弹窗不自动执行） */
  resume?: string
}

export function useAuthDialog() {
  const open = useState<boolean>('hg:auth-dialog-open', () => false)
  const intent = useState<AuthDialogIntent>('hg:auth-dialog-intent', () => ({ reason: 'account' }))

  function openDialog(next: AuthDialogIntent = { reason: 'account' }) {
    intent.value = next
    open.value = true
  }

  function closeDialog() {
    open.value = false
  }

  return { open, intent, openDialog, closeDialog }
}
