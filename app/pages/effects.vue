<script setup lang="ts">
// 全部效果（/effects）—— 布局对着参考站 undress.xxx 的 All Effects 页做的：
// 顶部一条「新功能」提示 → 大横幅（标题 + 开始使用 + 三个小标签）→ 横排精选
// → 「视频效果 N / 图像效果 N」+ 搜索 → 标签行 → 五列竖版卡片（缩略图 + 角标 + 名称在下方）。
//
// 数据仍然全部来自后端目录（GET /hougong/tools）：运营在后台停用工具，这里立刻消失；
// 封面图与角标也在后台填（没填就用图标兜底，不留空框）。
useSeoMeta({ title: '全部效果 · 后宫' })

const catalog = useToolCatalog()
const tab = ref<'image' | 'video'>('image')
const search = ref('')
const activeTag = ref('all')

const tools = computed(() => catalog.tools.value)

/** 一个"效果"= 工具本身，或它下面的一个玩法（玩法卡点进去会带上该玩法）。
 *  参考站的 All Effects 就是这个粒度：裸体姿势、大字型、深喉 各占一张卡。 */
interface EffectCard {
  key: string
  code: string
  template?: string
  name: string
  summary: string
  icon: string
  cover?: string
  badge?: string
  category: string
  templateCount: number
}

const effects = computed<EffectCard[]>(() => {
  const out: EffectCard[] = []
  for (const t of tools.value) {
    const base = {
      code: t.code, icon: t.icon, cover: t.cover, badge: t.badge,
      category: t.category, templateCount: (t.templates || []).length
    }
    out.push({ ...base, key: t.code, name: t.name, summary: t.summary })
    for (const tpl of t.templates || []) {
      out.push({
        ...base, key: `${t.code}:${tpl.code}`, template: tpl.code,
        name: tpl.name, summary: tpl.summary || t.summary
      })
    }
  }
  return out
})

/** 横幅按钮指向第一个可用工具（没有工具时按钮不渲染）。 */
const firstTool = computed(() => effects.value[0])

/** 角标为空的工具也需要展示，这里只取「有角标或排在前面的」做横排精选。 */
const strip = computed(() => {
  const withBadge = effects.value.filter(e => e.badge)
  const rest = effects.value.filter(e => !e.badge)
  return [...withBadge, ...rest].slice(0, 5)
})

const counts = computed(() => ({
  image: effects.value.filter(e => e.category !== 'video').length,
  video: effects.value.filter(e => e.category === 'video').length
}))

/** 标签行：全部 + 角标（新品/热门…）+ 模板名（点一下筛出带该模板的工具）。 */
const tagList = computed(() => {
  const badges = [...new Set(tools.value.map(t => t.badge).filter(Boolean))] as string[]
  // 标签行给"玩法"用：只显示各工具的前几个，避免整行被 44 个动作铺满
  const plays = tools.value
    .filter(t => t.category === tab.value)
    .flatMap(t => (t.templates || []).slice(0, 6).map(x => ({ tool: t.code, name: x.name })))
    .slice(0, 14)
  return [
    ...badges.map(b => ({ kind: 'badge' as const, value: b, tool: '' })),
    ...plays.map(p => ({ kind: 'play' as const, value: p.name, tool: p.tool }))
  ]
})

const shown = computed(() => {
  let list = effects.value.filter(e => (tab.value === 'video' ? e.category === 'video' : e.category !== 'video'))
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter(e => `${e.name} ${e.summary} ${e.code}`.toLowerCase().includes(q))
  const tag = activeTag.value
  if (tag !== 'all') {
    const hit = tagList.value.find(t => t.value === tag)
    list = hit?.kind === 'badge' ? list.filter(e => e.badge === tag) : list.filter(e => e.name === tag)
  }
  return list
})

onMounted(() => {
  catalog.ensure()
})
</script>

