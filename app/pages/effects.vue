<script setup lang="ts">
useSeoMeta({ title: '全部效果 · 后宫' })

const category = ref('all')
const search = ref('')
const categories = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' }
]
// 仅连接已经存在的创作模式，不在入口层选择模型或创建任务。
const effects = [
  { id: 'image', title: '图片创作', kind: 'image', label: '图片', icon: 'i-lucide-image', tags: '文生图 图生图 图片编辑', to: '/create?mode=image' },
  { id: 'first-frame', title: '首帧图生视频', kind: 'video', label: '视频', icon: 'i-lucide-video', tags: '首帧 图生视频', to: '/create?mode=video' }
]
const filteredEffects = computed(() => effects.filter(effect =>
  (category.value === 'all' || effect.kind === category.value)
  && `${effect.title} ${effect.tags}`.includes(search.value.trim())
))
</script>

<template>
  <div class="page-body effects-page">
    <div class="page-head">
      <h1>全部效果</h1>
      <label class="effect-search">
        <UIcon name="i-lucide-search" />
        <input
          v-model="search"
          type="search"
          placeholder="搜索效果"
          aria-label="搜索效果"
        >
      </label>
    </div>
    <div
      class="effect-categories"
      role="group"
      aria-label="效果分类"
    >
      <button
        v-for="item in categories"
        :key="item.value"
        type="button"
        :aria-pressed="category === item.value"
        @click="category = item.value"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="effects-grid">
      <NuxtLink
        v-for="effect in filteredEffects"
        :key="effect.id"
        :to="effect.to"
        class="effect-card"
      >
        <div class="effect-media">
          <img
            src="/images/daji-three-tail-front-v1.webp"
            alt="角色素材"
            loading="lazy"
          >
          <span class="effect-kind"><UIcon :name="effect.icon" />{{ effect.label }}</span>
        </div>
        <div class="effect-name">
          <h2>{{ effect.title }}</h2>
          <UIcon name="i-lucide-arrow-up-right" />
        </div>
      </NuxtLink>
    </div>
    <p
      v-if="!filteredEffects.length"
      role="status"
      class="empty-tip"
    >
      没有匹配的效果
    </p>
  </div>
</template>

<style scoped>
.effects-page { max-width: 1200px; }
.effect-search { display: flex; align-items: center; gap: 8px; width: 280px; max-width: 100%; padding: 10px 12px; border: 1px solid var(--hg-line); border-radius: 6px; }
.effect-search input { width: 100%; min-width: 0; border: 0; background: transparent; color: var(--ink); font: inherit; }
.effect-categories { display: flex; gap: 4px; margin: 20px 0; border-bottom: 1px solid var(--hg-line); }
.effect-categories button { padding: 12px 20px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--hg-muted); cursor: pointer; }
.effect-categories button[aria-pressed='true'] { color: var(--ink); border-bottom-color: var(--hg-accent); }
.effects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 20px; }
.effect-card { min-width: 0; overflow: hidden; border: 1px solid var(--hg-line); border-radius: 8px; background: var(--hg-card); color: var(--ink); text-decoration: none; }
.effect-card:hover { border-color: var(--hg-muted); }
.effect-media { position: relative; aspect-ratio: 4 / 3; background: #141416; }
.effect-media img { display: block; width: 100%; height: 100%; object-fit: contain; }
.effect-kind { position: absolute; bottom: 12px; left: 12px; display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 4px; background: #151517; font-size: 12px; }
.effect-name { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; }
.effect-name h2 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.effect-name > span { flex-shrink: 0; }
@media (max-width: 600px) {
  .page-head { align-items: stretch; }
  .effect-search { width: 100%; }
}
</style>
