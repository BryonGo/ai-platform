<script setup lang="ts">
// 旧「我的角色详情」已迁移到 /actors/mine/:id。这里只做重定向（保留 id）。
const route = useRoute()
await navigateTo(`/actors/mine/${encodeURIComponent(String(route.params.id))}`, { redirectCode: 301 })
</script>

<template>
  <div />
</template>
