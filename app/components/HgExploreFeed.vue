<script setup lang="ts">
// 探索灵感流 —— 首页区块（/）与独立探索页（/explore、/explore/:category）共用。
//
// 取数只有一条链路：后端 listWorksFeed(scope=explore)（全站已发布），
// 没有 mock、也没有写死的示例作品。切分类是**换地址**（/explore/:category），
// 分类筛选仍按标签名在已加载内容上做（后端 explore 流目前不支持 tag 参数，
// 假装"服务端按分类过滤"只会让用户以为筛过了 —— 真正的服务端筛选要后端加参数）。
import { vAutoPlayVideo, videoFirstFrameSrc } from '~/composables/useAutoPlayVideo'
import { toExploreWork } from '~/utils/work-feed'
import { EXPLORE_CATEGORY_SLUGS } from '~/utils/routes'
import type { ExploreWork } from '~/data/hougong-home'

const props = withDefaults(defineProps<{
  /** 当前分类（中文标签）。非法值由调用方回退成「推荐」。 */
  category?: string
  /** 未登录时是否显示登录提示（探索页 true；首页区块保持整块隐藏）。 */
  guestHint?: boolean
}>(), { category: '推荐', guestHint: false })

const hgApi = useHougongApi()
const session = useAuthSession()
const loggedIn = computed(() => !!session.token.value)

const items = ref<ExploreWork[]>([])
const page = ref(1)
const loading = ref(false)
const done = ref(false)
const error = ref('')
const ready = ref(false)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
// 请求令牌：切分类 / 重试会让在途请求作废，避免旧批次覆盖新列表
let requestId = 0

const PAGE_SIZE = 4

async function load(reset = false) {
  // 未登录：整块不出现，也不发请求 —— 没有凭据的探索流只会换回 401，
  // 再被渲染成「加载失败」，对访客来说那是一句没有意义也没法照做的报错。
  if (!loggedIn.value) return
  if (reset) {
    requestId += 1
  } else if (loading.value || done.value || !ready.value) {
    return
  }
  const token = requestId
  const targetPage = reset ? 1 : page.value + 1
  loading.value = true
  error.value = ''
  if (reset) {
    page.value = 1
    done.value = false
    items.value = []
  }
  try {
    const { items: batch, total } = await hgApi.listWorksFeed(targetPage, PAGE_SIZE, 'explore')
    if (token !== requestId) return
    const mapped = batch.map(toExploreWork)
    items.value = targetPage === 1 ? mapped : [...items.value, ...mapped]
    page.value = targetPage
    // 「到底了」按接口给的 total 判断（只按 items.length 判断会在整页边界漏判）
    if (!mapped.length || items.value.length >= total || items.value.length >= PAGE_SIZE * 8) {
      done.value = true
    }
    done.value = true
  } catch {
    if (token === requestId) {
      error.value = '加载失败，请重试。'
      items.value = []
      done.value = true
    }
  } finally {
    if (token === requestId) {
      loading.value = false
      ready.value = true
    }
  }
}

/** 展示用列表：分类按标签名匹配（「推荐」= 全部）。 */
const visible = computed(() => {
  if (props.category === '推荐') return items.value
  const target = props.category
  return items.value.filter(item =>
    item.category === target || item.tags?.some(tag => tag === target)
  )
})

function remixWork(work: ExploreWork) {
  navigateTo(`/create?remix=${encodeURIComponent(work.id)}`)
}

/* ---------------- 完整预览 ---------------- */
const previewOpen = ref(false)
const previewSrc = ref('')
const previewTitle = ref('')
const previewAuthor = ref('')
const previewKind = ref<'image' | 'video'>('image')

function openPreview(work: ExploreWork) {
  // 视频作品没有封面图，要播的是 videoUrl —— 拿 cover 去预览只会是空白
  previewKind.value = work.kind === 'video' ? 'video' : 'image'
  previewSrc.value = work.kind === 'video' ? (work.videoUrl || '') : work.cover
  previewTitle.value = work.title
  previewAuthor.value = work.author
  previewOpen.value = true
}

onMounted(() => {
  if (!sentinel.value) return
  observer = new IntersectionObserver((entries) => {
    // 首屏加载完成前不触发追加，避免空列表时哨兵可见导致第一批被跳过
    if (entries.some(entry => entry.isIntersecting) && ready.value && !done.value && !error.value) {
      void load()
    }
  }, { rootMargin: '240px' })
  observer.observe(sentinel.value)
})
onBeforeUnmount(() => observer?.disconnect())

// 签名地址过期自愈：换一批新签名地址，不重新生成、不重新计费。
useMediaAutoRefresh(() => load(true))
</script>

