<script setup lang="ts">
const api = useHougongApi()
const session = useAuthSession()

const items = ref<NotificationItem[]>([])
const loading = ref(true)
const error = ref('')
const unread = ref(0)
const page = ref(1)
const total = ref(0)
const marking = ref(false)

const kindText: Record<string, string> = {
  generationSucceeded: '生成完成',
  generationFailed: '生成失败',
  assetApproved: '素材已过审',
  creatorReviewed: '创作者审核结果',
  modelCreatorReviewed: '模型创作者审核结果',
  modelReviewed: '模型审核结果'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [list, u] = await Promise.all([
      api.listNotifications(page.value, 20),
      api.unreadNotifications().catch(() => 0)
    ])
    items.value = list
    unread.value = u
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function markAll() {
  marking.value = true
  try {
    await api.markNotificationsRead([], true)
    unread.value = 0
    for (const it of items.value) it.readAt = new Date().toISOString()
  } finally {
    marking.value = false
  }
}

async function markOne(it: NotificationItem) {
  if (it.readAt) return
  try {
    await api.markNotificationsRead([it.id], false)
    it.readAt = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
  } catch { /* 忽略 */ }
}

function kindIcon(kind: string): string {
  if (kind.startsWith('generationSucceeded')) return '✓'
  if (kind.startsWith('generationFailed')) return '!'
  if (kind.includes('Reviewed')) return '审'
  return '•'
}

onMounted(() => {
  session.load()
  if (!session.token.value) {
    navigateTo('/auth/login')
    return
  }
  load()
})
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          消息中心
        </p>
        <h1>通知</h1>
        <p>生成完成、审核结果与系统消息都会出现在这里。</p>
      </div>
      <button
        type="button"
        class="btn-ghost"
        :disabled="marking || !unread"
        @click="markAll"
      >全部标为已读（{{ unread }}）</button>
    </div>

    <p
      v-if="error"
      class="empty-tip"
    >
      加载失败：{{ error }}
    </p>

    <section class="notify-panel">
      <div
        v-for="it in items"
        :key="it.id"
        class="notify-row"
        :class="{ unread: !it.readAt }"
        @click="markOne(it)"
      >
        <span
          class="notify-icon"
          :class="it.kind"
        >{{ kindIcon(it.kind) }}</span>
        <div class="notify-body">
          <strong>{{ kindText[it.kind] || it.kind }}</strong>
          <p>{{ it.message }}</p>
          <small class="muted">{{ new Date(it.createdAt).toLocaleString() }}</small>
        </div>
        <span
          v-if="!it.readAt"
          class="notify-dot"
          aria-label="未读"
        />
      </div>
      <p
        v-if="!loading && !items.length"
        class="empty-tip"
      >暂无通知</p>
      <p
        v-if="loading"
        class="empty-tip"
      >加载中…</p>
    </section>
  </div>
</template>

<style scoped>
.notify-panel {
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 1.25rem;
  background: var(--hg-card);
  overflow: hidden;
}
.notify-row {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid var(--hg-line, #f2f2f4);
  cursor: pointer;
  transition: background 0.15s;
}
.notify-row:hover {
  background: var(--hg-input);
}
.notify-row.unread {
  background: var(--hg-amber);
}
.notify-icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: var(--hg-amber, #f3e3c0);
  color: var(--hg-accent, #8a6a35);
  font-size: 0.8rem;
  font-weight: 900;
}
.notify-icon.generationFailed {
  background: #fde2e2;
  color: #b91c1c;
}
.notify-body {
  flex: 1;
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.notify-body p {
  margin: 0;
  font-size: 0.86rem;
  color: var(--ink);
  word-break: break-word;
}
.notify-body small {
  font-size: 0.74rem;
}
.notify-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--hg-accent, #b08a4f);
}
</style>
