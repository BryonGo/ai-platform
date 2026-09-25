<script setup lang="ts">
// 生成 run 详情（/actors/mine/:id/generation/:runId）—— 与我的演员详情同一个页面组件，
// 只是详情页会优先按地址里的 runId 载入那一次运行（无 runId 时用最近一次）。
// 这样某次生成可以刷新/分享/后退。
import MyActorDetail from '../index.vue'
</script>

<template>
  <MyActorDetail />
</template>