<template>
  <!-- 未登录：探索流接口需要凭据。探索页给明确登录提示；首页区块保持整块隐藏。 -->
  <p
    v-if="!loggedIn && guestHint"
    class="explore-guest"
    role="status"
  >
    登录后可以浏览全站探索流。
  </p>

  <section
    v-else-if="loggedIn && (items.length || error)"
    id="explore"
    class="explore-section"
    aria-labelledby="explore-title"
  >
    <header class="hg-section-head">
      <h2 id="explore-title">
        探索灵感
      </h2>
      <button
        type="button"
        class="hg-more"
        :disabled="loading || done"
        @click="load()"
      >
        {{ done ? '已经到底了' : (loading ? '加载中…' : '加载更多') }}
        <UIcon
          name="i-lucide-arrow-down"
          aria-hidden="true"
        />
      </button>
    </header>

    <!-- 分类页签是一个个**地址**（/explore/:category）：点它就换 URL，可刷新/分享/后退。
         当前分类高亮；首页上的分类点击同样跳到这里。 -->
    <div
      class="explore-tabs"
      role="tablist"
      aria-label="作品分类"
    >
      <NuxtLink
        v-for="item in EXPLORE_CATEGORY_SLUGS"
        :key="item.slug"
        role="tab"
        :aria-selected="category === item.label"
        :class="{ active: category === item.label }"
        :to="`/explore/${item.slug}`"
      >
        {{ item.label }}
      </NuxtLink>
    </div>

    <div class="explore-grid">
      <article
        v-for="work in visible"
        :key="work.id"
        class="hg-card explore-card"
      >
        <div class="hg-media r3x4">
          <!-- 视频作品：进视口静音循环播（后端 kind=video 时才有 videoUrl）。
               首帧用 #t=0.1 垫着，自动播放被拒/还没进视口时也不是黑框。 -->
          <video
            v-if="work.kind === 'video' && work.videoUrl"
            v-auto-play-video
            class="media-fg"
            :src="videoFirstFrameSrc(work.videoUrl)"
            muted
            loop
            playsinline
            preload="metadata"
          />
          <img
            v-else-if="work.cover"
            class="media-fg"
            :src="work.cover"
            :alt="work.title"
            loading="lazy"
          >
          <span
            v-if="work.badge && !work.badgeBaked"
            class="hg-badge"
          >{{ work.badge }}</span>
          <span
            v-if="work.duration"
            class="duration-badge"
          >{{ work.duration }}</span>
          <!-- 悬停操作蒙版渐显（交互图面板 01）；触摸端常显，不能只靠 hover 才能发现 -->
          <div class="hg-actions">
            <button
              type="button"
              class="action"
              @click="openPreview(work)"
            >
              <UIcon
                name="i-lucide-eye"
                aria-hidden="true"
              />预览
            </button>
            <button
              type="button"
              class="action"
              @click="remixWork(work)"
            >
              <UIcon
                name="i-lucide-copy"
                aria-hidden="true"
              />创作同款
            </button>
          </div>
        </div>
        <div class="card-foot column">
          <strong class="explore-title">{{ work.title }}</strong>
          <p
            v-if="work.author"
            class="explore-author"
          >
            <span
              v-if="work.avatar"
              class="author-avatar"
            >
              <img
                :src="work.avatar"
                alt=""
              >
            </span>
            {{ work.author }}
          </p>
          <button
            type="button"
            class="remix-button"
            @click="remixWork(work)"
          >
            <UIcon
              name="i-lucide-copy"
              aria-hidden="true"
            />创作同款
          </button>
        </div>
      </article>
    </div>

    <div
      ref="sentinel"
      class="explore-status"
      role="status"
    >
      <span v-if="loading">正在加载更多作品…</span>
      <button
        v-else-if="error"
        type="button"
        class="hg-more"
        @click="load()"
      >
        {{ error }} 点击重试
      </button>
      <span v-else-if="done">已经到底了。</span>
      <button
        v-else
        type="button"
        class="hg-more"
        @click="load()"
      >
        加载更多
      </button>
    </div>

    <HgMediaPreview
      v-model:open="previewOpen"
      :src="previewSrc"
      :title="previewTitle"
      :author="previewAuthor"
      :kind="previewKind"
    />
  </section>
</template>

<style scoped>
.explore-guest {
  margin: 24px 0;
  color: var(--hg3-muted);
  font-size: 13px;
}
.explore-tabs {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--hg3-line);
}
.explore-tabs a {
  position: relative;
  padding: 0 0 12px;
  color: var(--hg3-muted);
  font-size: 14px;
  text-decoration: none;
}
.explore-tabs a.active {
  color: var(--hg3-ink);
  font-weight: 600;
}
.explore-tabs a.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--hg3-accent);
  content: '';
}

.explore-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

/* 悬停操作蒙版：渐显、不改变卡片外框（交互图面板 01）。
   手机没有 hover，用 (hover: none) 常显，避免关键入口只能靠悬停发现。 */
.hg-actions {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 26px 10px 12px;
  background: linear-gradient(180deg, transparent, rgb(8 9 11 / 78%));
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 180ms ease, transform 180ms ease;
}
.hg-card:hover .hg-actions,
.hg-card:focus-within .hg-actions {
  opacity: 1;
  transform: none;
}
@media (hover: none) {
  .hg-actions { opacity: 1; transform: none; }
}
.hg-actions .action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 999px;
  background: rgb(18 19 22 / 88%);
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.hg-actions .action:hover {
  border-color: var(--hg3-accent-line);
  color: var(--hg3-accent-hi);
}
.explore-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.explore-author {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: var(--hg3-muted);
  font-size: 12px;
}
.author-avatar {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  overflow: hidden;
}
.author-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.remix-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 36px;
  margin-top: 4px;
  border: 0;
  border-radius: 10px;
  background: var(--hg3-card-soft);
  color: var(--hg3-ink);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.remix-button:hover {
  background: var(--hg3-tile);
}
.explore-status {
  padding: 22px 0 6px;
  color: var(--hg3-faint);
  font-size: 12px;
  text-align: center;
}
.duration-badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 5px;
  background: rgb(10 11 13 / 72%);
  color: #fff;
  font-size: 10px;
}
.card-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}
.card-foot.column {
  display: grid;
  gap: 6px;
  padding: 12px 14px 14px;
}

@media (max-width: 900px) {
  .explore-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .explore-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (pointer: coarse) {
  .explore-tabs a { padding: 6px 0 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .hg-actions { transition: none; }
}
</style>
