<script setup lang="ts">
// vAutoPlayVideo 必须显式 import：模板里用了 `v-auto-play-video`，而 `<script setup>`
// 只把**本文件导入的** `vXxx` 当成指令注册。少了这一行，视频卡进视口不会自动播，
// 控制台只丢一句 "Failed to resolve directive: auto-play-video"，画面看着"就是不动"。
import { vAutoPlayVideo } from '~/composables/useAutoPlayVideo'
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
import { effectPath, effectTabFromPath, legacyRedirect } from '~/utils/routes'

useSeoMeta({ title: '技能 · 后宫' })

const route = useRoute()
// 旧 `?tab=image|video` 入站重定向到 path 子路由（旧页签从没写过 URL，这里做兼容）。
const legacy = legacyRedirect(route.path, route.query)
if (legacy) await navigateTo(legacy, { redirectCode: 301 })

// SSR 预取公开目录：服务端 render 前取好，首屏 HTML 就带真实技能卡；
// payload 水合后客户端不再重复请求（见 useToolCatalogSsr）。
const catalog = await useToolCatalogSsr()
// 分类页签：全部 / 图片 / 视频。**页签即地址**（/effects、/effects/image、/effects/video），
// 刷新/分享/后退都能回到同一分类；默认「全部」——原来默认落在图片，第一次进来的人
// 根本不知道视频那半边还有东西。
const tab = computed<'all' | 'image' | 'video'>(() => effectTabFromPath(route.path))

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

const inTab = (e: EffectCard) =>
  tab.value === 'all' ? true : (tab.value === 'video' ? e.category === 'video' : e.category !== 'video')

const counts = computed(() => ({
  image: effects.value.filter(e => e.category !== 'video').length,
  video: effects.value.filter(e => e.category === 'video').length
}))

// 列表只按页签筛。搜索与标签行随旧版面一起撤了 —— 原型上这一页就是
// 「标题 + 分类页签 + 卡片」，多出来的工具条会把注意力从卡片上拽走。
const shown = computed(() => effects.value.filter(inTab))

onMounted(() => {
  catalog.ensure()
})
</script>

<template>
  <div class="page-body fx">
    <h1 class="fx-title">
      技能
    </h1>

    <!-- 分类页签：全部 / 图片 / 视频。下划线选中态，和资产页的页签同一套。
         每个页签是一个**地址**（NuxtLink），点它就换 URL，刷新/分享/后退都停在同一分类。 -->
    <div
      class="fx-tabs"
      role="tablist"
      aria-label="技能分类"
    >
      <NuxtLink
        role="tab"
        :aria-selected="tab === 'all'"
        :class="{ active: tab === 'all' }"
        :to="effectPath('all')"
      >
        全部
      </NuxtLink>
      <NuxtLink
        role="tab"
        :aria-selected="tab === 'image'"
        :class="{ active: tab === 'image' }"
        :to="effectPath('image')"
      >
        图片
      </NuxtLink>
      <NuxtLink
        v-if="counts.video > 0"
        role="tab"
        :aria-selected="tab === 'video'"
        :class="{ active: tab === 'video' }"
        :to="effectPath('video')"
      >
        视频
      </NuxtLink>
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
        </div>
        <div class="fx-body">
          <strong class="fx-name">{{ tool.name }}</strong>
          <!-- 一句话说明：光有名字看不出这个技能到底做什么（后端目录的 summary） -->
          <p
            v-if="tool.summary"
            class="fx-desc"
          >
            {{ tool.summary }}
          </p>
          <div class="fx-foot">
            <span class="fx-tag">
              {{ tool.category === 'video' ? '视频' : '图片' }}<template v-if="tool.isTool && tool.optionCount"> · {{ tool.optionCount }} 个玩法</template>
            </span>
            <!-- 整张卡就是链接，「试试看」只是它的视觉落点；放进 <a> 里的真按钮是无效嵌套，
                 所以这里用 span 呈现（点哪儿都是进这个技能）。 -->
            <span class="fx-try">试试看</span>
          </div>
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
/* 本页样式**逐条抄自 public/prototypes/hougong-oii.html**（1:1，不做站内色板适配）。
   字面值保持原样：--pink #e832b0 / --lime #dbff73 / 底色 #0d0d0d / 边框 #242424 …
   原型里对应的类是 .page-view / .page-title / .tabs / .skill-grid / .skill-card /
   .skill-cover / .skill-badge / .skill-body / .skill-foot / .skill-try。
   改动本页观感时请**先改原型再同步到这里**，否则两边会漂。 */
