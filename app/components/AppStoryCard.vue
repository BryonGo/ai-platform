<script setup lang="ts">
// 故事卡片：数据全部来自真实接口，角色名与封面由调用方传入。
defineProps<{
  story: StoryItem
  index: number
  cover?: string
  characterNames?: Record<string, string>
}>()

function names(ids: number[], map?: Record<string, string>) {
  return ids.map(id => map?.[String(id)]).filter(Boolean).join(' · ')
}

function updatedText(ts: number) {
  return ts ? new Date(ts * 1000).toLocaleDateString('zh-CN') : ''
}
</script>

<template>
  <NuxtLink
    :to="`/stories/${story.id}`"
    class="story-card"
  >
    <img
      v-if="cover"
      :src="cover"
      :alt="story.title"
    >
    <div
      v-else
      class="story-cover-placeholder"
      aria-hidden="true"
    >
      <span>{{ story.title.slice(0, 1) }}</span>
    </div>
    <span
      class="story-wash"
      aria-hidden="true"
    />
    <span class="story-index">0{{ index + 1 }}</span>
    <div class="story-info">
      <small>{{ story.clips.length }} 个片段<template v-if="updatedText(story.updatedAt)"> · {{ updatedText(story.updatedAt) }}</template></small>
      <h3>{{ story.title }}</h3>
      <div>
        <span>{{ names(story.characterIds, characterNames) || '未关联角色' }}</span>
      </div>
    </div>
  </NuxtLink>
</template>

<style scoped>
.story-cover-placeholder {
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
