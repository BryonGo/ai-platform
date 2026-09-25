<script setup lang="ts">
// 我的演员（/actors/mine）—— 自建与从平台复制的演员，独立地址，刷新/分享/后退都保持。
// 旧的 /characters 列表永久重定向到这里。
useSeoMeta({ title: '我的演员 · 后宫' })
</script>

<template>
  <div class="page-body">
    <AssetSectionNav />
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          演员库
        </p>
        <h1>我的演员</h1>
        <p>自建与从平台复制的演员，默认<b>私有</b>，只有你自己能用。</p>
      </div>
    </div>
    <HgActorLibrary source="mine" />
  </div>
</template>