<template>
  <div class="page-body fx">
    <!-- 顶部：新功能提示（让老用户一眼看到上新） -->
    <div
      v-if="strip.length"
      class="fx-news"
    >
      <UIcon name="i-lucide-sparkles" />
      新工具：{{ strip[0]!.name }}
    </div>

    <!-- 大横幅 -->
    <section class="fx-hero">
      <div class="fx-hero-text">
        <h1>创建你自己的 AI 成人幻想</h1>
        <p>只上传你拥有或已获得明确许可的图片。所有生成内容仅你可见。</p>
        <NuxtLink
          v-if="firstTool"
          class="fx-cta"
          :to="`/tool/${firstTool.code}`"
        >
          <UIcon name="i-lucide-play" />开始使用
        </NuxtLink>
        <ul class="fx-chips">
          <li><UIcon name="i-lucide-shield-check" />图像自动删除</li>
          <li><UIcon name="i-lucide-lock" />私密处理</li>
          <li><UIcon name="i-lucide-database-zap" />无存储</li>
        </ul>
      </div>
      <div class="fx-hero-art">
        <div class="fx-hero-card">
          <UIcon :name="strip[0]?.icon || 'i-lucide-image'" />
          <span>效果预览</span>
        </div>
        <div class="fx-hero-card fx-hero-card--after">
          <UIcon name="i-lucide-wand-sparkles" />
          <span>生成结果</span>
        </div>
      </div>
    </section>

    <!-- 横排：图像效果 -->
    <section v-if="strip.length">
      <h2 class="fx-h2">
        {{ tab === 'video' ? '视频效果' : '图像效果' }}
      </h2>
      <div class="fx-strip">
        <NuxtLink
          v-for="tool in strip"
          :key="tool.code"
          class="fx-strip-card"
          :to="tool.template ? `/tool/${tool.code}?template=${tool.template}` : `/tool/${tool.code}`"
        >
          <div class="fx-thumb fx-thumb--sm">
            <img
              v-if="tool.cover"
              :src="tool.cover"
              alt=""
              loading="lazy"
            >
            <div
              v-else
              class="fx-thumb-fallback"
            >
              <UIcon :name="tool.icon || 'i-lucide-sparkles'" />
            </div>
            <span
              v-if="tool.badge"
              class="fx-badge"
            >{{ tool.badge }}</span>
          </div>
          <span class="fx-strip-name">{{ tool.name }}</span>
        </NuxtLink>
      </div>
    </section>

    <!-- 工具条：数量 + 搜索 -->
    <div class="fx-toolbar">
      <div class="fx-counts">
        <button
          type="button"
          :class="{ active: tab === 'video' }"
          @click="tab = 'video'"
        >
          视频效果 <b>{{ counts.video }}</b>
        </button>
        <button
          type="button"
          :class="{ active: tab === 'image' }"
          @click="tab = 'image'"
        >
          图像效果 <b>{{ counts.image }}</b>
        </button>
      </div>
      <label class="fx-search">
        <UIcon name="i-lucide-search" />
        <input
          v-model="search"
          type="search"
          placeholder="搜索效果、模板、关键词…"
          aria-label="搜索效果"
        >
      </label>
    </div>

    <!-- 标签行 -->
    <div
      v-if="tagList.length"
      class="fx-tags"
    >
      <button
        type="button"
        :class="{ active: activeTag === 'all' }"
        @click="activeTag = 'all'"
      >
        <UIcon name="i-lucide-layout-grid" />全部
      </button>
      <button
        v-for="tag in tagList"
        :key="tag.kind + tag.value"
        type="button"
        :class="{ active: activeTag === tag.value }"
        @click="activeTag = tag.value"
      >
        <UIcon :name="tag.kind === 'badge' ? 'i-lucide-flame' : 'i-lucide-tag'" />{{ tag.value }}
      </button>
    </div>

    <!-- 五列竖版卡片 -->
    <div class="fx-grid">
      <NuxtLink
        v-for="tool in shown"
        :key="tool.code"
        class="fx-card"
        :to="tool.template ? `/tool/${tool.code}?template=${tool.template}` : `/tool/${tool.code}`"
      >
        <div class="fx-thumb">
          <img
            v-if="tool.cover"
            :src="tool.cover"
            alt=""
            loading="lazy"
          >
          <div
            v-else
            class="fx-thumb-fallback"
          >
            <UIcon :name="tool.icon || 'i-lucide-sparkles'" />
          </div>
          <span
            v-if="tool.badge"
            class="fx-badge"
          >{{ tool.badge }}</span>
          <span
            v-if="!tool.template && tool.templateCount"
            class="fx-tpl"
          >{{ tool.templateCount }} 个玩法</span>
        </div>
        <div class="fx-name">
          {{ tool.name }}
        </div>
      </NuxtLink>
    </div>

    <p
      v-if="catalog.loading.value && !tools.length"
      role="status"
      class="empty-tip"
    >
      正在加载效果…
    </p>
    <p
      v-else-if="!shown.length"
      role="status"
      class="empty-tip"
    >
      <template v-if="!tools.length">
        本站还没有开放任何效果（可在后台「平台运营 → 创作工具」里添加并启用）。
      </template>
      <template v-else>
        没有匹配的效果
      </template>
    </p>
  </div>
