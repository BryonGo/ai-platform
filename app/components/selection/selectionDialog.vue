<script setup lang="ts">
// 底部全屏选择弹层（对齐 PeachArt SelectionDialog）：fixed 底部，搜索 + family 筛选 + 横排卡片 rail。
defineProps<{
  open: boolean
  title: string
  filters: string[]
  activeFilter: string
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:activeFilter', v: string): void
}>()
</script>

<template>
  <div
    v-if="open"
    class="sel-dialog"
    @click.self="emit('close')"
  >
    <div class="sel-dialog__head">
      <h2 class="sel-dialog__title">
        {{ title }}
      </h2>
      <button
        type="button"
        class="sel-dialog__close"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>
    <div class="sel-dialog__filters">
      <button
        v-for="f in filters"
        :key="f"
        type="button"
        class="sel-filter"
        :class="{ active: activeFilter === f }"
        @click="emit('update:activeFilter', f)"
      >
        {{ f }}
      </button>
    </div>
    <div
      class="sel-dialog__body"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.sel-dialog {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: rgb(0 0 0 / 0.78);
  backdrop-filter: blur(6px);
  padding: 28px 20px 20px;
  overflow: hidden;
}
.sel-dialog__head {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.sel-dialog__title { font-size: 22px; font-weight: 600; color: #fff; }
.sel-dialog__close {
  position: absolute; right: 0;
  padding: 8px 10px;
  border: 0; border-radius: 8px;
  color: #fff; opacity: 0.6;
  background: transparent; cursor: pointer; font-size: 16px;
}
.sel-dialog__close:hover { opacity: 1; background: rgb(255 255 255 / 0.1); }
.sel-dialog__filters {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: nowrap;
  margin-bottom: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  max-height: 40px;
  scrollbar-width: none;
}
.sel-dialog__filters::-webkit-scrollbar { display: none; }
.sel-filter {
  flex-shrink: 0;
  padding: 7px 14px;
  border: 0; border-radius: 6px;
  background: rgb(255 255 255 / 0.15);
  color: #fff; font-size: 12px; cursor: pointer;
}
.sel-filter:hover { background: rgb(255 255 255 / 0.25); }
.sel-filter.active { background: #fff; color: #000; }
.sel-dialog__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
