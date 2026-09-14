<script setup lang="ts">
// 按宽高比画一个矩形，替代原来的"横/竖/方"三选一图标。
//
// 为什么不用 lucide：monitor / smartphone / square 只能表达"横竖方"三档，
// 而真实选项里有 21:9、16:9、3:2、4:3、1:1、3:4、2:3、9:16、4:5、5:4 十种。
// 21:9 和 4:3 原来挂的是同一个 monitor 图标，用户只能靠读数字分辨 —— 这个图标
// 就是为了让他不用读数字。
//
// 直接由比例字符串算矩形，所以后台给模型配任意新比例都能正确画出来，不需要维护映射表。
const props = withDefaults(defineProps<{
  /** 形如 "16:9"；解析不出来时按 1:1 画 */
  ratio: string
  /** 图标边长（px），矩形按这个尺寸等比缩放 */
  size?: number
}>(), { size: 26 })

/** 画布固定 26×26，矩形按比例居中放进 18×18 的内容区。 */
const BOX = 26
const INNER = 18

const rect = computed(() => {
  const parts = String(props.ratio || '').split(':')
  const w = Number(parts[0])
  const h = Number(parts[1])
  if (!w || !h || w <= 0 || h <= 0) return { w: INNER, h: INNER, x: 4, y: 4 }
  const scale = INNER / Math.max(w, h)
  // 下限 4px：1:8 / 8:1 这类极端比例也要能看见一个形状，不能细成一条线
  const rw = Math.max(4, Math.round(w * scale))
  const rh = Math.max(4, Math.round(h * scale))
  return { w: rw, h: rh, x: (BOX - rw) / 2, y: (BOX - rh) / 2 }
})

/** 圆角跟着短边走：21:9 那种扁矩形用固定圆角会变成胶囊，看不出是矩形。 */
const radius = computed(() => Math.min(2.5, rect.value.h / 4, rect.value.w / 4))
</script>

<template>
  <svg
    class="ratio-icon"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${BOX} ${BOX}`"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      :x="rect.x"
      :y="rect.y"
      :width="rect.w"
      :height="rect.h"
      :rx="radius"
      :ry="radius"
    />
  </svg>
</template>

<style scoped>
.ratio-icon {
  display: block;
  flex: 0 0 auto;
}
.ratio-icon rect {
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.6;
  /* 让细长矩形的描边看起来和方形的粗细一致 */
  vector-effect: non-scaling-stroke;
}
</style>
