<script setup lang="ts">
// 作品完整预览。
//
// 首页设计说明第 6.2 节：完整预览保留原始宽高比、完整显示，
// 留边优先于拉伸或裁掉内容（列表封面才允许中心裁切）。
const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(defineProps<{
  src?: string
  title?: string
  author?: string
  /** 视频预览用：未完成时不允许播放假 URL（指南第 6 条） */
  kind?: 'image' | 'video'
}>(), { src: '', title: '', author: '', kind: 'image' })

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
      class="hg-preview-mask"
      @click.self="close"
    >
      <figure
        class="hg-preview"
        role="dialog"
        aria-modal="true"
        :aria-label="`${props.title || '作品'}完整预览`"
      >
        <header>
          <div class="meta">
            <strong>{{ props.title || '作品预览' }}</strong>
            <small v-if="props.author">{{ props.author }}</small>
          </div>
          <div class="tools">
            <a
              v-if="props.src"
              class="hg-icon-btn"
              :href="props.src"
              download
              aria-label="下载原图"
            >
              <UIcon name="i-lucide-download" />
            </a>
            <button
              type="button"
              class="hg-icon-btn"
              aria-label="关闭预览"
              @click="close"
            >
              <UIcon name="i-lucide-x" />
            </button>
          </div>
        </header>

        <div class="stage">
          <img
            v-if="props.src"
            :src="props.src"
            :alt="props.title"
          >
          <p
            v-else
            class="stage-empty"
          >
            该作品暂无可预览的产物。
          </p>
        </div>

        <figcaption>
          完整预览保留原始宽高比，不做拉伸或裁切。
        </figcaption>
      </figure>
    </div>
  </Teleport>
</template>

<style scoped>
.hg-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(6 7 9 / 82%);
  backdrop-filter: blur(4px);
}
.hg-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(980px, 100%);
  max-height: calc(100dvh - 48px);
  margin: 0;
  color: var(--hg3-ink, #f2f0ec);
}
.hg-preview header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.hg-preview .meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.hg-preview .meta strong {
  font-size: 15px;
}
.hg-preview .meta small {
  color: var(--hg3-muted, #9a9791);
  font-size: 12px;
}
.hg-preview .tools {
  display: flex;
  gap: 6px;
}
.hg-preview .hg-icon-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  color: inherit;
  cursor: pointer;
}
.hg-preview .hg-icon-btn:hover {
  background: rgb(255 255 255 / 12%);
}
.hg-preview .stage {
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  overflow: hidden;
  border-radius: 14px;
  background: #0b0c0e;
}
.hg-preview .stage img {
  display: block;
  max-width: 100%;
  max-height: calc(100dvh - 160px);
  object-fit: contain;
}
.stage-empty {
  padding: 40px;
  color: var(--hg3-faint, #6e6b66);
  font-size: 13px;
}
.hg-preview figcaption {
  color: var(--hg3-faint, #6e6b66);
  font-size: 11px;
  text-align: center;
}
</style>
