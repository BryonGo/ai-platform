<script setup lang="ts">
import type { ComposerMode, UserModelOption } from '~/composables/useModelCatalog'

// 模型面板内容（不含容器）：桌面由 popover 承载，移动端由底部面板承载，
// 两条路径共用这一份 UI，避免两套实现漂移。
const props = defineProps<{
  options: UserModelOption[]
  modelValue: string
  mode: ComposerMode
}>()
const emit = defineEmits<{ select: [value: string], close: [] }>()

const query = ref('')
const scope = ref<'all' | 'recent'>('all')
const recent = ref<string[]>([])

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return props.options
    .filter(item => scope.value === 'all' || recent.value.includes(item.id))
    .filter(item => !keyword || item.name.toLowerCase().includes(keyword) || item.tags.join(' ').toLowerCase().includes(keyword))
    .sort((a, b) => {
      const rank = (id: string) => id === props.modelValue ? -1 : (recent.value.indexOf(id) === -1 ? 99 : recent.value.indexOf(id))
      return rank(a.id) - rank(b.id)
    })
})

onMounted(() => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('hg:recent-models') || '[]')
    if (Array.isArray(saved)) recent.value = saved.filter((key): key is string => typeof key === 'string').slice(0, 12)
  } catch { /* 本地存储不可用时只影响排序 */ }
})

function choose(option: UserModelOption) {
  if (!option.available) return
  recent.value = [option.id, ...recent.value.filter(id => id !== option.id)].slice(0, 12)
  try {
    localStorage.setItem('hg:recent-models', JSON.stringify(recent.value))
  } catch { /* 可选偏好 */ }
  emit('select', option.id)
  emit('close')
}

// 单位随账务通道走：积分（本地预占）与余额（云端扣款）不能混标（交接文档 G2）
function priceText(option: UserModelOption) {
  return option.fromPrice === null ? '价格待报价' : `起步 ${option.fromPrice} ${option.priceUnit}`
}
</script>

<template>
  <div class="model-panel">
    <div class="model-scope">
      <button
        type="button"
        :aria-pressed="scope === 'all'"
        @click="scope = 'all'"
      >
        全部
      </button>
      <button
        type="button"
        :aria-pressed="scope === 'recent'"
        @click="scope = 'recent'"
      >
        最近使用
      </button>
    </div>

    <input
      v-model="query"
      class="model-search"
      type="search"
      placeholder="搜索模型名称或能力"
      aria-label="搜索模型"
    >

    <div class="model-list">
      <button
        v-for="option in filtered"
        :key="option.id"
        type="button"
        class="model-row"
        :class="{ selected: option.id === modelValue }"
        :disabled="!option.available"
        @click="choose(option)"
      >
        <img
          v-if="option.cover"
          :src="option.cover"
          alt=""
          loading="lazy"
        >
        <span
          v-else
          class="model-initial"
          aria-hidden="true"
        >{{ option.name.slice(0, 1) }}</span>
        <span class="model-copy">
          <b>{{ option.name }}</b>
          <span
            v-if="option.summary"
            class="model-sub"
          >{{ option.summary }}</span>
          <span
            v-else
            class="model-sub"
          >{{ option.tags.join(' · ') || '能力待后台补充' }}</span>
        </span>
        <span class="model-price">{{ option.available ? priceText(option) : option.unavailableReason }}</span>
      </button>
      <p
        v-if="!filtered.length"
        class="model-empty"
      >
        {{ scope === 'recent' ? '选择过的模型会出现在这里。' : '没有匹配的模型。' }}
      </p>
    </div>

    <footer>
      <span>{{ filtered.length }} 个模型</span>
      <NuxtLink
        to="/models"
        @click="emit('close')"
      >
        查看全部模型 →
      </NuxtLink>
    </footer>
  </div>
</template>

<style scoped>
.model-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 16px;
  background: #1c1d21;
  color: var(--hg3-ink, #f2f0ec);
}
.model-scope {
  display: flex;
  gap: 6px;
}
.model-scope button {
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted, #9a9791);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.model-scope button[aria-pressed='true'] {
  background: var(--hg3-accent-soft, rgb(217 131 77 / 14%));
  color: var(--hg3-accent-hi, #f99749);
}
.model-search {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 10px;
  background: #141519;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  outline: none;
}
.model-list {
  display: grid;
  gap: 2px;
  max-height: min(420px, 52dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.model-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.model-row:hover {
  background: rgb(255 255 255 / 5%);
}
.model-row.selected {
  border-color: var(--hg3-accent-line, rgb(217 131 77 / 38%));
  background: var(--hg3-accent-soft, rgb(217 131 77 / 14%));
}
.model-row:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.model-row img,
.model-initial {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 9px;
  object-fit: cover;
}
.model-initial {
  display: grid;
  place-items: center;
  background: var(--hg3-accent-soft, rgb(217 131 77 / 14%));
  color: var(--hg3-accent-hi, #f99749);
  font-size: 15px;
  font-weight: 700;
}
.model-copy {
  display: grid;
  flex: 1;
  gap: 3px;
  min-width: 0;
}
.model-copy b {
  font-size: 13px;
  font-weight: 600;
}
.model-sub {
  color: var(--hg3-muted, #9a9791);
  font-size: 11px;
}
.model-price {
  flex-shrink: 0;
  color: var(--hg3-muted, #9a9791);
  font-size: 11px;
  white-space: nowrap;
}
.model-empty {
  padding: 26px 8px;
  color: var(--hg3-faint, #6e6b66);
  font-size: 13px;
  text-align: center;
}
.model-panel footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid rgb(255 255 255 / 8%);
  color: var(--hg3-faint, #6e6b66);
  font-size: 11px;
}
.model-panel footer a {
  color: var(--hg3-accent, #d9834d);
  text-decoration: none;
}
</style>
