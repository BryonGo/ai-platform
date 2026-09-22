<script setup lang="ts">
import type { ExploreWork } from '~/data/hougong-home'
import { toExploreWork } from '~/utils/work-feed'
import { vAutoPlayVideo, videoFirstFrameSrc } from '~/composables/useAutoPlayVideo'

// TV 频道 —— 站内作品频道。
//
// 数据源与首页「探索灵感」**同一个后端流**（listWorksFeed + scope=explore），
// 映射走共用的 `toExploreWork`（两处各写一份的话，「视频不给 cover」这类规则
// 迟早只在一边生效）。这一版只做「封面墙 + 加载更多」，不做无限滚动：
// 频道页是"翻着看"的场景，给用户一个明确的继续按钮比自动追着加载更可控。
const hgApi = useHougongApi()
const session = useAuthSession()

const PAGE_SIZE = 12
const items = ref<ExploreWork[]>([])
const page = ref(0)
const loading = ref(false)
const done = ref(false)
const error = ref('')
let requestId = 0

const loggedIn = computed(() => !!session.token.value)
const hasMore = computed(() => !done.value && !loading.value)

async function loadMore(reset = false) {
  if (!loggedIn.value) return
  if (loading.value) return
  if (!reset && done.value) return
  if (reset) requestId += 1
  const token = requestId
  const target = reset ? 1 : page.value + 1
  loading.value = true
  error.value = ''
  try {
    const { items: batch, total } = await hgApi.listWorksFeed(target, PAGE_SIZE, 'explore')
    if (token !== requestId) return
    const mapped = batch.map(toExploreWork)
    items.value = target === 1 ? mapped : [...items.value, ...mapped]
    page.value = target
    // 「到底了」按接口给的 total 判断：只按本批条数判断会在正好整除时多请求一次。
    if (!mapped.length || items.value.length >= total) done.value = true
  } catch {
    if (token !== requestId) return
    error.value = '加载失败，请重试。'
    if (target === 1) items.value = []
  } finally {
    if (token === requestId) loading.value = false
  }
}

onMounted(() => {
  void loadMore(true)
})
</script>

<template>
  <div class="tv-page">
    <header class="tv-head">
      <div>
        <h1>TV 频道</h1>
        <p>站内作品频道 · 按发布时间滚动</p>
      </div>
    </header>

    <p
      v-if="!loggedIn"
      class="tv-state"
    >
      登录后可以浏览站内作品频道。
    </p>

    <p
      v-else-if="error"
      class="tv-state"
    >
      {{ error }}
      <button
        type="button"
        @click="loadMore(true)"
      >
        重新加载
      </button>
    </p>

    <p
      v-else-if="!items.length && loading"
      class="tv-state"
    >
      正在读取频道…
    </p>

    <p
      v-else-if="!items.length"
      class="tv-state"
    >
      频道里还没有已发布的作品。
    </p>

    <template v-else>
      <div class="tv-grid">
        <article
          v-for="item in items"
          :key="item.id"
          class="tv-card"
        >
          <NuxtLink
            class="tv-cover"
            :to="`/works/${item.id}`"
            :aria-label="`查看 ${item.title}`"
          >
            <!-- 视频作品用 <video>：后端不下发独立封面图，拿 mp4 当 <img> 就是坏图 -->
            <video
              v-if="item.kind === 'video' && item.videoUrl"
              v-auto-play-video
              :src="videoFirstFrameSrc(item.videoUrl)"
              :data-src="item.videoUrl"
              muted
              loop
              playsinline
              preload="metadata"
            />
            <img
              v-else-if="item.cover"
              :src="item.cover"
              :alt="item.title"
              loading="lazy"
            >
            <span
              v-if="item.badge"
              class="tv-badge"
            >{{ item.badge }}</span>
          </NuxtLink>
          <strong>{{ item.title }}</strong>
          <small v-if="item.author">{{ item.author }}</small>
        </article>
      </div>

      <div class="tv-foot">
        <button
          v-if="hasMore"
          type="button"
          class="tv-more"
          @click="loadMore()"
        >
          {{ loading ? '加载中…' : '加载更多' }}
        </button>
        <span
          v-else
          class="tv-end"
        >已经到底了</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tv-page {
  padding: 20px 26px 48px;
}
.tv-head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}
.tv-head p {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--hg3-faint);
}
/* 封面墙：竖屏 3:4，与首页探索流同一套比例 */
.tv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 18px 14px;
  margin-top: 20px;
}
.tv-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.tv-cover {
  position: relative;
  display: block;
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--hg3-line);
  background: #141414;
}
.tv-cover img,
.tv-cover video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tv-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgb(0 0 0 / 65%);
  font-size: 10px;
  line-height: 16px;
  color: #f0e6c8;
}
.tv-card strong {
  font-size: 12.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tv-card small {
  font-size: 11px;
  color: var(--hg3-faint);
}
.tv-state {
  margin: 48px 0;
  text-align: center;
  font-size: 13px;
  color: var(--hg3-faint);
}
.tv-state button {
  margin-left: 8px;
  color: var(--hg3-accent-hi);
}
.tv-foot {
  margin-top: 26px;
  text-align: center;
}
.tv-more {
  height: 36px;
  padding: 0 22px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 99px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.tv-more:hover {
  background: #1e1e1e;
}
.tv-end {
  font-size: 12px;
  color: var(--hg3-faint);
}
</style>
