<script setup lang="ts">
// 发布作品弹窗（把生成结果/选中素材发布到社区，出现在首页「探索」流）。
//
// 为什么要有它：后端 `platform_work` 一直是"有表、有发布接口、没有入口"——
// 前台零调用，于是探索流永远是空的、只能拿示例内容兜底。这里补上入口与表单。
//
// 职责划分：本组件只做展示与收集（标题/正文/分级/封面确认），**不调接口**；
// 由父页面负责 saveWorkDraft / publishWork 与错误提示，这样同一个弹窗既能被
// `/assets`（选中素材当封面）复用，也能被作品详情（用既有作品当封面）复用。
const open = defineModel<boolean>('open', { required: true })

const props = withDefaults(defineProps<{
  /** 封面预览地址（签发 URL） */
  coverUrl?: string
  /** 封面来源名称，例如素材文件名 */
  coverName?: string
  /** 编辑既有作品时的初值 */
  initialTitle?: string
  initialContent?: string
  initialRating?: string
  /** 正在编辑既有作品（true 时不显示"保存草稿"，避免覆盖线上内容的语义歧义） */
  editing?: boolean
  /** 提交中：禁用按钮 */
  pending?: boolean
}>(), {
  coverUrl: '',
  coverName: '',
  initialTitle: '',
  initialContent: '',
  initialRating: '',
  editing: false,
  pending: false
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: { mode: 'draft' | 'publish', title: string, content: string, contentRating: string }): void
}>()

const title = ref('')
const content = ref('')
const rating = ref('')

watch(open, (v) => {
  if (!v) return
  title.value = props.initialTitle || ''
  content.value = props.initialContent || ''
  rating.value = props.initialRating || ''
})

const canPublish = computed(() => title.value.trim().length > 0 && !props.pending)

/** 分级口径与后端一致：留空 = 不改（新作品即不设分级）。 */
const RATINGS = [
  { value: '', label: '不设置' },
  { value: 'sfw', label: '全年龄（SFW）' },
  { value: 'r15', label: '15+（R15）' },
  { value: 'r18', label: '18+（R18）' }
]

function submit(mode: 'draft' | 'publish') {
  if (props.pending) return
  if (mode === 'publish' && !canPublish.value) return
  emit('submit', { mode, title: title.value.trim(), content: content.value, contentRating: rating.value })
}

