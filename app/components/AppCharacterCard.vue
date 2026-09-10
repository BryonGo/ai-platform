<script setup lang="ts">
// 角色卡片：封面取后端返回的 coverUrl（该角色最近一部作品的产物），无作品时用首字占位。
export interface CharacterCardItem {
  id: string | number
  name: string
  alias: string
  age: string
  image?: string
  coverUrl?: string
  workCount: number
}

const props = defineProps<{
  character: CharacterCardItem
  index: number
}>()

const cover = computed(() => props.character.coverUrl || props.character.image || '')
</script>

<template>
  <NuxtLink
    :to="`/characters/${character.id}`"
    class="story-card character-card"
  >
    <img
      v-if="cover"
      :src="cover"
      :alt="character.name"
    >
    <div
      v-else
      class="character-placeholder"
      aria-hidden="true"
    >
      <span>{{ character.name.slice(0, 1) }}</span>
    </div>
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
.character-card > img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
}
.character-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(160deg, #26272c, #17181b);
  color: var(--amber-soft);
  font-size: clamp(40px, 6vw, 72px);
  font-weight: 800;
}
.character-info h3 {
  font-size: clamp(20px, 1.6vw, 26px);
}
</style>
