<script setup lang="ts">
// 站内搜索（/search?q=）—— 从应用外壳的搜索浮层变成**独立页面**：结果可刷新、可分享、可后退。
//
// 数据源与外 shel 时一致，且都是真实数据，不造假结果：
//   · 技能：真实工具目录（useToolCatalog，与首页/技能页同一份）；
//   · 页面：站内固定入口清单；
//   · 最近会话：登录后从后端 listSessions 拉取（未登录就没有这一段）。
import { searchPath } from '~/utils/routes'

useSeoMeta({ title: '搜索 · 后宫' })

const route = useRoute()
const router = useRouter()
const session = useAuthSession()
const hgApi = useHougongApi()
const toolCatalog = useToolCatalog()

/** 站内页面入口清单（搜索命中即可直达）。 */
const SEARCH_PAGES = [
  { label: '创作首页', to: '/' },
  { label: '工作室', to: '/create' },
  { label: '技能', to: '/effects' },
  { label: '图片技能', to: '/effects/image' },
  { label: '视频技能', to: '/effects/video' },
  { label: '探索', to: '/explore' },
  { label: '资产', to: '/assets' },
  { label: '临时资产', to: '/assets/temp' },
  { label: '回收站', to: '/assets/trash' },
  { label: '平台演员库', to: '/actors' },
  { label: '我的演员', to: '/actors/mine' },
  { label: '新建演员', to: '/actors/new' },
  { label: 'TV 频道', to: '/tv' },
  { label: '我的发布', to: '/works' },
  { label: '故事', to: '/stories' },
  { label: '钱包与账单', to: '/wallet' },
  { label: '充值', to: '/wallet/recharge' },
  { label: '订单', to: '/wallet/orders' },
  { label: '设置', to: '/settings' }
]

/** URL 里的搜索词是唯一真相；输入框是它的本地副本（带防抖回写）。 */
const keyword = ref(String(route.query.q || ''))

const sessions = ref<{ id: string, title: string }[]>([])

const query = computed(() => keyword.value.trim().toLowerCase())

const searchResults = computed(() => {
  if (!query.value) return { tools: [], sessions: [], pages: [] }
  const hit = (text: string) => text.toLowerCase().includes(query.value)
  return {
    tools: toolCatalog.tools.value
      .filter(tool => hit(tool.name) || hit(tool.code) || hit(tool.summary || ''))
      .slice(0, 12)
      .map(tool => ({
        id: tool.code,
        icon: tool.icon || 'i-lucide-sparkles',
        label: tool.name,
        summary: tool.summary || '',
        to: `/tool/${tool.code}`
      })),
    sessions: sessions.value.filter(item => hit(item.title)).slice(0, 8),
    pages: SEARCH_PAGES.filter(page => hit(page.label)).slice(0, 12)
  }
})

const hasQuery = computed(() => !!query.value)
const searchEmpty = computed(() => {
  const r = searchResults.value
  return hasQuery.value && !r.tools.length && !r.sessions.length && !r.pages.length
})

/** 输入 → URL（防抖）：切词也换 URL，页面刷新/分享/后退都停在同一个词上。 */
let timer: ReturnType<typeof setTimeout> | null = null
watch(keyword, (value) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    const next = value.trim()
    if (next === String(route.query.q || '')) return
    void router.replace({ path: '/search', query: next ? { q: next } : {} })
  }, 350)
})

/** 后退/前进：URL 反向驱动输入框（并让上面那个 watch 静默，不重复写）。 */
watch(() => route.query.q, (value) => {
  const next = String(value || '')
  if (next !== keyword.value) keyword.value = next
})

function clearKeyword() {
  keyword.value = ''
}

/** 打开搜索页就确保目录已加载（目录是 useState 共享的，已加载过就是空操作）。 */
async function loadSessions() {
  await session.load()
  if (!session.token.value) return
  try {
    const list = await hgApi.listSessions(1, 20)
    sessions.value = list.map(item => ({ id: String(item.id), title: item.title || '未命名会话' }))
  } catch {
    sessions.value = []
  }
}

