<script setup lang="ts">
// 结构属性：同时兼容 mock Character（useHougong）与真实 API CharacterItem（无封面字段）。
// 后端角色暂无封面资产域，image 缺省时展示首字符占位。
export interface CharacterCardItem {
  id: string | number
  name: string
  alias: string
  age: string
  image?: string
  workCount: number
}

defineProps<{
  character: CharacterCardItem
  index: number
}>()
</script>

<template>
  <NuxtLink
    :to="`/characters/${character.id}`"
    class="story-card character-card"
  >
    <img
      v-if="character.image"
      :src="character.image"
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
  background: linear-gradient(160deg, #f3e3c0, #e9d5b0);
  color: #8a6a35;
  font-size: clamp(40px, 6vw, 72px);
  font-weight: 800;
}
.character-info h3 {
  font-size: clamp(20px, 1.6vw, 26px);
}
</style>
