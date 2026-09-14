<script setup lang="ts">
// 输入框左侧的「添加图片」方框（首页与创作页共用）。
//
// 为什么抽出来（2026-09-14 用户反馈）：同一个动作在两个页面是两套交互 ——
// 首页是正文左侧的 + 方框，创作页是工具栏里的「参考图」胶囊。用户在两页之间切换时
// 找不到同一个按钮，所以这里统一成一套，并固定放在**正文之外**：
//   · 空态 = + 号（一眼知道是"加东西"），选中后 = 等比缩略图 + 右上角移除；
//   · 图片不进文字流，鼠标点正文、定位光标都不受图片影响；
//   · 有图时正文一侧加分隔线（见调用方的 .has-media 样式）。
withDefaults(defineProps<{
  /** 已选图片的本地预览地址（空 = 未选）。 */
  preview?: string
  /** 文件名，用于 alt。 */
  name?: string
  accept?: string
  ariaLabel?: string
  title?: string
  disabled?: boolean
}>(), {
  preview: '',
  name: '',
  accept: 'image/png,image/jpeg,image/webp',
  ariaLabel: '添加参考图',
  title: '添加图片',
  disabled: false
})

const emit = defineEmits<{ file: [file: File], clear: [] }>()

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('file', file)
  // 清空 value：选同一张图两次也要能触发 change
  input.value = ''
}
</script>

<template>
  <label
    class="media-box"
    :class="{ filled: !!preview }"
    :title="preview ? '替换图片' : title"
  >
    <input
      type="file"
      :accept="accept"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @change="onChange"
    >
    <img
      v-if="preview"
      :src="preview"
      :alt="name"
    >
    <UIcon
      v-else
      name="i-lucide-plus"
      aria-hidden="true"
    />
    <button
      v-if="preview"
      type="button"
      class="media-box__clear"
      aria-label="移除图片"
      @click.prevent.stop="emit('clear')"
    >
      <UIcon name="i-lucide-x" />
    </button>
  </label>
</template>

<style scoped>
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
</style>
