<script setup lang="ts">
import { FEATURES } from '~/config/features'

const route = useRoute()
// 分区导航。角色资产按 FEATURES.characterAssets 决定是否出现：入口撤下、功能保留
// （直接访问 /characters 仍可用，详见 config/features.ts）。
// 第三个分区统一叫「我的发布」—— 侧栏、面包屑、这里原先是三套叫法（作品/探索/我的发布）。
const sections = [
  { to: '/assets', label: '素材', icon: 'i-lucide-images' },
  { to: '/characters', label: '角色资产', icon: 'i-lucide-user-round', feature: 'characterAssets' as const },
  { to: '/works', label: '我的发布', icon: 'i-lucide-film' }
].filter(item => !item.feature || FEATURES[item.feature])
</script>

<template>
  <nav
    class="asset-section-nav"
    aria-label="资产分类"
  >
    <NuxtLink
      v-for="section in sections"
      :key="section.to"
      :to="section.to"
      :aria-current="route.path === section.to || route.path.startsWith(`${section.to}/`) ? 'page' : undefined"
    >
      <UIcon :name="section.icon" />
      {{ section.label }}
    </NuxtLink>
  </nav>
</template>

<style scoped>
.asset-section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--hg-line);
}
.asset-section-nav a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  color: var(--hg-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}
.asset-section-nav a[aria-current='page'] {
  color: var(--ink);
  border-bottom-color: var(--hg-accent);
}
</style>
