<script setup lang="ts">
// 画布图（/canvas/:graphId）—— 与 /canvas 同一个画布组件，图 id 由地址决定。
// 旧的 /canvas?id=<id> 会在 canvas/index.vue 的 setup 里 301 到这里。
import CanvasWorkbench from './index.vue'
</script>

<template>
  <CanvasWorkbench />
</template>
