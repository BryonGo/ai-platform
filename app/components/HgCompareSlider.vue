<script setup lang="ts">
// 原图 / 效果对比滑块。
//
// 首页设计说明第 8 条与第 6.3 节：两层必须是**同一画面坐标**，靠可拖动蒙版揭示，
// 不能把两张缩小肖像并排冒充滑动对比。实现上用 clip-path 裁切整幅同尺寸图层，
// 因此两层像素级对齐（拖动时画面不会位移）。
//
// 触摸与键盘都要可达：手机没有 hover，指针拖动之外还支持 ←/→（Shift 加速）、Home/End。
const props = withDefaults(defineProps<{
  before: string
  after: string
  alt?: string
  label?: string
  /** 初始揭示比例（%），默认从中间开始 */
  initial?: number
}>(), { alt: '', label: '原图与效果对比', initial: 50 })

const value = ref(props.initial)
const rootRef = ref<HTMLElement | null>(null)
let dragging = false

function setFromClientX(clientX: number) {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect?.width) return
  value.value = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
}

function onPointerDown(event: PointerEvent) {
  dragging = true
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  setFromClientX(event.clientX)
}
function onPointerMove(event: PointerEvent) {
  if (dragging) setFromClientX(event.clientX)
}
function onPointerUp(event: PointerEvent) {
  dragging = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
}

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 10 : 2
  if (event.key === 'ArrowLeft') value.value = Math.max(0, value.value - step)
  else if (event.key === 'ArrowRight') value.value = Math.min(100, value.value + step)
  else if (event.key === 'Home') value.value = 0
  else if (event.key === 'End') value.value = 100
  else return
  event.preventDefault()
}
</script>

<template>
  <div
    ref="rootRef"
    class="hg-compare"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <img
      class="layer"
      :src="after"
      :alt="alt"
    >
    <div
      class="layer clip"
      :style="{ clipPath: `inset(0 ${100 - value}% 0 0)` }"
    >
      <img
        class="layer"
        :src="before"
        alt=""
      >
    </div>

    <span class="tag tag-before">原图</span>
    <span class="tag tag-after">效果</span>

    <div
      class="handle"
      :style="{ left: `${value}%` }"
      role="slider"
      tabindex="0"
      :aria-label="label"
      :aria-valuenow="Math.round(value)"
      aria-valuemin="0"
      aria-valuemax="100"
      @keydown="onKeydown"
    >
      <span class="knob">
        <UIcon
          name="i-lucide-chevrons-left-right"
          aria-hidden="true"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
.hg-compare {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: pan-y;
  cursor: ew-resize;
  user-select: none;
}
.layer {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 0%;
}
.clip {
  position: absolute;
  inset: 0;
}
.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgb(255 255 255 / 88%);
  transform: translateX(-1px);
}
.handle:focus-visible {
  outline: none;
}
.handle:focus-visible .knob {
  box-shadow: 0 0 0 3px var(--hg3-accent-soft, rgb(217 131 77 / 14%));
}
.knob {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 2px solid rgb(255 255 255 / 88%);
  border-radius: 999px;
  background: rgb(10 11 13 / 72%);
  color: #fff;
  transform: translate(-50%, -50%);
}
.tag {
  position: absolute;
  bottom: 8px;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgb(10 11 13 / 66%);
  color: #fff;
  font-size: 10px;
  pointer-events: none;
}
.tag-before {
  left: 8px;
}
.tag-after {
  right: 8px;
}
</style>
