<script setup lang="ts">
// 历史会话侧栏：搜索、时间分组、新建、重命名、归档。
// 归档语义与后端一致（是归档，不是物理删除），文案不写成「删除」。
const studio = useChatStudio()

const menuId = ref('')
const renamingId = ref('')
const renameDraft = ref('')

function toggleMenu(id: string) {
  menuId.value = menuId.value === id ? '' : id
}

function startRename(id: string, title: string) {
  renamingId.value = id
  renameDraft.value = title
  menuId.value = ''
}

async function commitRename() {
  const title = renameDraft.value.trim()
  const id = renamingId.value
  renamingId.value = ''
  if (!id || !title) return
  await studio.renameSession(id, title)
}

async function archive(id: string) {
  menuId.value = ''
  await studio.archiveSession(id)
}
</script>

<template>
  <aside
    class="chat-history"
    aria-label="历史会话"
  >
    <div class="history-head">
      <strong>历史会话</strong>
      <button
        type="button"
        class="new-session"
        @click="studio.newSession()"
      >
        <UIcon
          name="i-lucide-plus"
          aria-hidden="true"
        />新建
      </button>
    </div>

    <label class="history-search">
      <UIcon
        name="i-lucide-search"
        aria-hidden="true"
      />
      <input
        v-model="studio.sessionQuery.value"
        type="search"
        placeholder="搜索历史"
        aria-label="搜索历史会话"
      >
    </label>

    <div class="history-scroll">
      <p
        v-if="studio.sessionsLoading.value"
        class="history-empty"
      >
        正在加载会话…
      </p>
      <p
        v-else-if="!studio.groupedSessions.value.length"
        class="history-empty"
      >
        {{ studio.sessions.value.length ? '没有匹配的会话。' : '还没有会话，发送第一条创作即会自动建立。' }}
      </p>

      <section
        v-for="group in studio.groupedSessions.value"
        :key="group.label"
      >
        <h3>{{ group.label }}</h3>
        <div
          v-for="item in group.items"
          :key="item.id"
          class="history-item"
          :class="{ active: item.id === studio.activeSessionId.value }"
        >
          <button
            v-if="renamingId !== item.id"
            type="button"
            class="history-open"
            :aria-current="item.id === studio.activeSessionId.value ? 'true' : undefined"
            @click="studio.openSession(item.id)"
          >
            <span class="history-title">{{ item.title || '未命名会话' }}</span>
            <small v-if="item.latestTask">{{ studio.statusLabel(item.latestTask.status as never) }}</small>
            <small v-else>{{ new Date((item.lastActivityAt || item.createdAt) * 1000).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) }}</small>
          </button>
          <form
            v-else
            class="history-rename"
            @submit.prevent="commitRename"
          >
            <input
              v-model="renameDraft"
              aria-label="会话名称"
              @blur="commitRename"
            >
          </form>

          <button
            type="button"
            class="history-more"
            aria-label="会话操作"
            :aria-expanded="menuId === item.id"
            @click.stop="toggleMenu(item.id)"
          >
            <UIcon name="i-lucide-ellipsis" />
          </button>

          <div
            v-if="menuId === item.id"
            class="history-menu"
          >
            <button
              type="button"
              @click="startRename(item.id, item.title)"
            >
              重命名
            </button>
            <button
              type="button"
              @click="archive(item.id)"
            >
              归档
            </button>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.chat-history {
  display: flex;
  flex-direction: column;
  width: 248px;
  flex-shrink: 0;
  padding: 14px 10px;
  border-right: 1px solid var(--hg3-line);
  background: #141519;
  min-height: 0;
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 6px 10px;
}
.history-head strong {
  font-size: 13px;
  font-weight: 600;
}
.new-session {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.new-session:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
.history-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  margin: 0 4px 10px;
  padding: 0 10px;
  border: 1px solid var(--hg3-line);
  border-radius: 9px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-faint);
}
.history-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  outline: none;
}
.history-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.history-scroll h3 {
  margin: 12px 6px 6px;
  color: var(--hg3-faint);
  font-size: 11px;
  font-weight: 500;
}
.history-item {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 9px;
}
.history-item:hover {
  background: rgb(255 255 255 / 5%);
}
.history-item.active {
  background: var(--hg3-rail-active);
}
.history-open {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.history-title {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-open small {
  color: var(--hg3-faint);
  font-size: 11px;
}
.history-more {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-right: 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--hg3-muted);
  cursor: pointer;
  opacity: 0;
}
.history-item:hover .history-more,
.history-more:focus-visible {
  opacity: 1;
}
.history-menu {
  position: absolute;
  top: calc(100% - 4px);
  right: 6px;
  z-index: 20;
  display: grid;
  min-width: 120px;
  padding: 4px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 10px;
  background: #1c1d21;
  box-shadow: 0 16px 40px #0009;
}
.history-menu button {
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.history-menu button:hover {
  background: rgb(255 255 255 / 7%);
}
.history-rename {
  flex: 1;
  padding: 4px;
}
.history-rename input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--hg3-accent-line);
  border-radius: 7px;
  background: #101114;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 13px;
  outline: none;
}
.history-empty {
  padding: 16px 8px;
  color: var(--hg3-faint);
  font-size: 12px;
  line-height: 1.6;
}
</style>
