<script setup lang="ts">
// 旧「新建角色」已迁移到 /actors/new。这里只做重定向。
await navigateTo('/actors/new', { redirectCode: 301 })
</script>

<template>
  <div />
</template>