.fx {
  /* 原型 .page-view 是**全宽 + 26/32/44 内边距**；而站内通用的 .page-body 是
     「min(1320px, 100%-48px) 居中 + 44px 顶距」。要 1:1 就得把那一层取消掉。 */
  width: auto;
  max-width: none;
  margin: 0;
  padding: 26px 32px 44px;
}

/* 原型 .page-title */
.fx-title { margin: 0 0 18px; font-size: 22px; font-weight: 650; color: #fafafa; }

/* 原型 .tabs / .tabs button */
.fx-tabs { display: flex; align-items: center; gap: 18px; margin-bottom: 18px; font-size: 13px; }
.fx-tabs a {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 26px;
  color: #8a8a8a;
  font-size: 13px;
  text-decoration: none;
}
.fx-tabs a:hover { color: #d8d8d8; }
.fx-tabs a.active { color: #fff; font-weight: 600; }
.fx-tabs a.active::after {
  position: absolute;
  right: 0;
  bottom: -3px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: #e832b0;
  content: '';
}

/* 原型 .skill-grid */
.fx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }

/* 原型 .skill-card */
.fx-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #242424;
  border-radius: 14px;
  background: rgb(20 20 20 / 80%);
  color: #fafafa;
  text-decoration: none;
  transition: border-color 0.2s, transform 0.2s;
}
.fx-card:hover { border-color: #ffffff33; transform: translateY(-2px); }

/* 原型 .skill-cover */
.fx-thumb { position: relative; overflow: hidden; aspect-ratio: 3 / 4; background: #0d0d0d; }
/* 素材等比完整显示（卡片视频是 736x1280，框是 3:4）：左右留黑边好过把动作裁掉 */
.fx-thumb img, .fx-thumb video { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
.fx-thumb-fallback { display: grid; place-items: center; width: 100%; height: 100%; background: radial-gradient(circle at 50% 30%, #26262c 0%, #0d0d0d 70%); color: #949494; }
.fx-thumb-fallback svg { width: 34px; height: 34px; }

/* 原型 .skill-badge（绿底 lime 字） */
.fx-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 7px;
  border-radius: 6px;
  background: #3a4c13;
  color: #dbff73;
  font-size: 10px;
  line-height: 16px;
}

/* 原型 .skill-body / .skill-body strong / .skill-body p */
.fx-body { display: flex; flex: 1; flex-direction: column; gap: 5px; padding: 11px 12px 6px; }
.fx-name { font-size: 13px; font-weight: 600; color: #f0f0f0; }
.fx-desc {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #8f8f8f;
  font-size: 12px;
  line-height: 18px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* 原型 .skill-foot / .skill-tag / .skill-try */
.fx-foot { display: flex; align-items: center; gap: 8px; padding: 8px 12px 11px; }
.fx-tag { color: #6f6f6f; font-size: 11px; }
.fx-try {
  height: 30px;
  margin-left: auto;
  padding: 0 16px;
  border: 1px solid #ffffff1f;
  border-radius: 99px;
  background: #1e1e1e;
  color: #e8e8e8;
  font-size: 12px;
  line-height: 28px;
}
.fx-card:hover .fx-try { border-color: #ffffff3d; background: #2a2a2a; }
</style>
