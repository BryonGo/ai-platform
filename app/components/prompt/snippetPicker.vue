<script setup lang="ts">
// 第二级：某分类下的超级标签卡片弹层（底部全屏，带封面卡片）。
// 对齐 PeachArt snippet-picker.tsx（SelectionDialog + SelectionCard）。
import type { SnippetCategory, SnippetItem } from '~/composables/useHougongApi'
import type { SnippetSnapshot } from './enhancement-mark'

const props = defineProps<{
  open: boolean
  category: string
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', source: SnippetSnapshot): void
}>()

const hgApi = useHougongApi()
const categoryMeta = ref<SnippetCategory | null>(null)
const subcategory = ref('')
const query = ref('')
const items = ref<SnippetItem[]>([])
const loading = ref(false)

const labels: Record<string, string> = {
  character: '角色',
  clothing: '服装',
  background: '背景',
  pose: '姿势',
  style: '画风'
}
const title = computed(() => `选择${labels[props.category] || '超级标签'}`)
const subfilters = computed(() => {
  const subs = categoryMeta.value?.subcategories || []
  return [{ key: '', label: '全部' }, ...subs.map(s => ({ key: s.key, label: s.labels.chinese }))]
})

async function loadCategory() {
  try {
    const cats = await hgApi.snippetCategories()
    categoryMeta.value = cats.find(c => c.key === props.category) || null
  } catch {
    categoryMeta.value = null
  }
}

async function loadItems() {
  if (!props.category) return
  loading.value = true
  try {
    const r = await hgApi.snippetList({
      category: props.category,
      subcategory: subcategory.value || undefined,
      query: query.value.trim() || undefined,
      limit: 50
    })
    items.value = r.items || []
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

function pick(item: SnippetItem) {
  const cat = categoryMeta.value
  emit('apply', {
    id: item.id,
    category: {
      key: item.category,
      labels: {
        chinese: cat?.labels.chinese || labels[item.category] || item.category,
        english: cat?.labels.english || item.category
      }
    },
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
watch(subcategory, () => {
  if (props.open) loadItems()
})
watch(() => props.open, (o) => {
  if (o) {
    query.value = ''
    subcategory.value = ''
    if (!categoryMeta.value) loadCategory().then(loadItems)
    else loadItems()
  }
}, { immediate: true })
watch(() => props.category, () => {
  categoryMeta.value = null
  if (props.open) loadCategory().then(loadItems)
})
</script>

<template>
  <SelectionDialog
    :open="open"
    :title="title"
    :filters="subfilters.map(f => f.label)"
    :active-filter="subcategory === '' ? '全部' : (subfilters.find(f => f.key === subcategory)?.label || '全部')"
    @close="emit('close')"
    @update:active-filter="(label) => { const f = subfilters.find(x => x.label === label); subcategory = f?.key ?? '' }"
  >
    <div class="snippet-second">
      <input
        v-model="query"
        type="text"
        class="snippet-second__search"
        :placeholder="`搜索${labels[category] || '标签'}…`"
      >
      <div
        v-if="loading"
        class="snippet-second__empty"
      >
        加载中…
      </div>
      <div
        v-else-if="!items.length"
        class="snippet-second__empty"
      >
        没有找到匹配的超级标签。
      </div>
      <div
        v-else
        class="snippet-second__grid"
      >
        <SelectionCard
          v-for="it in items"
          :key="it.id"
          :image="it.preview"
          :title="it.labels.chinese"
          :description="it.labels.english"
          :label="subfilters.find(f => f.key === it.subcategory)?.label"
          @select="pick(it)"
        />
      </div>
    </div>
  </SelectionDialog>
</template>

<style scoped>
.snippet-second { display: flex; flex-direction: column; gap: 12px; }
.snippet-second__search {
  width: 100%; max-width: 360px; align-self: center;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 0.18); border-radius: 8px;
  background: rgb(255 255 255 / 0.08); color: #fff; font-size: 14px; outline: none;
}
.snippet-second__search:focus { border-color: rgb(246 83 140 / 0.7); }
.snippet-second__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.snippet-second__empty { color: rgb(255 255 255 / 0.65); text-align: center; padding: 24px 0; font-size: 14px; }
</style>
