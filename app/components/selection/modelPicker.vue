<script setup lang="ts">
// 模型选择器（底部弹层 + 带封面卡片，按 family 筛选）。对齐 PeachArt ModelSelectionDialog。
import type { CatalogItem } from '~/composables/useHougongApi'

const props = defineProps<{
  open: boolean
  models: CatalogItem[]
  modelId: string
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', id: string): void
}>()

const family = ref('全部')
const query = ref('')

const families = computed(() => {
  const set = new Set<string>()
  for (const m of props.models) if (m.family) set.add(m.family)
  return ['全部', ...set]
})

const filtered = computed(() => {
  let list = props.models
  if (family.value !== '全部') list = list.filter(m => m.family === family.value)
  if (query.value.trim()) {
    const q = query.value.trim().toLowerCase()
    list = list.filter(m => m.name.toLowerCase().includes(q) || (m.fileName || '').toLowerCase().includes(q) || m.family.toLowerCase().includes(q))
  }
  return list
})

watch(() => props.open, (o) => {
  if (o) {
    query.value = ''
    family.value = '全部'
  }
})
</script>

<template>
  <SelectionDialog
    :open="open"
    title="选择模型"
    :filters="families"
    :active-filter="family"
    @close="emit('close')"
    @update:active-filter="family = $event"
  >
    <div class="model-picker">
      <input
        v-model="query"
        type="text"
        class="model-picker__search"
        placeholder="搜索模型名称、系列…"
      >
      <div class="model-picker__grid">
        <SelectionCard
          v-for="m in filtered"
          :key="m.id"
          :image="m.cover || null"
          :title="m.name"
          :description="m.family"
          :selected="m.id === modelId"
          @select="emit('select', m.id)"
        />
      </div>
      <p
        v-if="!filtered.length"
        class="model-picker__empty"
      >
        没有找到匹配的模型。
      </p>
    </div>
  </SelectionDialog>
</template>

<style scoped>
.model-picker { display: flex; flex-direction: column; gap: 12px; }
.model-picker__search {
  width: 100%; max-width: 360px;
  align-self: center;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 8px;
  background: rgb(255 255 255 / 0.08);
  color: #fff; font-size: 14px; outline: none;
}
.model-picker__search:focus { border-color: rgb(246 83 140 / 0.7); }
.model-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.model-picker__empty { color: rgb(255 255 255 / 0.65); text-align: center; padding: 24px 0; font-size: 14px; }
</style>
