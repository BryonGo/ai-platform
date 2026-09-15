<script setup lang="ts">
// 参考图缩略图行：**排在输入框上方**，有图才出现。
//
// 为什么和「+」按钮分开（用户反馈）：原来已选图片和「+」挤在同一行左侧，
// 加完图后整条被塞在模式页签与输入框之间，还跟着一起左右移动。
// 现在的分工：
//   ·「+」固定在输入框左侧不动（HgComposerMedia）；
//   · 已加的图在这条独立行里，排在输入框**上方**，每张可单独删；
//   · 发完消息由调用方清空（聊天以后消失）。
withDefaults(defineProps<{
  items?: { preview: string, name?: string }[]
  /** 该模型能收几张（> 1 时显示 N/上限） */
  max?: number
}>(), {
  items: () => [],
  max: 1
})

const emit = defineEmits<{ remove: [index: number] }>()
</script>

<template>
  <div
    v-if="items.length"
    class="ref-strip"
  >
    <div
      v-for="(item, index) in items"
      :key="`${index}-${item.preview}`"
      class="ref-thumb"
      :title="item.name || '参考图'"
    >
      <img
        :src="item.preview"
        :alt="item.name || '参考图'"
      >
      <button
        type="button"
        class="ref-thumb__clear"
        aria-label="移除这张参考图"
        @click.stop="emit('remove', index)"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </div>
    <span
      v-if="max > 1"
      class="ref-strip__count"
      :title="`这个模型最多接受 ${max} 张参考图`"
    >{{ items.length }}/{{ max }}</span>
  </div>
</template>

<style scoped>
.ref-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.ref-thumb {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border: 1px solid var(--hg3-accent-line, rgb(217 131 77 / 38%));
  border-radius: 14px;
  background: rgb(255 255 255 / 5%);
}
.ref-thumb img {
  width: 100%;
  height: 100%;
  border-radius: 13px;
  object-fit: cover;
}
.ref-thumb__clear {
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
.ref-strip__count {
  font-size: 12px;
  color: var(--hg-muted, #8b8b8b);
}
</style>
