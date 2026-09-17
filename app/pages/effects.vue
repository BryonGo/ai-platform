<script setup lang="ts">
// 全部效果（/effects）—— 布局对着参考站 undress.xxx 的 All Effects 页做的：
// 顶部一条「新功能」提示 → 大横幅（标题 + 开始使用 + 三个小标签）→ 横排精选
// → 「视频效果 N / 图像效果 N」+ 搜索 → 标签行 → 五列竖版卡片（缩略图 + 角标 + 名称在下方）。
//
// 什么算"一张卡"：**一个效果一张卡**，不是"一个玩法一张卡"。
// 脱衣对照 undress.xxx：图像效果只有一张「脱衣」卡，不上/下半身拆分。
// 所以工具下的玩法分两类（后台 one 开关控制）：
//   单独成卡（默认）：口交、深喉、大字型 —— 参考站就是一张张列出来的，确实是不同的效果；
//   只是选项（isCard=false）：全脱/上半身/下半身、护士装/旗袍、2 倍/4 倍 —— 进工具页切。
// 选项仍然能点到：它们挂在所属工具那张卡的"玩法"里，标签行也照旧能筛出来。
//
// 数据仍然全部来自后端目录（GET /hougong/tools）：运营在后台停用工具，这里立刻消失；
// 封面图、角标、标签也在后台填（没填就用图标兜底，不留空框）。
useSeoMeta({ title: '全部效果 · 后宫' })

const catalog = useToolCatalog()
const tab = ref<'image' | 'video'>('image')
const search = ref('')
const activeTag = ref('all')

const tools = computed(() => catalog.tools.value)

interface EffectCard {
  key: string
  code: string
  template?: string
  name: string
  summary: string
  icon: string
  /** 效果图（处理**后**）。服务端下发的是限时签名地址，别缓存。 */
  cover?: string
  /** 对比原图（处理**前**）。与 cover 成对 → 卡片出对比滑块。 */
  coverBefore?: string
  /**
   * 卡片循环预览视频（mp4）。有值就**直接播它**，不再出对比滑块。
   *
   * 对比的前提是"同一画面的前后两帧"，而视频给不出同坐标的第二帧 —— 硬凑一个滑块
   * 只会让人以为能拖。所以视频卡片的交互是"进视口静音循环播放"，cover 当封面帧。
   */
  coverVideo?: string
  badge?: string
  category: string
  /** 该卡里能选的玩法数（工具卡 = 它下面所有玩法；玩法卡 = 0）。 */
  optionCount: number
  tags: string[]
  /** 是否工具卡（横排精选只放工具卡，跟参考站一致）。 */
  isTool: boolean
}

/** 只当作"选项"的玩法：后端明确说了 isCard=false。 */
function isOption(tpl: { isCard?: boolean }): boolean {
  return tpl.isCard === false
}

const effects = computed<EffectCard[]>(() => {
  const out: EffectCard[] = []
  for (const t of tools.value) {
    const tpls = t.templates || []
    const plays = tpls.filter(x => !isOption(x))
    const options = tpls.filter(x => isOption(x))
    const base = { code: t.code, icon: t.icon, category: t.category }
    // 工具自己什么时候成卡：它没有玩法卡（那它本身就是这个效果），
    // 或者它有"只是选项"的玩法（那些选项需要一个入口，否则就点不到了）。
    if (!plays.length || options.length) {
      out.push({
        ...base, key: t.code, name: t.name, summary: t.summary,
        cover: t.cover, coverBefore: t.coverBefore, badge: t.badge,
        // 循环预览视频只有工具级（hougong_tool.cover_video），玩法没有自己的视频列。
        coverVideo: t.coverVideo,
        optionCount: tpls.length, tags: t.tags || [], isTool: true
      })
    }
    for (const tpl of plays) {
      out.push({
        ...base, key: `${t.code}:${tpl.code}`, template: tpl.code,
        name: tpl.name, summary: tpl.summary || t.summary,
        // 玩法封面没配就用所属工具的封面：玩法比工具多得多，
        // 一张张配图是长期活儿，没配的那批不该是一整排灰框。
        cover: tpl.cover || t.cover,
        // 对比原图同理：玩法自己配了就用玩法的，否则回落工具的那一对。
        coverBefore: tpl.coverBefore || t.coverBefore,
        // 角标**不**继承：工具挂了"热门"，不等于它下面 44 个玩法个个都热门。
        badge: tpl.badge,
        // 预览视频只有工具级，玩法一律回落它所属工具的那段。
        coverVideo: t.coverVideo,
        optionCount: 0, tags: tpl.tags || [], isTool: false
      })
    }
  }
  return out
})

/** 横幅按钮指向第一个可用效果（没有效果时按钮不渲染）。 */
const firstTool = computed(() => effects.value[0])

