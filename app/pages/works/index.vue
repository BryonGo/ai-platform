<script setup lang="ts">
import { works } from '~/composables/useHougong'
import AppWorkCard from '~/components/AppWorkCard.vue'

const filter = ref<'全部' | '视频' | '图集'>('全部')
const filters = ['全部', '视频', '图集'] as const

const filtered = computed(() =>
  filter.value === '全部' ? works : works.filter(w => w.kind === filter.value)
)
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          作品库
        </p>
        <h1>你的影像作品</h1>
        <p>图片与视频自动入库，可继续创作同一故事。</p>
      </div>
      <NuxtLink
        to="/create"
        class="btn-primary"
      >+ 创作</NuxtLink>
    </div>

    <div
      class="filters"
      role="tablist"
      aria-label="作品筛选"
    >
      <button
        v-for="f in filters"
        :key="f"
        type="button"
        role="tab"
        class="filter-btn"
        :class="{ active: filter === f }"
        @click="filter = f"
      >
        {{ f }}
      </button>
    </div>

    <div class="story-grid">
      <AppWorkCard
        v-for="(w, i) in filtered"
        :key="w.id"
        :work="w"
        :index="i"
      />
    </div>
  </div>
</template>
