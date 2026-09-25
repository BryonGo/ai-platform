import { ref, computed, watch, onScopeDispose } from 'vue'

/* 后台生成通知：任务「完成/失败」时在右下角弹一条轻提示。
 *
 * 架构与 useChatStudio 的 settle 同款：轮询是权威，SSE 只做加速唤醒。
 * 模块级单例，client-only；token 非空才启动，清空即停，重复调用不重复建。 */

type TaskStatus = 'creating' | 'queued' | 'running' | 'reconciling' | 'succeeded' | 'failed' | 'cancelled'

interface NotifTask {
  id: string
  status: TaskStatus
  createdAt?: string
  errorMessage?: string
}

interface Toast {
  id: string
  kind: 'ok' | 'fail'
  text: string
}

const ACTIVE: ReadonlySet<string> = new Set(['creating', 'queued', 'running', 'reconciling'])
const POLL_BUSY_MS = 10_000 // 有在盯的任务：10s 一轮
const POLL_IDLE_MS = 45_000 // 没有在盯的：45s 保底（兜住 SSE 断线）
const WAKE_MIN_MS = 1_500 // SSE/可见性唤醒的最小间隔，防止风暴
const TOAST_TTL_MS = 6_500

const toasts = ref<Toast[]>([])
let booted = false
let stopFns: Array<() => void> = []

/* 每任务每会话最多提示一次；watching 记录在盯任务的当前状态。 */
const acked = new Set<string>()
const watching = new Map<string, TaskStatus>()
let startedAtMs = 0
let lastWakeMs = 0
let timer: ReturnType<typeof setTimeout> | null = null
let offSse: (() => void) | null = null

function dismissToast(id: string) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx >= 0) toasts.value.splice(idx, 1)
}

function pushToast(kind: Toast['kind'], text: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  toasts.value.push({ id, kind, text })
  setTimeout(() => dismissToast(id), TOAST_TTL_MS)
  // 最多同时挂 4 条，再挤就丢最旧的
  while (toasts.value.length > 4) dismissToast(toasts.value[0]!.id)
}

function markTerminal(task: NotifTask) {
  acked.add(task.id)
  watching.delete(task.id)
  if (task.status === 'failed') {
    const reason = task.errorMessage ? `：${task.errorMessage.slice(0, 60)}` : ''
    pushToast('fail', `生成失败${reason}`)
  } else if (task.status === 'succeeded') {
    pushToast('ok', '生成完成')
  }
}

async function poll(hgApi: ReturnType<typeof useHougongApi>) {
  let tasks: NotifTask[]
  try {
    tasks = (await hgApi.listTasks()) as NotifTask[]
  } catch {
    schedule(hgApi) // 拉取失败不打扰用户，下一轮再说
    return
  }
  for (const task of tasks) {
    const prev = watching.get(task.id)
    if (prev && !ACTIVE.has(task.status)) {
      markTerminal(task)
    } else if (prev) {
      watching.set(task.id, task.status)
    } else if (ACTIVE.has(task.status)) {
      watching.set(task.id, task.status)
    } else if (
      task.createdAt
      && Date.parse(task.createdAt) > startedAtMs
      && !acked.has(task.id)
      && (task.status === 'succeeded' || task.status === 'failed')
    ) {
      // 兜底：SSE 断线 + 轮询空窗漏掉的完成（本次会话期间才发生的）
      markTerminal(task)
    }
  }
  schedule(hgApi)
}

function schedule(hgApi: ReturnType<typeof useHougongApi>) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void poll(hgApi), watching.size > 0 ? POLL_BUSY_MS : POLL_IDLE_MS)
}

function wake(hgApi: ReturnType<typeof useHougongApi>) {
  const now = Date.now()
  if (now - lastWakeMs < WAKE_MIN_MS) return
  lastWakeMs = now
  if (timer) clearTimeout(timer)
  void poll(hgApi)
}

function stopAll() {
  if (timer) { clearTimeout(timer); timer = null }
  offSse?.(); offSse = null
  watching.clear()
  acked.clear()
  for (const fn of stopFns) fn()
  stopFns = []
}

function boot(hgApi: ReturnType<typeof useHougongApi>) {
  if (booted) return
  booted = true
  startedAtMs = Date.now()
  lastWakeMs = 0

  void poll(hgApi) // 初始一轮：把已存在的活跃任务纳入盯梢

  offSse = hgApi.subscribeTaskEvents(() => wake(hgApi))

  const onVisible = () => { if (document.visibilityState === 'visible') wake(hgApi) }
  document.addEventListener('visibilitychange', onVisible)

  stopFns = [() => document.removeEventListener('visibilitychange', onVisible)]
}

/* 对外：toasts 供渲染层消费，dismissToast 供点掉；启动/停止全自动。 */
export function useTaskNotifier() {
  const session = useAuthSession()
  const hgApi = useHougongApi()
  const isLoggedIn = computed(() => Boolean(session.token.value))

  if (import.meta.client) {
    watch(isLoggedIn, (loggedIn) => {
      if (loggedIn) boot(hgApi)
      else { stopAll(); booted = false }
    }, { immediate: true })

    onScopeDispose(() => { if (import.meta.client) stopAll() })
  }

  return { toasts, dismissToast }
}
