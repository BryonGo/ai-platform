<script setup lang="ts">
// 重复提交确认（参考图面板 03 / 交接文档 G3 第二层）。
//
// 服务端目前没有「同内容不同 clientKey」的确认协议，所以判定在前端、且是**显式**的：
// 命中后不建任务、不预占、不扣款；用户可以选择查看已有任务，或确认再次生成。
// 协议落地后判定移到后端，这里只保留展示与确认。
const studio = useChatStudio()

const pending = computed(() => studio.duplicate.value)

const createdAt = computed(() => {
  const time = pending.value?.existing.time
  if (!time) return ''
  return new Date(time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
})

const costHint = computed(() => {
  const meta = pending.value?.meta
  if (!meta || meta.credits === null) return '再次生成将创建独立任务，可能再次计费。'
  return `再次生成将创建独立任务，预计再占用 ${meta.credits} ${meta.unit}。`
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="pending"
      class="dup-mask"
      @click.self="studio.dismissDuplicate()"
    >
      <section
        class="dup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dup-title"
      >
        <h2 id="dup-title">
          <UIcon
            name="i-lucide-triangle-alert"
            aria-hidden="true"
          />这条内容已经提交过
        </h2>

        <article class="dup-task">
          <header>
            <strong>{{ pending.existing.meta?.mode === 'video' ? '视频生成' : '图片生成' }}</strong>
            <span class="dup-status">{{ studio.statusLabel(pending.existing.status) }}</span>
          </header>
          <p class="dup-line">
            {{ [pending.existing.meta?.modelName, pending.existing.meta?.ratio, pending.existing.meta?.mode === 'video' ? `${pending.existing.meta?.seconds} 秒` : ''].filter(Boolean).join(' · ') }}
          </p>
          <p class="dup-line muted">
            任务 ID：{{ pending.existing.taskId }}<template v-if="createdAt">
              · {{ createdAt }}
            </template>
          </p>
        </article>

        <p class="dup-note">
          {{ costHint }}
        </p>
        <p
          v-if="pending.dims.length"
          class="dup-dims"
        >
          相同维度：{{ pending.dims.join('、') }}
        </p>

        <div class="dup-actions">
          <button
            type="button"
            class="primary"
            @click="studio.confirmDuplicate()"
          >
            仍要再次生成
          </button>
          <button
            type="button"
            @click="studio.viewDuplicate()"
          >
            查看已有任务
          </button>
          <button
            type="button"
            class="ghost"
            @click="studio.dismissDuplicate()"
          >
            取消
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dup-mask {
  position: fixed;
  inset: 0;
  z-index: 92;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(6 7 9 / 70%);
  backdrop-filter: blur(3px);
}
.dup-dialog {
  display: grid;
  gap: 12px;
  width: min(420px, 100%);
  padding: 18px 20px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 16px;
  background: #1c1d21;
  color: var(--hg3-ink, #f2f0ec);
  box-shadow: 0 24px 70px #000a;
}
.dup-dialog h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.dup-dialog h2 svg {
  color: var(--hg3-warn, #ffb454);
}
.dup-task {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: var(--hg3-card, #30333a);
}
.dup-task header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dup-task header strong {
  font-size: 13px;
}
.dup-status {
  padding: 2px 8px;
  border-radius: 6px;
  background: rgb(255 180 84 / 16%);
  color: var(--hg3-warn, #ffb454);
  font-size: 11px;
}
.dup-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}
.dup-line.muted {
  color: var(--hg3-muted, #9a9791);
}
.dup-note {
  margin: 0;
  color: var(--hg3-muted, #9a9791);
  font-size: 12px;
  line-height: 1.7;
}
.dup-dims {
  margin: 0;
  color: var(--hg3-faint, #6e6b66);
  font-size: 11px;
}
.dup-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.dup-actions button {
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dup-actions button:hover {
  background: rgb(255 255 255 / 6%);
}
.dup-actions button.primary {
  border: 0;
  background: linear-gradient(135deg, var(--hg3-accent-hi, #f99749), var(--hg3-accent, #d9834d));
  color: var(--hg3-accent-ink, #3a2412);
  font-weight: 700;
}
.dup-actions button.ghost {
  border-color: transparent;
  color: var(--hg3-muted, #9a9791);
}
</style>