const inTab = (e: EffectCard) => (tab.value === 'video' ? e.category === 'video' : e.category !== 'video')

/** 横排精选：优先挑工具卡（参考站那一排就是 脱衣/换脸/文字转图像/快速编辑/图像放大）。 */
const strip = computed(() => {
  const cards = effects.value.filter(e => e.isTool && inTab(e))
  const rest = effects.value.filter(e => e.isTool && !inTab(e))
  const others = effects.value.filter(e => !e.isTool)
  return [...cards, ...rest, ...others].slice(0, 5)
})

const counts = computed(() => ({
  image: effects.value.filter(e => e.category !== 'video').length,
  video: effects.value.filter(e => e.category === 'video').length
}))
watch(counts, (c) => {
  if (c.video === 0 && tab.value === 'video') tab.value = 'image'
}, { immediate: true })

/**
 * 标签行：全部 + 角标（热门/新品…）+ 标签（最多 12 个）。
 *
 * 顺序按"第一次出现的顺序"排，不按出现次数：按钮顺序一变，用户下一次就找不到
 * 上次点的那个标签了（脱衣这类主力效果排在最前也符合直觉）。
 */
const tagList = computed(() => {
  const badges = [...new Set(effects.value.filter(inTab).map(e => e.badge).filter(Boolean))] as string[]
  const seen = new Set<string>()
  for (const e of effects.value.filter(inTab)) {
    for (const t of e.tags) {
      if (seen.size >= 12) break
      seen.add(t)
    }
  }
  return [
    ...badges.map(b => ({ kind: 'badge' as const, value: b })),
    ...[...seen].map(t => ({ kind: 'tag' as const, value: t }))
  ]
})

const shown = computed(() => {
  let list = effects.value.filter(inTab)
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter(e =>
      `${e.name} ${e.summary} ${e.code} ${e.tags.join(' ')}`.toLowerCase().includes(q)
    )
  }
  const tag = activeTag.value
  if (tag !== 'all') {
    const hit = tagList.value.find(t => t.value === tag)
    list = hit?.kind === 'badge'
      ? list.filter(e => e.badge === tag)
      : list.filter(e => e.tags.includes(tag))
  }
  return list
})

/** 切页签时清掉可能已经不存在的筛选项，避免"点了标签再切页签，结果空列表"。 */
watch(tab, () => {
  if (activeTag.value !== 'all' && !tagList.value.some(t => t.value === activeTag.value)) {
    activeTag.value = 'all'
  }
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
          :key="tool.key"
          class="fx-strip-card"
          :to="tool.template ? `/tool/${tool.code}?template=${tool.template}` : `/tool/${tool.code}`"
        >
          <div class="fx-thumb fx-thumb--sm">
            <img
              v-if="tool.cover"
              class="media-fg"
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
          v-if="counts.video > 0"
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
        :key="tool.key"
        class="fx-card"
        :to="tool.template ? `/tool/${tool.code}?template=${tool.template}` : `/tool/${tool.code}`"
      >
        <div class="fx-thumb">
          <!-- 视频工具**直接播循环预览**，不摆对比滑块（用户要求：只有图片脱衣那张卡出对比）。
               对比的前提是"同一画面的前后两帧"，视频给不出同坐标的第二帧 ——
               硬凑一个滑块只会让人以为能拖。cover 在这里当视频的封面帧。
               顺序不能反：视频分支必须在对比之前，否则配了视频也走不到。 -->
          <video
            v-if="tool.coverVideo"
            v-auto-play-video
            class="media-fg"
            :src="tool.coverVideo"
            :poster="tool.cover || undefined"
            muted
            loop
            playsinline
            preload="none"
          />
          <!-- 后台配了「原图 + 效果图」一对，就出可拖动的对比滑块：
               光看一张裸图说明不了这个工具做了什么，前后一拖就懂了（首页同一条交互）。
               fit=contain：卡片框是 3:4、素材是 2:3，cover 会把头顶和脚各裁掉约 5%。 -->
          <HgCompareSlider
            v-else-if="tool.coverBefore && tool.cover"
            fit="contain"
            :before="tool.coverBefore"
            :after="tool.cover"
            :alt="tool.name"
            :label="`${tool.name} 原图与效果对比`"
          />
          <img
            v-else-if="tool.cover"
            class="media-fg"
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
            v-if="tool.isTool && tool.optionCount"
            class="fx-tpl"
          >{{ tool.optionCount }} 个玩法</span>
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
/* 缩略图同样不裁：框高不变，素材等比完整显示（卡片视频是 736x1280，框是 3:4/4:5）。
   左右留黑边好过把动作裁掉 —— 用户口径："高度一样，等比处理"。 */
.fx-thumb img, .fx-thumb video { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
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
