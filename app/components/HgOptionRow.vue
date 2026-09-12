<script setup lang="ts">
// 就地展开的选项行：铺在输入框**内部**，不用浮层遮挡输入区。
// 移动端同样适用：横向 chip 自动换行，容器可横向滚动。
export interface RowOption {
  value: string
  label: string
  icon?: string
  disabled?: boolean
  title?: string
}

defineProps<{
  title: string
  options: RowOption[]
  value: string
}>()
const emit = defineEmits<{ select: [value: string], close: [] }>()
</script>

<template>
  <div
    class="hg-option-row"
    role="listbox"
    :aria-label="title"
  >
    <span class="row-title">{{ title }}</span>
    <div class="row-items">
      <button
        v-for="item in options"
        :key="item.value"
        type="button"
        role="option"
        :aria-selected="item.value === value"
        :disabled="item.disabled"
        :title="item.title"
        :class="{ active: item.value === value }"
        @click="emit('select', item.value)"
      >
        <UIcon
          v-if="item.icon"
          :name="item.icon"
          aria-hidden="true"
        />{{ item.label }}
      </button>
    </div>
    <button
      type="button"
      class="row-close"
      aria-label="收起选项"
      @click="emit('close')"
    >
      <UIcon name="i-lucide-x" />
    </button>
  </div>
</template>

<style scoped>
.hg-option-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgb(255 255 255 / 8%);
}
.row-title {
  flex-shrink: 0;
  color: var(--hg3-faint, #6e6b66);
  font-size: 11px;
}
.row-items {
  display: flex;
  flex: 1;
  gap: 6px;
  min-width: 0;
  padding-bottom: 2px;
  overflow-x: auto;
  flex-wrap: wrap;
}
.row-items button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(255 255 255 / 4%);
  color: var(--hg3-ink, #f2f0ec);
  font-family: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.row-items button:hover {
  border-color: rgb(255 255 255 / 22%);
}
.row-items button.active {
  border-color: var(--hg3-accent-line, rgb(217 131 77 / 38%));
  background: var(--hg3-accent-soft, rgb(217 131 77 / 14%));
  color: var(--hg3-accent-hi, #f99749);
}
.row-items button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
.row-close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted, #9a9791);
  cursor: pointer;
}
</style>
