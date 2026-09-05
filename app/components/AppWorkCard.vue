<script setup lang="ts">
import { characterOf, type Work } from '~/composables/useHougong'

defineProps<{
  work: Work
  index: number
}>()
</script>

<template>
  <NuxtLink
    :to="`/works/${work.id}`"
    class="story-card"
  >
    <img
      :src="work.image"
      :alt="work.title"
    >
    <span
      class="story-wash"
      aria-hidden="true"
    />
    <span class="story-index">0{{ index + 1 }}</span>
    <span
      v-if="work.status === 'running'"
      class="status-pill"
    >生成中</span>
    <span
      v-else-if="work.recommended"
      class="story-recommended"
    >推荐</span>
    <div class="story-info">
      <small>{{ work.kind }} · {{ work.meta }}</small>
      <h3>{{ work.title }}</h3>
      <div>
        <img
          :src="characterOf(work.characterId)?.image"
          :alt="characterOf(work.characterId)?.name"
        >
        <span>{{ characterOf(work.characterId)?.name }}</span>
      </div>
    </div>
  </NuxtLink>
</template>
