<script setup lang="ts">
// 探索流分类（/explore/:category）—— 分类即地址，刷新 / 分享 / 后退都保持。
import { exploreLabelOf, isExploreSlug } from '~/utils/routes'

const route = useRoute()
const slug = computed(() => String(route.params.category || ''))

// 非法分类不产生死链：回「推荐」的规范地址。
if (!isExploreSlug(slug.value)) {
  await navigateTo('/explore', { redirectCode: 301 })
}

const category = computed(() => exploreLabelOf(slug.value))

useSeoMeta({ title: () => `${category.value} · 探索 · 后宫` })
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          发现
        </p>
        <h1>探索 · {{ category }}</h1>
        <p>全站已发布的作品；按分类筛选，点分类会换地址，可刷新 / 分享 / 后退。</p>
      </div>
    </div>
    <HgExploreFeed
      :category="category"
      guest-hint
    />
  </div>
</template>
