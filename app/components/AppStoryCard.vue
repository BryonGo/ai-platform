<script setup lang="ts">
import { characterOf, type Story } from '~/composables/useHougong'

defineProps<{
  story: Story
  index: number
}>()
</script>

<template>
  <NuxtLink
    :to="`/stories/${story.id}`"
    class="story-card"
  >
    <img
      :src="story.cover"
      :alt="story.title"
    >
    <span
      class="story-wash"
      aria-hidden="true"
    />
    <span class="story-index">0{{ index + 1 }}</span>
    <div class="story-info">
      <small>{{ story.clips.length }} 个片段 · {{ story.updatedAt }}</small>
      <h3>{{ story.title }}</h3>
      <div>
        <img
          v-for="cid in story.characterIds.slice(0, 2)"
          :key="cid"
          :src="characterOf(cid)?.image"
          :alt="characterOf(cid)?.name"
        >
        <span>{{ story.characterIds.map(cid => characterOf(cid)?.name).join(' · ') }}</span>
      </div>
    </div>
  </NuxtLink>
</template>
