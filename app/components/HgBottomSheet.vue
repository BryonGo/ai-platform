<script setup lang="ts">
// 移动端底部面板容器：同一个面板内容在窄屏以 sheet 呈现，可滚动、可关闭、保留选择。
const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(defineProps<{ title?: string }>(), { title: '' })

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) close()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="sheet-mask"
      @click.self="close"
    >
      <section
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="props.title || '选项面板'"
      >
        <header>
          <span
            class="grabber"
            aria-hidden="true"
          />
          <strong>{{ props.title }}</strong>
          <button
            type="button"
            aria-label="关闭面板"
            @click="close"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </header>
        <div class="sheet-body">
          <slot />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 88;
  display: flex;
  align-items: flex-end;
  background: rgb(6 7 9 / 62%);
}
.sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 82dvh;
  /* 避开手机底部安全区 */
  padding-bottom: env(safe-area-inset-bottom, 0);
  border-radius: 18px 18px 0 0;
  background: #1c1d21;
  color: var(--hg3-ink, #f2f0ec);
  box-shadow: 0 -16px 50px #000a;
}
.sheet header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 10px;
}
.sheet header strong {
  font-size: 15px;
}
.sheet header button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted, #9a9791);
  cursor: pointer;
}
.grabber {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgb(255 255 255 / 18%);
  transform: translateX(-50%);
}
.sheet-body {
  flex: 1;
  min-height: 0;
  padding: 0 14px 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
</style>
