<script setup lang="ts">
// 全部工具（/effects）。
//
// 列表由后端目录驱动（GET /hougong/tools）：运营在后台停用工具后这里立刻消失，
// 不需要发版；新增工具也不用改前端。目录为空时给明确空态，而不是回落到写死的假数据。
useSeoMeta({ title: '全部工具 · 后宫' })

const catalog = useToolCatalog()
const category = ref('all')
const search = ref('')

const categories = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'enhance', label: '增强' }
]

const filteredTools = computed(() => {
  const list = catalog.byCategory(category.value)
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(t => `${t.name} ${t.summary} ${t.code}`.toLowerCase().includes(q))
})

onMounted(() => {
  catalog.ensure()
})
</script>

<template>
  <div class="page-body effects-page">
    <div class="page-head">
      <h1>全部工具</h1>
      <label class="effect-search">
        <UIcon name="i-lucide-search" />
        <input
          v-model="search"
          type="search"
          placeholder="搜索工具"
          aria-label="搜索工具"
        >
      </label>
    </div>
    <div
      class="effect-categories"
      role="group"
      aria-label="工具分类"
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
        v-for="tool in filteredTools"
        :key="tool.code"
        :to="`/tool/${tool.code}`"
        class="effect-card"
      >
        <div class="effect-media">
          <img
            src="/images/daji-three-tail-front-v1.webp"
            alt=""
            loading="lazy"
          >
          <span class="effect-kind"><UIcon :name="tool.icon || 'i-lucide-sparkles'" />{{ tool.name }}</span>
          <span
            v-if="tool.templates.length"
            class="effect-count"
          >{{ tool.templates.length }} 个模板</span>
        </div>
        <div class="effect-name">
          <div class="effect-text">
            <h2>{{ tool.name }}</h2>
            <p v-if="tool.summary">
              {{ tool.summary }}
            </p>
          </div>
          <UIcon name="i-lucide-arrow-up-right" />
        </div>
      </NuxtLink>
    </div>
    <p
      v-if="catalog.loading.value && !catalog.tools.value.length"
      role="status"
      class="empty-tip"
    >
      正在加载工具…
    </p>
    <p
      v-else-if="!filteredTools.length"
      role="status"
      class="empty-tip"
    >
      <template v-if="!catalog.tools.value.length">
        本站还没有开放任何工具（可在后台「平台运营 → 创作工具」里添加并启用）。
      </template>
      <template v-else>
        没有匹配的工具
      </template>
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
.effect-media img { display: block; width: 100%; height: 100%; object-fit: contain; opacity: 0.35; }
.effect-kind { position: absolute; bottom: 12px; left: 12px; display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 4px; background: #151517; font-size: 12px; }
.effect-count { position: absolute; top: 12px; right: 12px; padding: 4px 8px; border-radius: 4px; background: #151517cc; font-size: 12px; color: var(--hg-muted); }
.effect-name { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px; }
.effect-text { min-width: 0; }
.effect-name h2 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.effect-name p { margin: 6px 0 0; font-size: 13px; line-height: 1.5; color: var(--hg-muted); }
.effect-name > span, .effect-name > svg { flex-shrink: 0; }
@media (max-width: 600px) {
  .page-head { align-items: stretch; }
  .effect-search { width: 100%; }
}
</style>
