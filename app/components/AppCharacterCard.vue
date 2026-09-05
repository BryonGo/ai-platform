<script setup lang="ts">
import type { Character } from '~/composables/useHougong'

defineProps<{
  character: Character
  index: number
}>()
</script>

<template>
  <NuxtLink
    :to="`/characters/${character.id}`"
    class="story-card character-card"
  >
    <img
      :src="character.image"
      :alt="character.name"
    >
    <span
      class="story-wash"
      aria-hidden="true"
    />
    <span class="story-index">0{{ index + 1 }}</span>
    <div class="story-info character-info">
      <small>{{ character.age }}</small>
      <h3>{{ character.name }}</h3>
      <div><span>{{ character.alias }} · {{ character.workCount }} 部作品</span></div>
    </div>
  </NuxtLink>
</template>

<style scoped>
.character-card {
  display: block;
  text-decoration: none;
}
.character-info h3 {
  font-size: clamp(20px, 1.6vw, 26px);
}
</style>
