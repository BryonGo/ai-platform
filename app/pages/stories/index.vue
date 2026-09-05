<script setup lang="ts">
import { stories } from '~/composables/useHougong'
import AppStoryCard from '~/components/AppStoryCard.vue'
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          故事项目
        </p>
        <h1>把作品排成一条连续的故事线</h1>
        <p>角色与作品按项目归组，记录关系与场景设定，片段顺序只影响叙事，不覆盖作品本体。</p>
      </div>
      <NuxtLink
        to="/create"
        class="btn-primary"
      >+ 新建故事</NuxtLink>
    </div>

    <div class="story-grid">
      <AppStoryCard
        v-for="(s, i) in stories"
        :key="s.id"
        :story="s"
        :index="i"
      />
    </div>
  </div>
</template>
