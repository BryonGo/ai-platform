<script setup lang="ts">
// 平台演员详情页（/actors/:id）。逻辑都在 HgActorDetail 组件里，这页只做路由取值与外壳。
const route = useRoute()
const id = computed(() => String(route.params.id))

useSeoMeta({ title: '演员 · 后宫' })
</script>

<template>
  <div class="page-body">
    <AssetSectionNav />
    <p class="detail-kicker">
      演员库
    </p>
    <HgActorDetail :id="id" />
  </div>
</template>
