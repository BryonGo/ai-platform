<script setup lang="ts">
// 平台演员详情（只读）。挂在路由 /actors/:id 上。
//
// 结构对齐参考站 oiioii.tv/asset 的演员详情：一个宽 420 的详情卡片，内部从上到下是
//   ① name-row      演员名
//   ② gallery       三块固定比例（肖像 / 表情 / 转身），各自 contain；肖像块左下叠音色条
//   ③ toolbar-row   造型 pill + 收藏 + 主按钮（横向可滚，不换行挤压）
// 卡片下方是 ④ 横向「切换演员」条。
//
// 公共演员不能改：能做的只有收藏、复制到「我的演员」（cloneActor）。
// 刻意**不放**「用于画布」：现有创作页还没有真实消费 actorId 的入口，
// 放一个按下去没反应的按钮就是假装成功（仓库约定：做不到的如实说明）。
import type { ActorOutfit, ActorItem } from '~/composables/useHougongApi'
import {
  actorGalleryBlocks,
  actorMediaForOutfit,
  actorStripCandidates,
  actorTaxonomyChips,
  actorVoiceState,
  actorGenerationLabel,
  buildFacetLabelMap
} from '~/utils/actor'

const props = defineProps<{ id: string }>()

const api = useHougongApi()
const session = useAuthSession()

const detail = ref<ActorDetail | null>(null)
const loading = ref(true)
const error = ref('')
const notice = ref('')

const favoriteBusy = ref(false)
const cloning = ref(false)

/** facets 的 value → label 映射（把 taxonomy 的 code 显示成中文；取不到回退 value）。 */
const facetLabels = ref(buildFacetLabelMap(null))

/** 选中的造型（默认第一个有图的造型，见 load）。 */
const selectedOutfitId = ref('')

/** 当前造型（或全局）的媒体集合：选中造型就只用它自己的图，不跨造型顶替。 */
const activeMedia = computed(() => actorMediaForOutfit(detail.value, selectedOutfitId.value))

/** 画廊三块（肖像 / 表情 / 转身），各自带回退。 */
const gallery = computed(() => actorGalleryBlocks(activeMedia.value))

/** 音色：全局（不随造型切换）。 */
const voice = computed(() => actorVoiceState(detail.value?.voice))
const voiceEl = ref<HTMLAudioElement | null>(null)
const voicePlaying = ref(false)

/** 分类标签：最多 4 个中文 label，放名称下方一行小号展示。 */
const tags = computed(() => (detail.value ? actorTaxonomyChips(detail.value.actor.taxonomy, facetLabels.value, 4) : []))

const generationLabel = computed(() => actorGenerationLabel(detail.value?.actor.generationStatus))

// ── 切换演员条 ──
const stripItems = ref<ActorItem[]>([])
const stripRef = ref<HTMLElement | null>(null)
/** 排除当前演员；为空（含接口失败）时整条不渲染，不造假数据。 */
const strip = computed(() => actorStripCandidates(stripItems.value, props.id, 12))

async function loadStrip() {
  try {
    const res = await api.listActors({ page: 1, pageSize: 12 })
    stripItems.value = res.items
  } catch {
    stripItems.value = []
  }
}

function nextStrip() {
  const el = stripRef.value
  if (!el) return
  el.scrollBy({ left: Math.max(160, el.clientWidth * 0.8), behavior: 'smooth' })
}

// ── 数据加载 ──
async function loadFacetLabels() {
  try {
    const res = await api.listActors({ page: 1, pageSize: 1 })
    facetLabels.value = buildFacetLabelMap(res.facets)
  } catch {
    // 字典拉不到不该让详情打不开：标签回退显示原值。
    facetLabels.value = new Map()
  }
}

function pauseVoice() {
  voiceEl.value?.pause()
  voicePlaying.value = false
}

