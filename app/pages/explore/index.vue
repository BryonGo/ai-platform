<script setup lang="ts">
// 探索流（/explore）—— 默认「推荐」。分类是独立地址（/explore/:category）。
useSeoMeta({ title: '探索 · 后宫' })
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          发现
        </p>
        <h1>探索</h1>
        <p>全站已发布的作品；按分类筛选，点分类会换地址，可刷新 / 分享 / 后退。</p>
      </div>
    </div>
    <HgExploreFeed
      category="推荐"
      guest-hint
    />
  </div>
</template>
