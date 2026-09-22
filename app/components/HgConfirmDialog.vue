<script setup lang="ts">
// 通用确认弹窗。
//
// 为什么不用 window.confirm：它是浏览器原生样式，在深色界面里是一块白框，还无法定制按钮
// 文案与危险色 —— 与整站视觉体系完全脱节；而且它同步阻塞主线程，无法在确认前展示"将要删除
// 哪些东西"这类上下文。
//
// 交互约定（与首页的弹层一致）：
//   · Esc 关闭、点遮罩关闭、打开时焦点落在取消按钮上（危险操作不给"回车即删除"）；
//   · 危险操作（danger）确认按钮用警示色，取消在左、确认在右；
//   · 打开时锁滚动，关闭后恢复。
const open = defineModel<boolean>('open', { required: true })

const props = withDefaults(defineProps<{
  title?: string
  message?: string
  /** 确认按钮文案 */
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮用警示色 */
  danger?: boolean
  /** 确认中：禁用按钮并显示进行态 */
  pending?: boolean
  /**
   * 批量操作的进行进度（已处理/总数）。给了就画确定进度条，没给只画一条不确定的流动条。
   *
   * 为什么要有进度条：批量删除几十条时，接口分片发、每片都要等一个来回，弹窗上如果只有
   * 「处理中…」，用户既不知道还要多久、也不知道是不是卡死了 —— 只能靠猜。
   */
  progress?: { done: number, total: number } | null
}>(), {
  title: '确认操作',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
  pending: false,
  progress: null
})

/** 确定进度条宽度：总数不明或还没开始时给 0，避免"先满后空"的假象。 */
const percent = computed(() => {
  const p = props.progress
  if (!p || p.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((p.done / p.total) * 100)))
})

const emit = defineEmits<{ (e: 'confirm'): void }>()

const cancelRef = ref<HTMLButtonElement | null>(null)

function close() {
  if (props.pending) return
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(open, (value) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = value ? 'hidden' : ''
  if (value) void nextTick(() => cancelRef.value?.focus())
})

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="hg-confirm-mask"
      @click.self="close"
    >
      <div
        class="hg-confirm"
        role="alertdialog"
        aria-modal="true"
        :aria-label="title"
      >
        <h2 class="hg-confirm__title">
          {{ title }}
        </h2>
        <p
          v-if="message"
          class="hg-confirm__msg"
        >
          {{ message }}
        </p>
        <slot />
        <!-- 进行态：进度条 + 数字 + 当前动作，三样都给，用户才知道"在删、删到第几个了" -->
        <div
          v-if="pending"
          class="hg-confirm__progress"
        >
          <div
            class="hg-confirm__track"
            role="progressbar"
            :aria-valuemin="0"
            :aria-valuemax="progress?.total || 0"
            :aria-valuenow="progress?.done || 0"
            :aria-valuetext="progress ? `${progress.done}/${progress.total}` : '进行中'"
          >
            <span
              v-if="progress && progress.total > 0"
              class="hg-confirm__fill"
              :style="{ width: `${percent}%` }"
            />
            <span
              v-else
              class="hg-confirm__fill is-indeterminate"
            />
          </div>
          <p class="hg-confirm__status">
            {{ progress && progress.total > 0
              ? `${confirmText}中… ${progress.done}/${progress.total}（${percent}%）`
              : `${confirmText}中…` }}
          </p>
        </div>
        <div class="hg-confirm__actions">
          <button
            ref="cancelRef"
            type="button"
            class="hg-confirm__btn"
            :disabled="pending"
            @click="close"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="hg-confirm__btn hg-confirm__btn--primary"
            :class="{ 'is-danger': danger }"
            :disabled="pending"
            @click="emit('confirm')"
          >
            {{ pending ? '处理中…' : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.hg-confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(6 7 9 / 62%);
  backdrop-filter: blur(2px);
}

.hg-confirm {
  width: min(420px, 100%);
  padding: 20px;
  border: 1px solid var(--hg3-line, #282828);
  border-radius: 12px;
  background: var(--hg3-panel, #16171b);
  box-shadow: 0 18px 48px rgb(0 0 0 / 45%);
}

.hg-confirm__title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--hg3-ink, #fafafa);
}

.hg-confirm__msg {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--hg3-muted, #9a958c);
}

.hg-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.hg-confirm__progress {
  display: grid;
  gap: 6px;
  margin-bottom: 4px;
}

.hg-confirm__track {
  position: relative;
  height: 6px;
  border-radius: 999px;
  background: rgb(255 255 255 / 9%);
  overflow: hidden;
}

.hg-confirm__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--hg3-accent, #ff8a3d), var(--hg3-accent-hi, #ffb066));
  transition: width 220ms ease;
}

/* 总数未知（单条操作）时用流动条表示"在动但算不出百分比" */
.hg-confirm__fill.is-indeterminate {
  width: 40%;
  animation: hg-confirm-flow 1.1s ease-in-out infinite;
}

@keyframes hg-confirm-flow {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(260%); }
}

.hg-confirm__status {
  margin: 0;
  color: var(--hg3-muted, #9a958c);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .hg-confirm__fill,
  .hg-confirm__fill.is-indeterminate {
    animation: none;
    transition: none;
  }
}

.hg-confirm__btn {
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--hg3-line, rgb(255 255 255 / 10%));
  border-radius: 8px;
  background: transparent;
  color: var(--hg3-ink, #fafafa);
  font-size: 13px;
  cursor: pointer;
}

.hg-confirm__btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.hg-confirm__btn--primary {
  border-color: transparent;
  background: var(--hg3-accent, #ff8a3d);
  color: #1a1408;
  font-weight: 600;
}

.hg-confirm__btn--primary.is-danger {
  background: #e5484d;
  color: #fff;
}
</style>
