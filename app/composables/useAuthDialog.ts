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
  /** 打开时默认停在哪个页签：点「注册」入口应直接进注册，而不是再让用户找页签 */
  mode?: 'login' | 'register'
  /** 登录成功后要回到的动作（由调用方自己消费，弹窗不自动执行） */
  resume?: string
}

/**
 * 去登录页并带上来源：登录成功后回到当前页，不用重新找到原来的入口。
 *
 * 用 window.location 取当前路径（这些调用都发生在客户端、session.load() 之后），
 * 只带站内路径（以 / 开头），避免把外链塞进 redirect 造成开放重定向。
 */
export async function goLogin(): Promise<void> {
  if (!import.meta.client) return
  const target = window.location.pathname + window.location.search
  const query = target && target.startsWith('/') && target !== '/auth/login'
    ? `?redirect=${encodeURIComponent(target)}`
    : ''
  await navigateTo(`/auth/login${query}`)
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
