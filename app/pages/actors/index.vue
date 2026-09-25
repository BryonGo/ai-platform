<script setup lang="ts">
// 平台演员库（/actors）—— 独立的演员页面，不再是「资产」页里的一个页签。
// 来源由地址决定：/actors = 平台，/actors/mine = 我的（旧 /characters* 一律重定向过来）。
useSeoMeta({ title: '演员库 · 后宫' })
</script>

<template>
  <div class="page-body">
    <AssetSectionNav />
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          演员库
        </p>
        <h1>平台演员</h1>
        <p>运营维护的公共演员库：按时代 / 地区 / 身形等标签筛选，收藏或复制为自己的演员。</p>
      </div>
    </div>
    <HgActorLibrary source="platform" />
  </div>
</template>