</template>

<style scoped>
.fx { max-width: 1180px; }
.fx-news { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 6px 12px; border: 1px solid var(--hg-line); border-radius: 999px; background: var(--hg-card); color: var(--hg-muted); font-size: 13px; }
.fx-news svg { color: var(--hg-accent); }

/* 大横幅 */
.fx-hero { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; padding: 32px; border: 1px solid var(--hg-line); border-radius: 16px; background: linear-gradient(120deg, #1a1a1f 0%, #141416 60%); }
.fx-hero-text h1 { margin: 0 0 10px; font-size: 34px; line-height: 1.25; }
.fx-hero-text p { margin: 0 0 20px; max-width: 460px; color: var(--hg-muted); line-height: 1.7; }
.fx-cta { display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; border-radius: 10px; background: var(--hg-accent); color: #1a1205; font-weight: 600; text-decoration: none; }
.fx-chips { display: flex; flex-wrap: wrap; gap: 16px; margin: 20px 0 0; padding: 0; list-style: none; color: var(--hg-muted); font-size: 13px; }
.fx-chips li { display: flex; align-items: center; gap: 6px; }
.fx-hero-art { position: relative; min-height: 180px; }
.fx-hero-card { position: absolute; inset: 0 30% 0 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--hg-line); border-radius: 12px; background: #101012; color: var(--hg-muted); font-size: 13px; }
.fx-hero-card--after { inset: 12% 0 0 30%; border-color: color-mix(in srgb, var(--hg-accent) 50%, transparent); background: #17161b; }
.fx-hero-card svg { width: 28px; height: 28px; }

.fx-h2 { margin: 28px 0 14px; font-size: 18px; }
.fx-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
.fx-strip-card { display: flex; flex-direction: column; gap: 8px; color: var(--ink); text-decoration: none; }
.fx-strip-name { font-size: 14px; }

/* 缩略图 */
.fx-thumb { position: relative; aspect-ratio: 3 / 4; overflow: hidden; border: 1px solid var(--hg-line); border-radius: 12px; background: #141416; }
.fx-thumb--sm { aspect-ratio: 4 / 5; }
.fx-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.fx-thumb-fallback { display: grid; place-items: center; width: 100%; height: 100%; background: radial-gradient(circle at 50% 30%, #26262c 0%, #141416 70%); color: var(--hg-muted); }
.fx-thumb-fallback svg { width: 34px; height: 34px; }
.fx-card:hover .fx-thumb { border-color: var(--hg-accent); }
.fx-badge { position: absolute; top: 8px; right: 8px; padding: 3px 8px; border-radius: 6px; background: var(--hg-accent); color: #1a1205; font-size: 11px; font-weight: 600; }
.fx-tpl { position: absolute; bottom: 8px; left: 8px; padding: 3px 8px; border-radius: 6px; background: #000000a6; color: #fff; font-size: 11px; }

/* 工具条 */
.fx-toolbar { display: flex; align-items: center; gap: 16px; margin: 26px 0 14px; }
.fx-counts { display: flex; gap: 8px; }
.fx-counts button { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border: 1px solid var(--hg-line); border-radius: 10px; background: transparent; color: var(--hg-muted); cursor: pointer; }
.fx-counts button.active { border-color: var(--hg-accent); color: var(--ink); }
.fx-counts b { color: var(--ink); }
.fx-search { display: flex; flex: 1; align-items: center; gap: 8px; max-width: 420px; margin-left: auto; padding: 9px 12px; border: 1px solid var(--hg-line); border-radius: 10px; color: var(--hg-muted); }
.fx-search input { width: 100%; min-width: 0; border: 0; background: transparent; color: var(--ink); font: inherit; }

/* 标签行 */
.fx-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.fx-tags button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--hg-line); border-radius: 999px; background: transparent; color: var(--hg-muted); font-size: 13px; cursor: pointer; }
.fx-tags button.active { border-color: var(--hg-accent); background: color-mix(in srgb, var(--hg-accent) 16%, transparent); color: var(--ink); }

/* 五列网格 */
.fx-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px 14px; }
.fx-card { display: flex; flex-direction: column; gap: 8px; color: var(--ink); text-decoration: none; }
.fx-name { font-size: 14px; }

@media (max-width: 1100px) {
  .fx-hero { grid-template-columns: 1fr; }
  .fx-hero-art { display: none; }
  .fx-strip, .fx-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .fx-strip, .fx-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fx-toolbar { flex-direction: column; align-items: stretch; }
  .fx-search { max-width: none; margin-left: 0; }
}
</style>
