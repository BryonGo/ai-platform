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

/**
 * 预签名过期自愈：创作页长挂时，会话里已展示的产物地址（3600s）会过期，
 * 切回来重新解码就是 403。这里只**换一批签名地址**（refreshAssetUrls），
 * 不重载会话、不动正在跑的任务。见 ~/composables/useMediaRefresh。
 */
useMediaAutoRefresh(() => studio.refreshAssetUrls())
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
            <p
              v-if="message.text"
              class="msg-text"
            >
              {{ message.text }}
            </p>
            <!-- 参考图**并排多图**：一行最多 4 张，超过自动折行（auto-fit + 容器限宽 =
                 最多 4 列；张数少时每张自动变宽，不会缩成一条小图）。 -->
            <div
              v-if="message.attachments?.length"
              class="msg-attachments"
              :class="{ single: message.attachments.length === 1 }"
            >
              <figure
                v-for="(file, i) in message.attachments"
                :key="`${message.id}-att-${i}`"
                :title="file.name"
              >
                <img
                  :src="file.url"
                  :alt="file.name"
                >
                <!-- 单图显示文件名；视频多图显示角色（首帧 / 参考1…）——
                     「这张图是干啥的」在消息里就要看得出来，不然回头看聊天记录
                     只剩一排缩略图，出图不对时无从对照。 -->
                <figcaption v-if="file.role">
                  角色：{{ file.role }}
                </figcaption>
                <figcaption v-else-if="message.attachments.length === 1">
                  {{ file.name }}
                </figcaption>
              </figure>
            </div>
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
/* 参考图并排展示：一行最多 4 张，超过折行。
   实现用 auto-fit + 容器限宽（而不是写死 repeat(4,1fr)）：这样 1 张时铺满、
   2 张各占一半、4 张一行排满、5 张换行 —— 写死 4 列会让 2 张图各只占 1/4 宽。 */
.msg-attachments {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
  /* 4 × 110 + 3 × 8 = 464，取 470 保证一行最多 4 张 */
  max-width: 470px;
  margin-top: 6px;
}
.msg-attachments.single {
  max-width: 260px;
}
.msg-attachments figure {
  margin: 0;
  overflow: hidden;
  border-radius: 10px;
  background: #101114;
}
.msg-attachments img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}
.msg-attachments figcaption {
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
}
</style>
