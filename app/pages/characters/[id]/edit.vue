<script setup lang="ts">
// 旧「我的角色编辑」已迁移到 /actors/mine/:id/edit。这里只做重定向（保留 id）。
const route = useRoute()
await navigateTo(`/actors/mine/${encodeURIComponent(String(route.params.id))}/edit`, { redirectCode: 301 })
</script>

<template>
  <div />
</template>
