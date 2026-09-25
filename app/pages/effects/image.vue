<script setup lang="ts">
// 图片效果（/effects/image）—— 与 /effects 同一个页面组件，只是分类由地址决定。
// 复用而不是复制：`useRoute().path` 在组件内部取，所以这里不需要传参。
import EffectsPage from './index.vue'
</script>

<template>
  <EffectsPage />
</template>
