<script setup lang="ts">
import type { ComposerMode, UserModelOption } from '~/composables/useModelCatalog'

// 模型选择的桌面容器：popover 里放 HgModelPanel。
// 窄屏时输入器改用底部面板承载同一份内容（见 HgChatComposer）。
const props = defineProps<{
  options: UserModelOption[]
  modelValue: string
  mode: ComposerMode
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const selected = computed(() => props.options.find(item => item.id === props.modelValue))

watch(() => props.mode, () => {
  open.value = false
})
</script>

<template>
  <UPopover
    v-model:open="open"
    :ui="{ content: 'ring-0 bg-transparent shadow-none rounded-2xl' }"
    :content="{ side: 'top', align: 'start', collisionPadding: 12 }"
  >
    <button
      type="button"
      class="hg-chip"
      aria-label="选择模型"
    >
      <img
        v-if="selected?.cover"
        class="chip-cover"
        :src="selected.cover"
        alt=""
      >
      <UIcon
        v-else
        name="i-lucide-box"
        aria-hidden="true"
      />
      <span class="hg-chip-key">模型：</span>
      <span class="chip-name">{{ selected?.name || '待选择' }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="hg-chevron"
        aria-hidden="true"
      />
    </button>

    <template #content>
      <div class="model-pop">
        <HgModelPanel
          :options="options"
          :model-value="modelValue"
          :mode="mode"
          @select="emit('update:modelValue', $event)"
          @close="open = false"
        />
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
/* 模型名可能很长（如「黑兽 Krea2 Aggressive · DBKlein V2 BFS」）：
   截断而不是把后面的工具条与发送按钮挤出去 */
.hg-chip {
  max-width: 240px;
}
.chip-cover {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 5px;
  object-fit: cover;
}
.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-pop {
  width: min(430px, calc(100vw - 24px));
}
</style>
