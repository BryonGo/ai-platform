<script setup lang="ts">
export interface ComposerModelOption {
  key: string
  name: string
  source: 'local' | 'cloud'
  detail: string
  cover?: string
  disabled?: boolean
}
const props = defineProps<{
  options: ComposerModelOption[]
  selectedKey: string
  mode: 'image' | 'video'
}>()
const emit = defineEmits<{
  select: [key: string]
  browse: []
  open: []
}>()
const open = ref(false)
const query = ref('')
const filter = ref('all')
const recent = ref<string[]>([])
const filters = [
  { id: 'all', label: '全部' },
  { id: 'recent', label: '最近使用' },
  { id: 'local', label: '本地' },
  { id: 'cloud', label: '云端' }
]
const selected = computed(() => props.options.find(m => m.key === props.selectedKey))
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.options.filter(m =>
    (filter.value === 'all' || (filter.value === 'recent' ? recent.value.includes(m.key) : m.source === filter.value))
    && (!q || `${m.name} ${m.detail}`.toLowerCase().includes(q))
  ).sort((a, b) => {
    const rank = (key: string) => key === props.selectedKey ? -2 : recent.value.includes(key) ? recent.value.indexOf(key) : 100
    return rank(a.key) - rank(b.key)
  })
})
onMounted(() => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('composer-recent-models') || '[]')
    if (Array.isArray(saved)) recent.value = saved.filter((key): key is string => typeof key === 'string').slice(0, 12)
  } catch { /* Storage may be unavailable; selection still works. */ }
})
watch(open, (value) => {
  if (value) {
    query.value = ''
    filter.value = 'all'
    emit('open')
  }
})
watch(() => props.mode, () => {
  open.value = false
})
function choose(model: ComposerModelOption) {
  if (model.disabled) return
  recent.value = [model.key, ...recent.value.filter(key => key !== model.key)].slice(0, 12)
  try {
    localStorage.setItem('composer-recent-models', JSON.stringify(recent.value))
  } catch { /* Optional preference. */ }
  emit('select', model.key)
  open.value = false
}
function browse() {
  open.value = false
  emit('browse')
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :ui="{ content: 'ring-0 bg-transparent shadow-none rounded-xl' }"
    :content="{ side: 'top', align: 'start', collisionPadding: 12 }"
  >
    <button
      type="button"
      class="composer-model-trigger"
      aria-label="选择创作模型"
    >
      <img
        v-if="selected?.cover"
        :src="selected.cover"
        alt=""
      >
      <span
        v-else
        class="model-initial"
        aria-hidden="true"
      >{{ selected?.name[0] || 'M' }}</span>
      <span class="trigger-name">{{ selected?.name || '选择模型' }}</span>
      <small v-if="selected">{{ selected.source === 'local' ? '本地' : '云端' }}</small>
      <span aria-hidden="true">⌄</span>
    </button>
    <template #content>
      <section
        class="quick-model-panel"
        :aria-label="`选择${mode === 'image' ? '图片' : '视频'}模型`"
      >
        <header>
          <strong>{{ mode === 'image' ? '图片模型' : '视频模型' }}</strong>
          <button
            type="button"
            aria-label="关闭模型选择"
            @click="open = false"
          >
            ×
          </button>
        </header>
        <input
          v-model="query"
          class="model-search"
          aria-label="搜索模型"
          placeholder="搜索模型名称、系列或厂商…"
        >
        <div
          class="model-filters"
          aria-label="模型来源筛选"
        >
          <button
            v-for="item in filters"
            :key="item.id"
            type="button"
            :aria-pressed="filter === item.id"
            @click="filter = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="quick-model-list">
          <button
            v-for="model in filtered"
            :key="model.key"
            type="button"
            class="quick-model-row"
            :class="{ selected: model.key === selectedKey }"
            :aria-pressed="model.key === selectedKey"
            :disabled="model.disabled"
            @click="choose(model)"
          >
            <img
              v-if="model.cover"
              :src="model.cover"
              alt=""
              loading="lazy"
            >
            <span
              v-else
              class="model-initial"
              aria-hidden="true"
            >{{ model.name[0] }}</span>
            <span class="quick-model-copy"><b>{{ model.name }}</b><small>{{ model.detail }}</small></span>
            <span class="source-badge">{{ model.disabled ? '暂不可用' : model.source === 'local' ? '本地' : '云端' }}</span>
            <span
              class="model-check"
              aria-hidden="true"
            >{{ model.key === selectedKey ? '✓' : '' }}</span>
          </button>
          <p
            v-if="!filtered.length"
            class="model-empty"
          >
            {{ query ? '没有找到匹配的模型，试试其他关键词。' : filter === 'recent' ? '选择过的模型会出现在这里。' : '暂无可用模型' }}
          </p>
        </div>
        <footer>
          <span>{{ filtered.length }} 个模型</span>
          <button
            v-if="mode === 'image'"
            type="button"
            @click="browse"
          >
            浏览本地模型封面 ↗
          </button>
        </footer>
      </section>
    </template>
  </UPopover>
</template>

<style scoped>
.composer-model-trigger { display: flex; align-items: center; gap: 8px; height: 36px; max-width: 280px; padding: 0 10px; border: 1px solid rgb(251 191 36 / 25%); border-radius: 9px; background: rgb(251 191 36 / 7%); color: #e8d69b; cursor: pointer; }
.composer-model-trigger img, .model-initial { width: 26px; height: 26px; flex-shrink: 0; border-radius: 6px; object-fit: cover; }
.model-initial { display: grid; place-items: center; background: rgb(251 191 36 / 12%); color: #e2c974; }
.trigger-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-model-trigger small { color: #aaa59a; white-space: nowrap; }
.quick-model-panel { width: min(480px, calc(100vw - 24px)); max-height: min(480px, calc(100dvh - 32px), var(--reka-popover-content-available-height, 480px)); display: flex; flex-direction: column; padding: 16px; border: 1px solid #41403b; border-radius: 14px; background: #1c1d20; color: #eeece5; box-shadow: 0 18px 60px #0009; }
.quick-model-panel header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.quick-model-panel button { cursor: pointer; font: inherit; }
.quick-model-panel header button { border: 0; background: transparent; color: #aaa; font-size: 24px; width: 28px; }
.model-search { width: 100%; flex-shrink: 0; padding: 10px 12px; border: 1px solid #414247; border-radius: 8px; background: #141518; color: #eeece5; font-size: 13px; }
.model-filters { display: flex; gap: 6px; padding: 12px 0; }
.model-filters button { border: 0; border-radius: 6px; padding: 6px 12px; background: transparent; color: #a9a9b0; font-size: 12px; }
.model-filters button[aria-pressed=true] { background: #d7b85924; color: #ecd38c; }
.quick-model-list { overflow-y: auto; min-height: 0; overscroll-behavior: contain; }
.quick-model-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 8px; text-align: left; border: 1px solid transparent; border-radius: 9px; background: transparent; color: inherit; }
.quick-model-row:hover { background: #ffffff09; }
.quick-model-row.selected { border-color: #b89d504d; background: #d7b85912; }
.quick-model-row:disabled { opacity: .45; cursor: not-allowed; }
.quick-model-row img, .quick-model-row .model-initial { width: 38px; height: 38px; border-radius: 8px; object-fit: cover; }
.quick-model-copy { flex: 1; min-width: 0; display: grid; gap: 4px; }
.quick-model-copy b { font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
.quick-model-copy small { font-size: 11px; color: #aaa9af; }
.source-badge { font-size: 10px; color: #b9b5a9; white-space: nowrap; }
.model-check { width: 12px; color: #e6c879; }
.model-empty { padding: 30px 10px; text-align: center; color: #aaa9af; font-size: 13px; }
.quick-model-panel footer { display: flex; justify-content: space-between; gap: 8px; padding-top: 12px; margin-top: 8px; border-top: 1px solid #ffffff12; font-size: 11px; color: #919098; }
.quick-model-panel footer button { border: 0; background: transparent; color: #dac17e; }
.quick-model-panel :focus-visible, .composer-model-trigger:focus-visible { outline: 2px solid #e6c879; outline-offset: 2px; }
</style>