function close() {
  if (props.pending) return
  open.value = false
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

watch(open, (v) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = v ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="publish-mask"
      @click.self="close"
    >
      <section
        class="publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
      >
        <header class="publish-head">
          <h2 id="publish-title">
            {{ editing ? '编辑作品' : '发布作品' }}
          </h2>
          <button
            type="button"
            class="publish-close"
            aria-label="关闭"
            :disabled="pending"
            @click="close"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </header>

        <div class="publish-cover">
          <img
            v-if="coverUrl"
            :src="coverUrl"
            :alt="coverName || '封面'"
          >
          <div
            v-else
            class="publish-cover--empty"
          >
            <UIcon name="i-lucide-image-off" />
            <span>没有封面</span>
          </div>
          <p class="publish-cover__meta">
            <span class="publish-cover__tag">封面</span>
            {{ coverName || '未选择素材' }}
            <template v-if="!editing">
              <br>
              <small>发布后探索流的卡片图就是它。</small>
            </template>
          </p>
        </div>

        <label class="publish-field">
          <span>标题<em>*</em></span>
          <input
            v-model="title"
            type="text"
            maxlength="120"
            placeholder="给作品起个名字"
            :disabled="pending"
          >
        </label>

        <label class="publish-field">
          <span>正文</span>
          <textarea
            v-model="content"
            rows="3"
            placeholder="想说的话、用的提示词、模型与参数（可留空）"
            :disabled="pending"
          />
        </label>

        <label class="publish-field publish-field--inline">
          <span>分级</span>
          <select
            v-model="rating"
            :disabled="pending"
          >
            <option
              v-for="r in RATINGS"
              :key="r.value"
              :value="r.value"
            >
              {{ r.label }}
            </option>
          </select>
          <small class="publish-hint">分级只影响展示口径，不改变内容审核。</small>
        </label>

        <footer class="publish-actions">
          <button
            type="button"
            class="publish-btn"
            :disabled="pending"
            @click="close"
          >
            取消
          </button>
          <button
            v-if="!editing"
            type="button"
            class="publish-btn"
            :disabled="pending"
            @click="submit('draft')"
          >
            保存草稿
          </button>
          <button
            type="button"
            class="publish-btn publish-btn--primary"
            :disabled="!canPublish"
            @click="submit('publish')"
          >
            {{ pending ? '提交中…' : (editing ? '保存并发布' : '发布') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.publish-mask {
  position: fixed;
  inset: 0;
  z-index: 92;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(6 7 9 / 66%);
  backdrop-filter: blur(3px);
}
.publish-dialog {
  display: grid;
  gap: 12px;
  width: min(520px, 100%);
  max-height: calc(100dvh - 32px);
  padding: 18px;
  border: 1px solid var(--hg3-line, rgb(255 255 255 / 10%));
  border-radius: 14px;
  background: var(--hg3-panel, #16171b);
  box-shadow: 0 18px 48px rgb(0 0 0 / 45%);
  overflow: auto;
  color: var(--hg3-ink, #fafafa);
}
.publish-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.publish-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.publish-close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--hg3-line, rgb(255 255 255 / 10%));
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.publish-close:hover {
  border-color: var(--hg3-line-strong, rgb(255 255 255 / 20%));
}
.publish-cover {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--hg3-line, #282828);
  border-radius: 12px;
  background: rgb(255 255 255 / 3%);
}
.publish-cover img,
.publish-cover--empty {
  width: 96px;
  height: 96px;
  border-radius: 10px;
  object-fit: cover;
  background: #1b1d21;
}
.publish-cover--empty {
  display: grid;
  place-items: center;
  gap: 4px;
  color: var(--hg3-faint, #6f6f6f);
  font-size: 11px;
}
.publish-cover__meta {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.publish-cover__meta small {
  color: var(--hg3-muted, #949494);
}
.publish-cover__tag {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--hg3-accent-soft, rgb(232 50 176 / 14%));
  color: var(--hg3-accent-hi, #f347bc);
  font-size: 11px;
}
.publish-field {
  display: grid;
  gap: 6px;
  font-size: 13px;
}
.publish-field > span {
  color: var(--hg3-muted, #949494);
}
.publish-field em {
  color: var(--hg3-accent-hi, #f347bc);
  font-style: normal;
}
.publish-field input,
.publish-field textarea,
.publish-field select {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--hg3-line, rgb(255 255 255 / 10%));
  border-radius: 10px;
  background: var(--hg3-well, #171717);
  color: var(--hg3-ink, #fafafa);
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
}
.publish-field input:focus,
.publish-field textarea:focus,
.publish-field select:focus {
  border-color: var(--hg3-accent-line, rgb(232 50 176 / 38%));
  outline: none;
}
.publish-field--inline {
  grid-template-columns: auto 150px 1fr;
  align-items: center;
}
.publish-hint {
  color: var(--hg3-faint, #6f6f6f);
  font-size: 11px;
}
.publish-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}
.publish-btn {
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--hg3-line-strong, #333);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.publish-btn:hover:not(:disabled) {
  border-color: var(--hg3-accent, #e832b0);
  color: var(--hg3-accent-hi, #f347bc);
}
.publish-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.publish-btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, var(--hg3-accent-hi, #f347bc), var(--hg3-accent, #e832b0));
  color: var(--hg3-accent-ink, #3a2412);
  font-weight: 800;
}
.publish-btn--primary:hover:not(:disabled) {
  color: var(--hg3-accent-ink, #3a2412);
  filter: brightness(1.06);
}
@media (max-width: 560px) {
  .publish-field--inline {
    grid-template-columns: auto 1fr;
  }
  .publish-hint {
    grid-column: 1 / -1;
  }
}
</style>
