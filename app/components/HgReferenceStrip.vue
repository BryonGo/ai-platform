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
  /**
   * 每张图的角色标注，与 items 同序；空数组则不显示。
   *
   * 视频多参下第 1 张是首帧、其余是 ref_image_0/1/2…，两者语义完全不同。
   * 不标出来的话，用户加了 3 张图没人知道哪张在管什么，
   * 出图不对时也分不清是"没生效"还是"自己理解错了角色"。
   */
  roles?: string[]
}>(), {
  items: () => [],
  max: 1,
  roles: () => []
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
      <span
        v-if="roles[index]"
        class="ref-thumb__role"
      >{{ roles[index] }}</span>
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
/* 角色角标压在缩略图下沿：图片本身要保持可辨认，所以用小字 + 半透明底，
   不做整块遮罩（遮挡会让人认不出是哪张图，反而更难核对）。 */
.ref-thumb__role {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1px 0 2px;
  border-radius: 0 0 13px 13px;
  background: rgb(0 0 0 / 58%);
  color: #fff;
  font-size: 10px;
  line-height: 1.4;
  text-align: center;
}
.ref-strip__count {
  font-size: 12px;
  color: var(--hg-muted, #8b8b8b);
}
</style>
