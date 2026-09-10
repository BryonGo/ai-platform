<script setup lang="ts">
// 展示型卡片：角色信息由调用方传入（真实接口的角色名/头像）。
export interface WorkCardItem {
  id: string | number
  title: string
  characterId: string | number
  kind: string
  meta?: string
  image?: string
  tone?: string
  recommended?: boolean
  status?: string
}

defineProps<{
  work: WorkCardItem
  index: number
  characterName?: string
  characterImage?: string
}>()
</script>

<template>
  <NuxtLink
    :to="`/works/${work.id}`"
    class="story-card"
  >
    <img
      v-if="work.image"
      :src="work.image"
      :alt="work.title"
    >
    <div
      v-else
      class="work-placeholder"
      aria-hidden="true"
    >
      <span>{{ work.title.slice(0, 1) }}</span>
    </div>
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
      <small>{{ work.kind }}<template v-if="work.meta"> · {{ work.meta }}</template></small>
      <h3>{{ work.title }}</h3>
      <div>
        <template v-if="characterName">
          <img
            v-if="characterImage"
            :src="characterImage"
            :alt="characterName"
          >
          <span>{{ characterName }}</span>
        </template><span
          v-else
          class="story-role-fallback"
        >角色 {{ String(work.characterId).slice(-4) }}</span>
      </div>
    </div>
  </NuxtLink>
</template>

<style scoped>
.work-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: linear-gradient(160deg, #26272c, #17181b);
  color: var(--amber-soft);
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 800;
}
</style>
