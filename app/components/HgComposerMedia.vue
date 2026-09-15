<script setup lang="ts">
// 输入框左侧的「+ 添加图片」方框（首页与创作页共用）。
//
// 为什么抽出来（2026-09-14 用户反馈）：同一个动作在两个页面是两套交互 ——
// 首页是正文左侧的 + 方框，创作页是工具栏里的「参考图」胶囊。用户在两页之间切换时
// 找不到同一个按钮，所以这里统一成一套，并固定放在**正文之外**。
//
// 职责边界（2026-09-15 调整）：
//   · 本组件只管「+」这个入口，**位置固定不动**；
//   · 已选的图由 HgReferenceStrip 单独一行排在输入框**上方**（用户反馈：
//     图跟着 + 一起挤在模式页签与输入框之间，加一张还整体左右移动）；
//   · 到该模型的张数上限后「+」**禁用**而不是消失，位置保持稳定；
//   · 图片不进文字流，鼠标点正文、定位光标都不受图片影响。
withDefaults(defineProps<{
  /** 该模型能收几张（1 = 只有首帧；> 1 时允许一次多选）。 */
  max?: number
  accept?: string
  ariaLabel?: string
  title?: string
  disabled?: boolean
}>(), {
  max: 1,
  accept: 'image/png,image/jpeg,image/webp',
  ariaLabel: '添加参考图',
  title: '添加图片',
  disabled: false
})

const emit = defineEmits<{ files: [files: File[]] }>()

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) emit('files', files)
  // 清空 value：选同一张图两次也要能触发 change
  input.value = ''
}
</script>

<template>
  <label
    class="media-box"
    :class="{ disabled }"
    :title="title"
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
.media-box.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.media-box input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
</style>
