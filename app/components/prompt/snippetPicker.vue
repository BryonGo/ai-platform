<script setup lang="ts">
// @ 唤起的超级标签选择器：分类 tab + 搜索 + 结果网格，选中后回传 apply(source)。
import { ref, watch } from 'vue'
import type { SnippetCategory, SnippetItem } from '~/composables/useHougongApi'
import type { SnippetSnapshot } from './enhancement-mark'

const props = defineProps<{
  open: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', source: SnippetSnapshot): void
}>()

const hgApi = useHougongApi()
const categories = ref<SnippetCategory[]>([])
const activeCategory = ref('character')
const query = ref('')
const items = ref<SnippetItem[]>([])
const loading = ref(false)

const categoryLabels: Record<string, string> = {
  character: '角色',
  clothing: '服装',
  background: '背景',
  pose: '姿势',
  style: '画风'
}

async function loadCategories() {
  try {
    categories.value = await hgApi.snippetCategories()
    const first = categories.value[0]
    if (first && !categories.value.some(c => c.key === activeCategory.value)) {
      activeCategory.value = first.key
    }
  } catch {
    categories.value = []
  }
}

async function loadItems() {
  if (!activeCategory.value) return
  loading.value = true
  try {
    const r = await hgApi.snippetList({ category: activeCategory.value, query: query.value.trim() || undefined, limit: 50 })
    items.value = r.items || []
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

function pick(item: SnippetItem) {
  const cat = categories.value.find(c => c.key === item.category)
  emit('apply', {
    id: item.id,
    category: { key: item.category, labels: { chinese: cat?.labels.chinese || categoryLabels[item.category] || item.category, english: cat?.labels.english || item.category } },
    labels: item.labels,
    prompt: item.prompt,
    preview: item.preview
  })
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(query, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadItems, 200)
})

watch(() => props.open, (open) => {
  if (open) {
    query.value = ''
    if (!categories.value.length) {
      loadCategories().then(loadItems)
    } else {
      loadItems()
    }
  }
}, { immediate: true })

watch(activeCategory, () => {
  if (props.open) loadItems()
})
</script>

<template>
  <div
    v-if="open"
    class="snippet-picker"
    @click.stop
  >
    <div class="snippet-picker__head">
      <span class="snippet-picker__title">选择超级标签</span>
      <button
        type="button"
        class="snippet-picker__close"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>
    <div class="snippet-picker__cats">
      <button
        v-for="c in categories"
        :key="c.key"
        type="button"
        class="snippet-picker__cat"
        :class="{ active: activeCategory === c.key }"
        @click="activeCategory = c.key"
      >
        {{ c.labels.chinese }}
      </button>
    </div>
    <input
      v-model="query"
      type="text"
      class="snippet-picker__search"
      placeholder="搜索角色、服装、画风…"
    >
    <div
      v-if="loading"
      class="snippet-picker__empty"
    >
      加载中…
    </div>
    <div
      v-else-if="!items.length"
      class="snippet-picker__empty"
    >
      暂无匹配标签
    </div>
    <div
      v-else
      class="snippet-picker__grid"
    >
      <button
        v-for="it in items"
        :key="it.id"
        type="button"
        class="snippet-picker__item"
        @click="pick(it)"
      >
        <img
          v-if="it.preview"
          :src="it.preview"
          :alt="it.labels.chinese"
          class="snippet-picker__img"
        >
        <div
          v-else
          class="snippet-picker__img snippet-picker__placeholder"
        >
          {{ it.labels.chinese.slice(0, 1) }}
        </div>
        <span class="snippet-picker__name">{{ it.labels.chinese }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.snippet-picker {
  position: absolute;
  z-index: 40;
  bottom: calc(100% + 8px);
  left: 0;
  width: min(420px, 92vw);
  max-height: 360px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.12));
  border-radius: 12px;
  background: var(--bg-elev, rgb(20 20 24 / 0.98));
  box-shadow: 0 10px 32px rgb(0 0 0 / 0.45);
}
.snippet-picker__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.snippet-picker__title { font-size: 12px; font-weight: 700; color: var(--muted); }
.snippet-picker__close { color: var(--muted); cursor: pointer; font-size: 14px; }
.snippet-picker__cats { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.snippet-picker__cat {
  padding: 4px 10px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.12));
  border-radius: 999px;
  cursor: pointer;
  color: var(--ink);
  background: var(--panel);
  font-size: 12px;
}
.snippet-picker__cat.active { border-color: var(--amber); background: rgb(251 191 36 / 0.16); }
.snippet-picker__search {
  width: 100%;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.12));
  border-radius: 8px;
  background: var(--hg-input, rgb(255 255 255 / 0.05));
  color: var(--ink);
  font-size: 13px;
  outline: none;
}
.snippet-picker__empty { color: var(--faint); font-size: 12px; padding: 12px 0; text-align: center; }
.snippet-picker__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.snippet-picker__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  background: transparent;
}
.snippet-picker__item:hover { border-color: var(--hg-line, rgb(255 255 255 / 0.16)); }
.snippet-picker__img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; background: var(--panel); }
.snippet-picker__placeholder { display: grid; place-items: center; color: var(--muted); font-size: 16px; }
.snippet-picker__name { font-size: 11px; color: var(--ink); }
</style>