async function load() {
  await session.load()
  if (!session.token.value) {
    await goLogin()
    return
  }
  loading.value = true
  error.value = ''
  detail.value = null
  pauseVoice()
  try {
    void loadFacetLabels()
    void loadStrip()
    const res = await api.getActor(props.id)
    detail.value = res
    // 默认选中第一个造型：平台演员的图基本都挂在造型下，不选就一张都看不到。
    selectedOutfitId.value = res.outfits[0]?.id || ''
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function pickOutfit(id: string) {
  if (selectedOutfitId.value === id) return
  selectedOutfitId.value = id
  // 造型切换只换图，音色是全局的，继续播放即可。
}

/** 造型 pill 的缩略图：该造型自己的图优先，其次全局封面。 */
function outfitThumb(outfit: ActorOutfit): string {
  if (outfit.url) return outfit.url
  const own = outfit.media || {}
  const keys: ActorMediaSlotKey[] = ['portrait', 'headshot', 'fullBody', 'threeView', 'expressionSheet']
  const hit = keys.find(k => !!own[k]?.url)
  return hit ? (own[hit]?.url || '') : (detail.value?.actor.coverUrl || '')
}

function downloadName(label: string) {
  return `${detail.value?.actor.name || 'actor'}-${label}.png`
}

function toggleVoice() {
  const el = voiceEl.value
  if (!el) return
  if (el.paused) {
    el.play().catch(() => {
      notice.value = '音色播放失败，请稍后再试'
    })
  } else {
    el.pause()
  }
}

function onVoiceError() {
  voicePlaying.value = false
  notice.value = '音色加载失败'
}

async function toggleFavorite() {
  if (!detail.value || favoriteBusy.value) return
  favoriteBusy.value = true
  const next = !detail.value.favorited
  detail.value.favorited = next
  try {
    const res = await api.favoriteActor(props.id, next)
    detail.value.favorited = res.favorited
  } catch (e: unknown) {
    detail.value.favorited = !next
    notice.value = e instanceof Error ? e.message : '收藏操作失败'
  } finally {
    favoriteBusy.value = false
  }
}

async function cloneToMine() {
  if (cloning.value) return
  cloning.value = true
  notice.value = ''
  try {
    const res = await api.cloneActor(props.id)
    if (!res.characterId) {
      notice.value = '复制失败：后端没有返回新演员 id'
      return
    }
    // 复制成功 → 回「我的演员」（routes-design §3.4：/actors/mine），不再跳旧的 /assets?pane=actors。
    await navigateTo('/actors/mine')
  } catch (e: unknown) {
    notice.value = e instanceof Error ? e.message : '复制失败'
  } finally {
    cloning.value = false
  }
}

watch(() => props.id, load)
onMounted(load)
useMediaAutoRefresh(load)

onUnmounted(pauseVoice)
</script>

<template>
  <section class="actor-detail">
    <p
      v-if="loading"
      class="actor-detail__state"
    >
      正在读取演员…
    </p>

    <div
      v-else-if="error"
      class="actor-detail__state actor-detail__state--error"
      role="alert"
    >
      {{ error }}
      <button
        type="button"
        class="actor-detail__retry"
        @click="load"
      >
        重试
      </button>
    </div>

    <template v-else-if="detail">
      <article class="actor-detail__card">
        <!-- ① 名称 -->
        <header class="actor-detail__name-row">
          <h1 class="actor-detail__name">
            {{ detail.actor.name }}
          </h1>
          <span
            v-if="generationLabel"
            class="actor-detail__pill"
          >{{ generationLabel }}</span>
        </header>
        <!-- 分类标签：名称下方一行小号、克制展示（最多 4 个中文 label） -->
        <p
          v-if="tags.length"
          class="actor-detail__cats"
        >
          <span
            v-for="t in tags"
            :key="t"
          >{{ t }}</span>
        </p>

        <!-- ② 画廊三块：肖像 / 表情 / 转身，固定比例、contain -->
        <div
          class="gallery"
          role="group"
          aria-label="演员图片"
        >
          <figure
            v-for="block in gallery"
            :key="block.key"
            class="gallery__block"
            :class="`is-${block.key}`"
            :style="{ flexGrow: block.grow }"
          >
            <img
              v-if="block.url"
              :src="block.url"
              :alt="`${detail.actor.name} · ${block.slotLabel || block.label}`"
            >
            <div
              v-else
              class="gallery__empty"
              aria-hidden="true"
            >
              {{ detail.actor.name.slice(0, 1) }}
            </div>
            <a
              v-if="block.url"
              class="gallery__dl"
              :href="block.url"
              :download="downloadName(block.label)"
              target="_blank"
              rel="noopener"
              :aria-label="`下载${block.label}图`"
              :title="`下载${block.label}图`"
            >
              <UIcon
                name="i-lucide-download"
                aria-hidden="true"
              />
            </a>

            <!-- 音色条叠在肖像块左下：有音色才给播放按钮，没有就如实说明 -->
            <div
              v-if="block.key === 'portrait'"
              class="voice-panel"
            >
              <template v-if="voice.hasPlayable">
                <button
                  type="button"
                  class="voice-panel__play"
                  :aria-label="voicePlaying ? '暂停音色' : '播放音色'"
                  :aria-pressed="voicePlaying"
                  @click="toggleVoice"
                >
                  <UIcon
                    :name="voicePlaying ? 'i-lucide-pause' : 'i-lucide-play'"
                    aria-hidden="true"
                  />
                </button>
                <span class="voice-panel__text">我的音色</span>
              </template>
              <span
                v-else
                class="voice-panel__text is-empty"
              >{{ voice.missingUrl ? '音色无地址' : '暂无音色' }}</span>
            </div>
          </figure>
        </div>

        <!-- ③ 造型一行横滚；收藏 + 主按钮单独一行常驻。
             参考站把三者放同一行，但在 356px 内容宽里主按钮会被挤出可视区；
             小屏用户看不到「复制到我的演员」比像素级对齐更严重。 -->
        <div
          class="toolbar-row"
          role="group"
          aria-label="造型与操作"
        >
          <div
            class="toolbar-outfits"
            role="group"
            aria-label="造型"
          >
            <button
              v-for="outfit in detail.outfits"
              :key="outfit.id"
              type="button"
              class="outfit-pill"
              :class="{ active: selectedOutfitId === outfit.id }"
              :aria-pressed="selectedOutfitId === outfit.id"
              :aria-label="`造型 ${outfit.name}`"
              @click="pickOutfit(outfit.id)"
            >
              <img
                v-if="outfitThumb(outfit)"
                class="outfit-pill__thumb"
                :src="outfitThumb(outfit)"
                alt=""
                aria-hidden="true"
              >
              <span
                v-else
                class="outfit-pill__thumb outfit-pill__fallback"
                aria-hidden="true"
              >{{ outfit.name.slice(0, 1) }}</span>
              <span class="outfit-pill__label">{{ outfit.name }}</span>
            </button>
          </div>

          <div class="toolbar-actions">
            <button
              type="button"
              class="toolbar-fav"
              :class="{ active: detail.favorited }"
              :aria-pressed="detail.favorited"
              :aria-label="detail.favorited ? '取消收藏' : '收藏'"
              :disabled="favoriteBusy"
              @click="toggleFavorite"
            >
              <UIcon
                name="i-lucide-heart"
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              class="toolbar-primary"
              :disabled="cloning"
              @click="cloneToMine"
            >
              <UIcon
                name="i-lucide-copy"
                aria-hidden="true"
              />
              {{ cloning ? '复制中…' : '复制到我的演员' }}
            </button>
          </div>
        </div>

        <p
          v-if="notice"
          class="actor-detail__notice"
          role="status"
        >
          {{ notice }}
        </p>
        <p
          v-if="voice.missingUrl"
          class="actor-detail__hint"
        >
          有 {{ voice.missingUrl }} 条音色登记，但后端没有下发可播放地址。
        </p>
        <p class="actor-detail__hint">
          复制后会出现在「我的演员」里，在那里可以编辑并使用；平台演员本身不可修改。
        </p>
      </article>

      <!-- ④ 横向「切换演员」条：排除当前演员；接口失败/为空则整条不显示 -->
      <section
        v-if="strip.length"
        class="strip"
        aria-label="切换演员"
      >
        <div
          ref="stripRef"
          class="strip__rail"
        >
          <NuxtLink
            v-for="a in strip"
            :key="a.id"
            class="strip__card"
            :to="`/actors/${a.id}`"
            :aria-label="`查看演员 ${a.name}`"
          >
            <img
              v-if="a.coverUrl"
              :src="a.coverUrl"
              :alt="a.name"
              loading="lazy"
            >
            <span
              v-else
              class="strip__fallback"
              aria-hidden="true"
            >{{ a.name.slice(0, 1) }}</span>
            <span class="strip__name">{{ a.name }}</span>
          </NuxtLink>
        </div>
        <button
          type="button"
          class="strip__next"
          aria-label="下一组演员"
          title="下一组"
          @click="nextStrip"
        >
          <UIcon
            name="i-lucide-chevron-right"
            aria-hidden="true"
          />
        </button>
      </section>

      <!-- 音色播放：隐藏的原生 audio，不用 controls（参考站是自定义小播放键），不自动播放 -->
      <audio
        v-if="voice.hasPlayable"
        ref="voiceEl"
        class="voice-audio"
        :src="voice.url"
        preload="none"
        @play="voicePlaying = true"
        @pause="voicePlaying = false"
        @ended="voicePlaying = false"
        @error="onVoiceError"
      />
    </template>
  </section>
</template>

<style scoped>
.actor-detail { width: 100%; max-width: 420px; }

.actor-detail__state { padding: 48px 0; text-align: center; color: var(--muted); font-size: 13px; }
.actor-detail__state--error { color: #ff9aa2; }
.actor-detail__retry { margin-left: 8px; min-height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: transparent; color: var(--hg-accent-hi); font-family: inherit; font-size: 13px; cursor: pointer; }

/* 详情卡片：宽 420、深色、圆角；左右 padding 32 → 内容宽 356（与参考站一致）。 */
.actor-detail__card {
  box-sizing: border-box;
  width: 100%;
  padding: 24px 32px 28px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #0d0d0d;
}

/* ① 名称行：高 24 */
.actor-detail__name-row { display: flex; align-items: center; gap: 8px; min-height: 24px; }
.actor-detail__name { margin: 0; color: var(--ink); font-size: 17px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actor-detail__pill { flex: 0 0 auto; padding: 1px 8px; border: 1px solid var(--hg-accent-line); border-radius: 999px; color: var(--hg-accent-hi); font-size: 10px; }

/* 分类标签：一行小号克制展示，不占大行 */
.actor-detail__cats { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0; }
.actor-detail__cats span { padding: 1px 8px; border-radius: 999px; background: rgb(255 255 255 / 6%); color: var(--muted); font-size: 10.5px; }

/* ② 画廊：比例放在容器上（356/302），三块只按 116 : 66 : 158 分宽度、高度撑满。
   之前把 aspect-ratio 放在每块上，窄屏会各自缩高，整排被压成一条矮带。 */
.gallery {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  aspect-ratio: 356 / 302;
  align-items: stretch;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}
.gallery__block {
  position: relative;
  flex-grow: 1;
  flex-shrink: 0;
  flex-basis: 0;
  min-width: 56px;
  height: 100%;
  margin: 0;
  overflow: hidden;
  border-radius: 10px;
  background: #141416;
}
.gallery__block.is-portrait { min-width: 92px; }
.gallery__block.is-emotive { min-width: 56px; }
.gallery__block.is-turnaround { min-width: 124px; }
/* 详情三块是固定窄/高比例，源图却有横向合成表：用 cover 填满，避免缩成小图。
   （卡片封面仍用 contain，两者用途不同。） */
.gallery__block img { display: block; width: 100%; height: 100%; object-fit: cover; }
.gallery__empty { display: grid; place-items: center; width: 100%; height: 100%; background: radial-gradient(circle at 50% 30%, #26262c 0%, #141416 70%); color: var(--faint); font-size: 24px; }

/* 每块右上角下载按钮 28×28 */
.gallery__dl {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 14px;
  text-decoration: none;
}
.gallery__dl:hover { background: rgb(0 0 0 / 75%); }
.gallery__dl:focus-visible { outline: 2px solid var(--hg-accent); outline-offset: 2px; }

/* 音色条：约 90×36，叠在肖像块左下 */
.voice-panel {
  position: absolute;
  left: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px 0 6px;
  border-radius: 999px;
  background: rgb(0 0 0 / 62%);
  color: #fff;
  font-size: 11px;
  max-width: calc(100% - 12px);
}
.voice-panel__play {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: var(--hg-accent);
  color: var(--hg-accent-ink);
  font-size: 11px;
  cursor: pointer;
}
.voice-panel__play:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
.voice-panel__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voice-panel__text.is-empty { color: rgb(255 255 255 / 65%); }

/* ③ 造型一行横滚；操作一行常驻（小屏不让主按钮被挤出可视区）。 */
.toolbar-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.toolbar-outfits {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.toolbar-outfits::-webkit-scrollbar { display: none; }
.toolbar-actions { display: flex; align-items: center; gap: 8px; }
.outfit-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 12px 0 5px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.outfit-pill.active { border-color: var(--hg-accent); color: var(--ink); }
.outfit-pill__thumb, .outfit-pill__fallback { width: 30px; height: 30px; border-radius: 999px; object-fit: cover; background: #1b1b1f; }
.outfit-pill__fallback { display: grid; place-items: center; color: var(--faint); font-size: 12px; }
.outfit-pill__label { max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outfit-pill:focus-visible { outline: 2px solid var(--hg-accent); outline-offset: 2px; }

.toolbar-fav {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 16px;
  cursor: pointer;
}
.toolbar-fav.active { border-color: var(--hg-accent); color: var(--hg-accent); }
.toolbar-fav:disabled { opacity: 0.55; cursor: default; }
.toolbar-fav:focus-visible { outline: 2px solid var(--hg-accent); outline-offset: 2px; }

.toolbar-primary {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 40px;
  padding: 0 18px;
  border: 1px solid var(--hg-accent);
  border-radius: 999px;
  background: var(--hg-accent);
  color: var(--hg-accent-ink);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.toolbar-primary:disabled { opacity: 0.6; cursor: default; }
.toolbar-primary:focus-visible { outline: 2px solid var(--hg-accent-hi); outline-offset: 2px; }

.actor-detail__notice { margin: 10px 0 0; color: #ff9aa2; font-size: 12px; }
.actor-detail__hint { margin: 8px 0 0; color: var(--faint); font-size: 11.5px; line-height: 1.7; }

/* ④ 切换演员条：高 184，卡片 135×180 */
.strip { position: relative; margin-top: 16px; }
.strip__rail { display: flex; gap: 10px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; padding-bottom: 4px; }
.strip__card {
  position: relative;
  flex: 0 0 auto;
  display: block;
  width: 135px;
  height: 180px;
  overflow: hidden;
  border-radius: 12px;
  background: #141416;
  text-decoration: none;
}
.strip__card img { display: block; width: 100%; height: 100%; object-fit: cover; }
.strip__fallback { display: grid; place-items: center; width: 100%; height: 100%; background: radial-gradient(circle at 50% 30%, #26262c 0%, #141416 70%); color: var(--faint); font-size: 28px; }
.strip__name {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 16px 8px 8px;
  background: linear-gradient(to top, rgb(0 0 0 / 78%), transparent);
  color: #fff;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.strip__card:focus-visible { outline: 2px solid var(--hg-accent); outline-offset: 2px; }
.strip__next {
  position: absolute;
  top: 50%;
  right: 4px;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgb(13 13 13 / 85%);
  color: var(--ink);
  cursor: pointer;
  transform: translateY(-50%);
}
.strip__next:focus-visible { outline: 2px solid var(--hg-accent); outline-offset: 2px; }

/* 隐藏的原生 audio：不显示 controls，仅作为播放后端 */
.voice-audio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

/* 窄屏：面板占满；画廊已可横向滚动，不压成不可读小图 */
@media (max-width: 480px) {
  .actor-detail { max-width: 100%; }
  .actor-detail__card { padding: 20px 16px 22px; }
}

/* 平板及以上（≥561px）：不再把面板锁在 420 宽，改用容器宽度。
   画廊同时从固定比例改为自适应高度 —— 否则宽度一放大，356/302 会把整排撑成超高图带。 */
@media (min-width: 561px) {
  .actor-detail { max-width: 100%; }
  .actor-detail__card { padding: 26px 32px 30px; }
  .gallery { aspect-ratio: auto; height: clamp(240px, 40vw, 420px); }
  .toolbar-row { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
  .toolbar-outfits { flex: 1 1 280px; }
  .toolbar-actions { flex: 0 0 auto; }
  .toolbar-primary { flex: 0 0 auto; }
}

/* 桌面（≥1024px）：两栏 —— 左详情、右「切换演员」竖排；用满 .page-body 的宽度。 */
@media (min-width: 1024px) {
  .actor-detail { display: grid; grid-template-columns: minmax(0, 1fr) 236px; gap: 24px; align-items: start; }
  .actor-detail > * { min-width: 0; }
  .actor-detail__state { grid-column: 1 / -1; }
  .actor-detail__card { padding: 28px 36px 32px; }
  .gallery { height: clamp(300px, 24vw, 460px); }
  .strip { position: sticky; top: 16px; margin-top: 0; }
  .strip__rail { flex-direction: column; overflow-x: hidden; overflow-y: auto; max-height: min(620px, calc(100vh - 120px)); padding-right: 4px; }
  .strip__card { width: 100%; height: 152px; }
  .strip__next { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .strip__rail, .toolbar-outfits { scroll-behavior: auto; }
}
</style>
