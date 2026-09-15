<script setup lang="ts">
// 输入框左侧的参考图条（首页与创作页共用）。
//
// 为什么抽出来（2026-09-14 用户反馈）：同一个动作在两个页面是两套交互 ——
// 首页是正文左侧的 + 方框，创作页是工具栏里的「参考图」胶囊。用户在两页之间切换时
// 找不到同一个按钮，所以这里统一成一套，并固定放在**正文之外**：
//   · 空态 = + 号（一眼知道是"加东西"）；
//   · 已选 = 等比缩略图 + 右上角移除，**可多张**（数量上限由模型的 maxInputs 决定）；
//   · 图片不进文字流，鼠标点正文、定位光标都不受图片影响；
//   · 有图时正文一侧加分隔线（见调用方的 .has-media 样式）。
const props = withDefaults(defineProps<{
  /** 已选参考图（preview 为本地 blob 或素材库地址）。 */
  items?: { preview: string, name?: string }[]
  /** 该模型能收几张（1 = 只有首帧；0 = 入口本就不该出现）。 */
  max?: number
  accept?: string
  ariaLabel?: string
  title?: string
  disabled?: boolean
}>(), {
  items: () => [],
  max: 1,
  accept: 'image/png,image/jpeg,image/webp',
  ariaLabel: '添加参考图',
  title: '添加图片',
  disabled: false
})

const emit = defineEmits<{ files: [files: File[]], remove: [index: number] }>()

/** 还能再加几张（0 = 隐藏「+」格子） */
const room = computed(() => Math.max(0, props.max - props.items.length))

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) emit('files', files)
  // 清空 value：选同一张图两次也要能触发 change
  input.value = ''
}
</script>

<template>
  <div class="media-strip">
    <div
      v-for="(item, index) in items"
      :key="`${index}-${item.preview}`"
      class="media-box filled"
      :title="item.name || '参考图'"
    >
      <img
        :src="item.preview"
        :alt="item.name || '参考图'"
      >
      <button
        type="button"
        class="media-box__clear"
        aria-label="移除图片"
        @click.stop="emit('remove', index)"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </div>

    <label
      v-if="room > 0"
      class="media-box"
      :title="max > 1 ? `${title}（还可加 ${room} 张）` : title"
    >
      <input
        type="file"
        :accept="accept"
        :aria-label="ariaLabel"
        :disabled="disabled"
        :multiple="max > 1"
        @change="onChange"
      >
      <UIcon
        name="i-lucide-plus"
        aria-hidden="true"
      />
    </label>

    <span
      v-if="max > 1"
      class="media-strip__count"
      :title="`这个模型最多接受 ${max} 张参考图`"
    >{{ items.length }}/{{ max }}</span>
  </div>
</template>

<style scoped>
.media-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.media-box {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 14px;
  background: rgb(255 255 255 / 5%);
  color: var(--hg3-ink, #f2f0ec);
  font-size: 20px;
  cursor: pointer;
}
.media-box:hover {
  border-color: var(--hg3-accent-line, rgb(217 131 77 / 38%));
}
.media-box input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.media-box img {
  width: 100%;
  height: 100%;
  border-radius: 11px;
  object-fit: cover;
}
.media-box.filled {
  border-color: var(--hg3-accent-line, rgb(217 131 77 / 38%));
}
.media-box__clear {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: rgb(0 0 0 / 62%);
  color: #fff;
  cursor: pointer;
}
.media-strip__count {
  font-size: 12px;
  color: var(--hg-muted, #8b8b8b);
}
</style>
