<script setup lang="ts">
// 带封面图的选择卡片（对齐 PeachArt SelectionCard）：封面 + 底部渐变 + 标题 + 副标题，选中粉色高亮。
defineProps<{
  image: string | null
  title: string
  description?: string
  label?: string
  selected?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'select'): void }>()
</script>

<template>
  <button
    type="button"
    class="sel-card"
    :class="{ selected, disabled }"
    :aria-pressed="selected"
    :disabled="disabled"
    @click="emit('select')"
  >
    <img
      v-if="image"
      :src="image"
      :alt="title"
      class="sel-card__img"
      loading="lazy"
    >
    <div
      v-else
      class="sel-card__img sel-card__placeholder"
    >
      {{ title.slice(0, 1) }}
    </div>
    <span class="sel-card__gradient" />
    <span
      v-if="label"
      class="sel-card__label"
    >{{ label }}</span>
    <span class="sel-card__text">
      <span class="sel-card__title">{{ title }}</span>
      <span
        v-if="description"
        class="sel-card__desc"
      >{{ description }}</span>
    </span>
  </button>
</template>

<style scoped>
.sel-card {
  position: relative;
  flex-shrink: 0;
  width: var(--sel-card-w, 152px);
  height: var(--sel-card-h, 200px);
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.1);
  text-align: left;
  cursor: pointer;
  color: #fff;
  scroll-snap-align: start;
}
.sel-card.selected {
  border-color: rgb(246 83 140 / 0.82);
  box-shadow: 0 10px 24px -12px rgb(246 83 140 / 0.55), 0 0 0 1px rgb(255 159 190 / 0.24);
}
.sel-card.disabled { opacity: 0.45; cursor: default; }
.sel-card__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sel-card__placeholder { display: grid; place-items: center; font-size: 2rem; color: rgb(255 255 255 / 0.45); }
.sel-card__gradient {
  position: absolute; inset-inline: 0; bottom: 0; height: 68%;
  background: linear-gradient(to top, rgb(0 0 0 / 0.92), rgb(0 0 0 / 0.64), transparent);
}
.sel-card__label {
  position: absolute;
  top: 8px; left: 8px;
  max-width: calc(100% - 16px);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.35);
  padding: 4px 10px;
  font-size: 11px;
  backdrop-filter: blur(4px);
}
.sel-card__text {
  position: absolute; inset-inline: 0; bottom: 0;
  padding: 12px;
  display: flex; flex-direction: column;
}
.sel-card__title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sel-card__desc { margin-top: 2px; font-size: 11px; color: rgb(255 255 255 / 0.75); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
