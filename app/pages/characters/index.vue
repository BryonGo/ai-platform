<script setup lang="ts">
// 旧「角色资产」列表已迁移到 /actors/mine（演员新命名空间）。这里只做重定向，不再维护第二套列表。
await navigateTo('/actors/mine', { redirectCode: 301 })
</script>

<template>
  <div />
</template>
