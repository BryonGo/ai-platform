<script setup lang="ts">
// LoRA 选择器（底部弹层 + 带封面卡片 + 权重数值输入，多选）。对齐 PeachArt LoraSelectionResults + LoraWeightEditor。
import type { CatalogItem } from '~/composables/useHougongApi'

export interface LoraSelection { id: string, weight: number }

const props = defineProps<{
  open: boolean
  loras: CatalogItem[]
  selected: LoraSelection[]
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', value: LoraSelection[]): void
}>()

const query = ref('')

const filtered = computed(() => {
  if (!query.value.trim()) return props.loras
  const q = query.value.trim().toLowerCase()
  return props.loras.filter(l => l.name.toLowerCase().includes(q) || (l.fileName || '').toLowerCase().includes(q))
})

function isSelected(id: string) {
  return props.selected.some(s => s.id === id)
}
function weightOf(id: string, defaultW: number) {
  return props.selected.find(s => s.id === id)?.weight ?? defaultW
}

function toggle(l: CatalogItem) {
  const d = l.weight?.default ?? 1.0
  if (isSelected(l.id)) {
    emit('update', props.selected.filter(s => s.id !== l.id))
  } else {
    emit('update', [...props.selected, { id: l.id, weight: d }])
  }
}
function setWeight(id: string, v: number) {
  emit('update', props.selected.map(s => (s.id === id ? { ...s, weight: v } : s)))
}

watch(() => props.open, (o) => {
  if (o) query.value = ''
})
</script>

<template>
  <SelectionDialog
    :open="open"
    title="选择效果包（LoRA）"
    :filters="[]"
    active-filter=""
    @close="emit('close')"
    @update:active-filter="() => {}"
  >
    <div class="lora-picker">
      <input
        v-model="query"
        type="text"
        class="lora-picker__search"
        placeholder="搜索效果包名称、人物…"
      >
      <div class="lora-picker__grid">
        <div
          v-for="l in filtered"
          :key="l.id"
          class="lora-card"
          :class="{ selected: isSelected(l.id) }"
        >
          <button
            type="button"
            class="lora-card__main"
            @click="toggle(l)"
          >
            <img
              v-if="l.cover"
              :src="l.cover"
              :alt="l.name"
              class="lora-card__img"
              loading="lazy"
            >
            <div
              v-else
              class="lora-card__img lora-card__placeholder"
            >
              {{ l.name.slice(0, 1) }}
            </div>
            <span class="lora-card__gradient" />
            <span class="lora-card__name">{{ l.name }}</span>
          </button>
          <label
            v-if="isSelected(l.id)"
            class="lora-card__weight"
          >
            <span>权重</span>
            <input
              type="number"
              :min="l.weight?.min ?? -4"
              :max="l.weight?.max ?? 4"
              step="0.05"
              :value="weightOf(l.id, l.weight?.default ?? 1.0)"
              @change="setWeight(l.id, Number(($event.target as HTMLInputElement).value))"
            >
          </label>
        </div>
      </div>
      <p
        v-if="!filtered.length"
        class="lora-picker__empty"
      >
        该底模没有可用的效果包。
      </p>
    </div>
  </SelectionDialog>
</template>

<style scoped>
.lora-picker { display: flex; flex-direction: column; gap: 12px; }
.lora-picker__search {
  width: 100%; max-width: 360px; align-self: center;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 0.18); border-radius: 8px;
  background: rgb(255 255 255 / 0.08); color: #fff; font-size: 14px; outline: none;
}
.lora-picker__search:focus { border-color: rgb(246 83 140 / 0.7); }
.lora-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.lora-card {
  position: relative;
  border: 1px solid transparent; border-radius: 10px; overflow: hidden;
  background: rgb(255 255 255 / 0.1);
}
.lora-card.selected { border-color: rgb(246 83 140 / 0.82); }
.lora-card__main {
  position: relative; width: 100%; height: 190px;
  display: block; border: 0; padding: 0; cursor: pointer; background: transparent;
}
.lora-card__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lora-card__placeholder { display: grid; place-items: center; font-size: 2rem; color: rgb(255 255 255 / 0.45); }
.lora-card__gradient { position: absolute; inset-inline: 0; bottom: 0; height: 60%; background: linear-gradient(to top, rgb(0 0 0 / 0.9), transparent); }
.lora-card__name {
  position: absolute; inset-inline: 0; bottom: 8px; padding: 0 10px;
  color: #fff; font-size: 12px; font-weight: 600;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.lora-card__weight {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-top: 1px solid rgb(255 255 255 / 0.1);
}
.lora-card__weight span { color: rgb(255 255 255 / 0.75); font-size: 11px; flex-shrink: 0; }
.lora-card__weight input {
  flex: 1; min-width: 0;
  padding: 5px 8px;
  border: 1px solid rgb(255 255 255 / 0.18); border-radius: 6px;
  background: rgb(0 0 0 / 0.3); color: #fff; font-size: 12px; outline: none;
}
.lora-picker__empty { color: rgb(255 255 255 / 0.65); text-align: center; padding: 24px 0; font-size: 14px; }
</style>