onMounted(() => {
  void toolCatalog.ensure()
  void loadSessions()
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="page-body search-page">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          站内搜索
        </p>
        <h1>搜索</h1>
        <p>搜技能、页面入口或最近会话；搜索词在地址里（?q=），可以直接分享或收藏。</p>
      </div>
    </div>

    <form
      class="search-field"
      role="search"
      @submit.prevent
    >
      <UIcon
        name="i-lucide-search"
        aria-hidden="true"
      />
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索技能、页面或历史会话"
        aria-label="搜索技能、页面或历史会话"
        autofocus
      >
      <button
        v-if="keyword"
        type="button"
        class="search-clear"
        aria-label="清空搜索词"
        @click="clearKeyword"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </form>

    <p
      v-if="!hasQuery"
      class="search-hint"
    >
      输入关键词开始搜索。搜索词会写进地址栏，例如 <code>{{ searchPath('旗袍') }}</code>。
    </p>

    <p
      v-else-if="searchEmpty"
      class="search-hint"
      role="status"
    >
      没有找到「{{ keyword }}」相关的结果。
    </p>

    <div
      v-else
      class="search-results"
    >
      <section
        v-if="searchResults.tools.length"
        class="search-group"
      >
        <h2>技能</h2>
        <NuxtLink
          v-for="tool in searchResults.tools"
          :key="tool.id"
          class="search-hit"
          :to="tool.to"
        >
          <UIcon
            :name="tool.icon"
            aria-hidden="true"
          />
          <span class="search-hit__main">
            <strong>{{ tool.label }}</strong>
            <small v-if="tool.summary">{{ tool.summary }}</small>
          </span>
        </NuxtLink>
      </section>

      <section
        v-if="searchResults.pages.length"
        class="search-group"
      >
        <h2>页面</h2>
        <NuxtLink
          v-for="page in searchResults.pages"
          :key="page.to"
          class="search-hit"
          :to="page.to"
        >
          <UIcon
            name="i-lucide-arrow-up-right"
            aria-hidden="true"
          />
          <span class="search-hit__main">
            <strong>{{ page.label }}</strong>
          </span>
        </NuxtLink>
      </section>

      <section
        v-if="searchResults.sessions.length"
        class="search-group"
      >
        <h2>历史会话</h2>
        <NuxtLink
          v-for="item in searchResults.sessions"
          :key="item.id"
          class="search-hit"
          :to="`/create?session=${encodeURIComponent(item.id)}`"
        >
          <UIcon
            name="i-lucide-history"
            aria-hidden="true"
          />
          <span class="search-hit__main">
            <strong>{{ item.title }}</strong>
          </span>
        </NuxtLink>
      </section>
    </div>
  </div>
</template>

<style scoped>
.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 620px;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--hg-line, #282828);
  border-radius: 12px;
  background: var(--hg-input, rgb(255 255 255 / 4%));
  color: var(--hg-muted, #949494);
}
.search-field:focus-within {
  border-color: var(--hg-accent, #e832b0);
}
.search-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--ink, #fafafa);
  font-family: inherit;
  font-size: 15px;
  outline: none;
}
.search-clear {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.search-hint {
  margin-top: 18px;
  color: var(--hg-faint, #6f6f6f);
  font-size: 13px;
}
.search-hint code {
  padding: 1px 6px;
  border-radius: 6px;
  background: rgb(255 255 255 / 6%);
  font-size: 12px;
}
.search-results {
  display: grid;
  gap: 26px;
  max-width: 720px;
  margin-top: 22px;
}
.search-group h2 {
  margin: 0 0 8px;
  color: var(--hg-faint, #6f6f6f);
  font-size: 12px;
  font-weight: 500;
}
.search-hit {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--ink, #fafafa);
  text-decoration: none;
}
.search-hit:hover {
  border-color: var(--hg-line, #282828);
  background: rgb(255 255 255 / 4%);
}
.search-hit__main {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.search-hit__main strong {
  font-size: 14px;
  font-weight: 600;
}
.search-hit__main small {
  color: var(--hg-muted, #949494);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
