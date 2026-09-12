<script setup lang="ts">
// 对话创作页（/create）。
//
// 业务逻辑全部在 useChatStudio 里，本页只负责布局：历史侧栏 / 消息流 / 输入器 /
// 右侧产物面板，以及移动端的抽屉与全屏预览。
const studio = provideChatStudio()

const streamRef = ref<HTMLElement | null>(null)
const historyOpen = ref(false)
const pinned = ref(true)

const sessionTitle = computed(() => studio.activeSession.value?.title || '新的创作')

const resultTotal = computed(() => studio.previewAssets.value.length)

async function scrollToBottom(force = false) {
  await nextTick()
  const el = streamRef.value
  if (!el) return
  // 用户正在翻历史时不强行拉到底（交接文档：不强迫跳到底部）
  if (!pinned.value && !force) return
  el.scrollTop = el.scrollHeight
}

function onJumpLatest() {
  pinned.value = true
  void scrollToBottom(true)
}

function onScroll() {
  const el = streamRef.value
  if (!el) return
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

watch(() => studio.messages.value.length, () => void scrollToBottom())
watch(() => studio.previewOpen.value, (open) => {
  // 移动端：打开产物预览时收起历史抽屉，避免两层浮层叠在一起
  if (open) historyOpen.value = false
})

onMounted(async () => {
  await studio.init()
  await scrollToBottom(true)
})
</script>

<template>
  <div class="chat-page">
    <!-- 桌面：历史常驻左栏；移动：抽屉 -->
    <div
      v-if="historyOpen"
      class="drawer-mask"
      @click="historyOpen = false"
    />
    <div
      class="history-slot"
      :class="{ open: historyOpen }"
    >
      <HgChatHistory />
    </div>

    <section class="chat-column">
      <header class="chat-head">
        <button
          type="button"
          class="head-icon mobile-only"
          aria-label="打开历史会话"
          @click="historyOpen = true"
        >
          <UIcon name="i-lucide-panel-left" />
        </button>
        <div class="head-copy">
          <strong>{{ sessionTitle }}</strong>
          <small v-if="studio.runningMessages.value.length">
            {{ studio.runningMessages.value.length }} 个任务进行中 · 可继续对话
          </small>
          <small v-else-if="studio.historyLoading.value">正在读取会话…</small>
        </div>
        <div class="head-tools">
          <span
            v-if="studio.runningMessages.value.length"
            class="running-pill"
          >
            <UIcon
              name="i-lucide-loader-circle"
              aria-hidden="true"
            />生成中
          </span>
          <button
            v-if="resultTotal"
            type="button"
            class="head-icon"
            :aria-expanded="studio.previewOpen.value"
            aria-label="切换产物预览"
            @click="studio.previewOpen.value = !studio.previewOpen.value"
          >
            <UIcon :name="studio.previewOpen.value ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'" />
            <small>{{ studio.previewIndex.value + 1 }}/{{ resultTotal }}</small>
          </button>
        </div>
      </header>

      <div
        ref="streamRef"
        class="chat-stream"
        @scroll="onScroll"
      >
        <article
          v-for="message in studio.messages.value"
          :key="message.id"
          class="msg"
          :class="message.role === 'user' ? 'from-user' : 'from-assistant'"
        >
          <div class="msg-meta">
            <span
              class="avatar"
              aria-hidden="true"
            >{{ message.role === 'user' ? '我' : 'AI' }}</span>
            <strong>{{ message.role === 'user' ? '我' : '后宫 AI' }}</strong>
            <time>{{ new Date(message.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</time>
          </div>

          <HgTaskCard
            v-if="message.kind === 'task'"
            :message="message"
          />

          <template v-else>
            <p class="msg-text">
              {{ message.text }}
            </p>
            <figure
              v-if="message.attachment"
              class="msg-attachment"
            >
              <img
                :src="message.attachment.url"
                :alt="message.attachment.name"
              >
              <figcaption>{{ message.attachment.name }}</figcaption>
            </figure>
          </template>
        </article>
      </div>

      <button
        v-if="!pinned"
        type="button"
        class="jump-latest"
        @click="onJumpLatest"
      >
        <UIcon
          name="i-lucide-arrow-down"
          aria-hidden="true"
        />回到最新
      </button>

      <HgChatComposer />
    </section>

    <HgAssetPanel v-if="studio.previewOpen.value" />

    <HgDuplicateDialog />

    <!-- 移动端全屏预览 -->
    <div
      v-if="studio.previewOpen.value && studio.previewAsset.value"
      class="mobile-preview"
    >
      <header>
        <strong>{{ sessionTitle }} · 预览</strong>
        <button
          type="button"
          aria-label="关闭预览"
          @click="studio.previewOpen.value = false"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </header>
      <div class="mobile-stage">
        <img
          v-if="studio.previewAsset.value.kind === 'image'"
          :src="studio.previewAsset.value.url"
          alt=""
        >
        <video
          v-else
          :src="studio.previewAsset.value.url"
          controls
          playsinline
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.history-slot {
  display: flex;
  min-height: 0;
}

.chat-column {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--hg3-line);
  flex-shrink: 0;
}
.head-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.head-copy strong {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.head-copy small {
  color: var(--hg3-faint);
  font-size: 11px;
}
.head-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.running-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgb(101 198 251 / 14%);
  color: var(--hg3-run);
  font-size: 11px;
}
.head-icon {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--hg3-line);
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.head-icon:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
.mobile-only {
  display: none;
}

.chat-stream {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  /* 消息列居中并限宽：宽屏下不再把气泡拉成通栏 */
  max-width: 880px;
  margin: 0 auto;
  padding: 18px 20px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.msg {
  display: grid;
  gap: 6px;
  max-width: min(560px, 78%);
}
/* 用户消息靠右（IM 习惯），AI 靠左 */
.from-user {
  margin-left: auto;
  justify-items: end;
}
.from-user .msg-meta {
  flex-direction: row-reverse;
}
.from-user .msg-text {
  border: 1px solid var(--hg3-accent-line);
  background: var(--hg3-accent-soft);
}
.from-assistant .msg-text {
  border: 1px solid var(--hg3-line);
}
.msg-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--hg3-muted);
  font-size: 12px;
}
.msg-meta strong {
  color: var(--hg3-ink);
  font-size: 12px;
  font-weight: 600;
}
.msg-meta time {
  color: var(--hg3-faint);
}
.avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
  font-size: 10px;
}
.from-user .avatar {
  background: rgb(255 255 255 / 10%);
  color: var(--hg3-ink);
}
.msg-text {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgb(255 255 255 / 5%);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.msg-attachment {
  margin: 0;
  width: 160px;
}
.msg-attachment img {
  width: 100%;
  border-radius: 10px;
  display: block;
}
.msg-attachment figcaption {
  margin-top: 4px;
  color: var(--hg3-faint);
  font-size: 11px;
}

:deep(.task-card) {
  max-width: 560px;
}

.jump-latest {
  position: absolute;
  bottom: 190px;
  left: 50%;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 999px;
  background: #1c1d21;
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transform: translateX(-50%);
  box-shadow: 0 10px 26px #0008;
}

.drawer-mask {
  display: none;
}
.mobile-preview {
  display: none;
}

@media (max-width: 1100px) {
  .history-slot {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 70;
    transform: translateX(-100%);
    transition: transform 200ms ease;
  }
  .history-slot.open {
    transform: none;
  }
  .drawer-mask {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 65;
    background: rgb(6 7 9 / 62%);
  }
  .mobile-only {
    display: inline-flex;
  }
  .mobile-preview {
    display: flex;
    flex-direction: column;
    position: fixed;
    inset: 0;
    z-index: 80;
    background: #0b0c0e;
  }
  .mobile-preview header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    color: var(--hg3-ink);
    font-size: 13px;
  }
  .mobile-preview header button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 999px;
    background: rgb(255 255 255 / 8%);
    color: #fff;
    cursor: pointer;
  }
  .mobile-stage {
    display: grid;
    flex: 1;
    place-items: center;
    min-height: 0;
  }
  .mobile-stage img,
  .mobile-stage video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}
</style>
