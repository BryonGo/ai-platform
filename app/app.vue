<script setup lang="ts">
import type { SessionItem } from '~/composables/useHougongApi'
import { HOME_TOOLS } from '~/data/hougong-home'

useHead({
  htmlAttrs: { lang: 'zh-CN' },
  link: [{ rel: 'icon', href: '/favicon.ico' }]
})

useSeoMeta({
  title: '后宫 · AI 影像创作',
  description: '面向个人创作者的 AI 图片与视频生产平台，用对话完成生产，角色是可复用的生产资产。'
})

const route = useRoute()
const session = useAuthSession()
const hgApi = useHougongApi()
const { open: authOpen, openDialog } = useAuthDialog()

/* 品牌徽标：从品牌母版裁出的狐狸头像（public/mock/home/emblem.png）。
   用绑定而不是静态 src，避免 Vite 把 public 路径当模块解析。 */
const emblemSrc = '/mock/home/emblem.png'

/* 导航图标为彩色线性图标：色值取自参考图逐像素实测，同一功能保持同一颜色 */
const navMain = [
  { to: '/', label: '首页', icon: 'i-lucide-house', color: 'var(--hg3-i-orange)' },
  { to: '/effects', label: '全部工具', icon: 'i-lucide-layout-grid', color: 'var(--hg3-i-coral)' },
  { to: '', label: '画布', icon: 'i-lucide-brush', color: 'var(--hg3-i-amber)', pill: '后续开放' },
  { to: '/#explore', label: '探索', icon: 'i-lucide-compass', color: 'var(--hg3-i-green)' }
]
const navAssets = [
  { to: '/assets', label: '图片', icon: 'i-lucide-image', color: 'var(--hg3-i-blue)' },
  { to: '/assets?kind=video', label: '视频', icon: 'i-lucide-video', color: 'var(--hg3-i-coral)' },
  { to: '/characters', label: '角色资产', icon: 'i-lucide-user-round', color: 'var(--hg3-i-green)' },
  { to: '/works', label: '我的发布', icon: 'i-lucide-send', color: 'var(--hg3-i-amber)' }
]
const navBottom = [
  { to: '/models', label: '模型', icon: 'i-lucide-box', color: 'var(--hg3-i-blue)' },
  { to: '/notifications', label: '通知', icon: 'i-lucide-bell', color: 'var(--hg3-i-coral)' },
  { to: '', label: '设置', icon: 'i-lucide-settings', color: 'var(--hg3-i-gray)' }
]

/* 未登录时的最近会话由 mock 兜底（后端 listSessions 需要登录态），
   登录后替换为真实会话 —— mock 与真实数据不混用。 */
const MOCK_RECENT = [
  { id: 'mock-rain', title: '雨夜回眸' },
  { id: 'mock-portrait', title: '角色立绘' },
  { id: 'mock-product', title: '产品短片' }
]

const recentSessions = ref<{ id: string, title: string }[]>([])

/* 侧栏「搜索」（上一轮交互标注 a）：搜工具、会话与页面，纯前端过滤已有数据 */
const searchOpen = ref(false)
const searchQuery = ref('')
const SEARCH_PAGES = [
  { label: '创作首页', to: '/' },
  { label: '对话创作', to: '/create' },
  { label: '全部工具', to: '/effects' },
  { label: '我的资产', to: '/assets' },
  { label: '角色资产', to: '/characters' },
  { label: '探索作品', to: '/works' },
  { label: '钱包与账单', to: '/wallet' },
  { label: '模型目录', to: '/models' }
]

const searchResults = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) return { tools: [], sessions: [], pages: [] }
  const hit = (text: string) => text.toLowerCase().includes(keyword)
  return {
    tools: HOME_TOOLS.filter(tool => hit(tool.label)).slice(0, 5),
    sessions: recentSessions.value.filter(item => hit(item.title)).slice(0, 5),
    pages: SEARCH_PAGES.filter(page => hit(page.label)).slice(0, 5)
  }
})

const searchEmpty = computed(() => {
  const r = searchResults.value
  return !r.tools.length && !r.sessions.length && !r.pages.length
})

function openSearch() {
  searchQuery.value = ''
  searchOpen.value = true
}

function goSearch(to: string) {
  searchOpen.value = false
  navigateTo(to)
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') searchOpen.value = false
}
const assetsOpen = ref(true)
const accountOpen = ref(false)
const accountWrapRef = ref<HTMLElement | null>(null)
const railOpen = ref(false)
// 对话创作页需要占满可视高度（输入器贴底、消息区独立滚动），
// 因此让主内容区去掉通用内边距，由页面自己排布。
const isFullBleed = computed(() => route.path.startsWith('/create'))
const credits = ref(0)
const unread = ref(0)

const PAGE_NAMES: Record<string, string> = {
  '/': '首页',
  '/create': '对话创作',
  '/effects': '全部工具',
  '/assets': '我的资产',
  '/characters': '角色资产',
  '/works': '探索',
  '/wallet': '钱包与账单',
  '/models': '模型',
  '/notifications': '通知',
  '/stories': '故事',
  '/auth/login': '登录',
  '/auth/register': '注册'
}
const pageName = computed(() => {
  const path = route.path.replace(/\/$/, '') || '/'
  if (PAGE_NAMES[path]) return PAGE_NAMES[path]
  const hit = Object.keys(PAGE_NAMES).find(key => key !== '/' && path.startsWith(key))
  return hit ? PAGE_NAMES[hit] : '创作'
})

function isActive(to: string) {
  if (!to) return false
  const path = to.split('?')[0]!.split('#')[0]!
  if (path === '/') return route.path === '/' && !to.includes('#')
  if (path === '/works') return route.path === '/works' || route.path.startsWith('/works/')
  return route.path === path || route.path.startsWith(`${path}/`)
}

function onAccountToggle(e: MouseEvent) {
  accountOpen.value = !accountOpen.value
  e.stopPropagation()
}
function onDocClick(e: MouseEvent) {
  if (accountWrapRef.value && !accountWrapRef.value.contains(e.target as Node)) accountOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

function logout() {
  session.clear()
  accountOpen.value = false
  navigateTo('/auth/login')
}

async function loadShellData() {
  session.load()
  if (!session.token.value) {
    recentSessions.value = MOCK_RECENT
    credits.value = 0
    unread.value = 0
    return
  }
  const [wallet, notifications, sessions] = await Promise.all([
    hgApi.walletBalance().catch(() => null),
    hgApi.unreadNotifications().catch(() => 0),
    hgApi.listSessions(1, 6).catch(() => [] as SessionItem[])
  ])
  if (wallet) credits.value = wallet.credits
  unread.value = notifications || 0
  recentSessions.value = sessions.length
    ? sessions.map(item => ({ id: String(item.id), title: item.title || '未命名会话' }))
    : MOCK_RECENT
}

onMounted(loadShellData)
// 登录弹窗关闭或成功后刷新顶栏余额 / 最近会话
watch(authOpen, (value, previous) => {
  if (previous && !value) void loadShellData()
})
watch(() => route.fullPath, () => {
  railOpen.value = false
  accountOpen.value = false
})
</script>

<template>
  <UApp>
    <div
      class="hg-app"
      :class="{ 'rail-open': railOpen, 'full-bleed': isFullBleed }"
    >
      <div
        v-if="railOpen"
        class="hg-rail-mask"
        @click="railOpen = false"
      />

      <aside
        class="hg-rail"
        aria-label="主导航"
      >
        <NuxtLink
          class="hg-rail-brand"
          to="/"
          aria-label="后宫首页"
        >
          <img
            :src="emblemSrc"
            alt=""
            width="34"
            height="34"
          >
          <b>后宫</b>
          <small>AI 创作平台</small>
        </NuxtLink>

        <button
          type="button"
          class="hg-rail-cta"
          @click="navigateTo('/create')"
        >
          <UIcon
            name="i-lucide-plus"
            aria-hidden="true"
          />
          创作
        </button>

        <div class="hg-rail-scroll">
          <nav class="hg-nav">
            <button
              type="button"
              class="hg-nav-item"
              @click="openSearch()"
            >
              <UIcon
                name="i-lucide-search"
                style="color: var(--hg3-i-blue)"
                aria-hidden="true"
              />
              <span class="hg-nav-label">搜索</span>
            </button>
            <template
              v-for="item in navMain"
              :key="item.label"
            >
              <NuxtLink
                v-if="item.to"
                class="hg-nav-item"
                :class="{ active: isActive(item.to) }"
                :to="item.to"
              >
                <UIcon
                  :name="item.icon"
                  :style="{ color: item.color }"
                  aria-hidden="true"
                />
                <span class="hg-nav-label">{{ item.label }}</span>
              </NuxtLink>
              <button
                v-else
                type="button"
                class="hg-nav-item"
                disabled
              >
                <UIcon
                  :name="item.icon"
                  :style="{ color: item.color }"
                  aria-hidden="true"
                />
                <span class="hg-nav-label">{{ item.label }}</span>
                <span
                  v-if="item.pill"
                  class="hg-nav-pill"
                >{{ item.pill }}</span>
              </button>
            </template>

            <button
              type="button"
              class="hg-nav-item"
              :class="{ active: navAssets.some(item => isActive(item.to)) }"
              :aria-expanded="assetsOpen"
              @click="assetsOpen = !assetsOpen"
            >
              <UIcon
                name="i-lucide-folder"
                style="color: var(--hg3-i-blue)"
                aria-hidden="true"
              />
              <span class="hg-nav-label">我的资产</span>
              <UIcon
                name="i-lucide-chevron-down"
                class="hg-nav-caret"
                :class="{ open: !assetsOpen }"
                aria-hidden="true"
              />
            </button>
            <template v-if="assetsOpen">
              <NuxtLink
                v-for="item in navAssets"
                :key="item.label"
                class="hg-nav-item sub"
                :class="{ active: isActive(item.to) }"
                :to="item.to"
              >
                <UIcon
                  :name="item.icon"
                  :style="{ color: item.color }"
                  aria-hidden="true"
                />
                <span class="hg-nav-label">{{ item.label }}</span>
              </NuxtLink>
            </template>
          </nav>

          <div class="hg-rail-divider" />

          <p class="hg-rail-section">
            <UIcon
              name="i-lucide-history"
              aria-hidden="true"
            />
            最近会话
          </p>
          <nav class="hg-nav">
            <NuxtLink
              v-for="item in recentSessions"
              :key="item.id"
              class="hg-nav-item sub"
              :to="`/create?session=${encodeURIComponent(item.id)}`"
            >
              <span class="hg-nav-label">{{ item.title }}</span>
            </NuxtLink>
          </nav>
        </div>

        <div class="hg-rail-foot">
          <nav class="hg-nav">
            <template
              v-for="item in navBottom"
              :key="item.label"
            >
              <NuxtLink
                v-if="item.to"
                class="hg-nav-item"
                :class="{ active: isActive(item.to) }"
                :to="item.to"
              >
                <UIcon
                  :name="item.icon"
                  :style="{ color: item.color }"
                  aria-hidden="true"
                />
                <span class="hg-nav-label">{{ item.label }}</span>
              </NuxtLink>
              <button
                v-else
                type="button"
                class="hg-nav-item"
                disabled
              >
                <UIcon
                  :name="item.icon"
                  :style="{ color: item.color }"
                  aria-hidden="true"
                />
                <span class="hg-nav-label">{{ item.label }}</span>
              </button>
            </template>
          </nav>
          <!-- 协议链接固定在侧栏底部稳定位置，不随信息流滚动（首页设计说明第 4 条批注） -->
          <p class="hg-legal">
            <a href="#">隐私政策</a>
            <a href="#">用户协议</a>
          </p>
        </div>
      </aside>

      <div class="hg-main">
        <header class="hg-topbar">
          <div class="hg-topbar-left">
            <button
              type="button"
              class="hg-icon-btn rail-toggle"
              aria-label="打开导航"
              @click="railOpen = true"
            >
              <UIcon name="i-lucide-menu" />
            </button>
            <p class="hg-crumb">
              创作 <span aria-hidden="true">/</span> <b>{{ pageName }}</b>
            </p>
          </div>

          <div class="hg-topbar-right">
            <NuxtLink
              class="hg-publish"
              to="/create"
            >
              <UIcon
                name="i-lucide-upload"
                aria-hidden="true"
              />
              发布作品
            </NuxtLink>

            <template v-if="session.token.value">
              <NuxtLink
                class="hg-credits"
                to="/wallet"
              >
                <UIcon
                  name="i-lucide-circle-dollar-sign"
                  class="hg3-coin"
                  aria-hidden="true"
                />
                {{ credits.toLocaleString() }} 积分
              </NuxtLink>
              <NuxtLink
                class="hg-icon-btn"
                to="/notifications"
                aria-label="通知"
              >
                <UIcon
                  name="i-lucide-bell"
                  aria-hidden="true"
                />
                <span
                  v-if="unread > 0"
                  class="hg-dot"
                />
              </NuxtLink>
              <div
                ref="accountWrapRef"
                class="hg-account-wrap"
              >
                <button
                  type="button"
                  class="hg-avatar"
                  aria-label="打开账户菜单"
                  :aria-expanded="accountOpen"
                  @click="onAccountToggle"
                >
                  <img
                    src="/images/daji-three-tail-front-v1.webp"
                    alt=""
                  >
                </button>
                <div
                  v-if="accountOpen"
                  class="hg-account-menu"
                >
                  <NuxtLink
                    to="/characters"
                    @click="accountOpen = false"
                  >
                    个人中心
                  </NuxtLink>
                  <NuxtLink
                    to="/works"
                    @click="accountOpen = false"
                  >
                    我的发布
                  </NuxtLink>
                  <NuxtLink
                    to="/wallet"
                    @click="accountOpen = false"
                  >
                    钱包与账单
                  </NuxtLink>
                  <NuxtLink
                    to="/models"
                    @click="accountOpen = false"
                  >
                    偏好设置
                  </NuxtLink>
                  <button
                    type="button"
                    @click="logout"
                  >
                    <UIcon
                      name="i-lucide-log-out"
                      aria-hidden="true"
                    />退出登录
                  </button>
                </div>
              </div>
            </template>

            <template v-else>
              <button
                type="button"
                class="hg-login"
                @click="openDialog({ reason: 'account' })"
              >
                登录
              </button>
              <button
                type="button"
                class="hg-register"
                @click="openDialog({ reason: 'account' })"
              >
                注册
              </button>
            </template>
          </div>
        </header>

        <main class="hg-content">
          <NuxtPage />
        </main>
      </div>

      <div
        v-if="searchOpen"
        class="hg-search-mask"
        @click.self="searchOpen = false"
      >
        <section
          class="hg-search"
          role="dialog"
          aria-modal="true"
          aria-label="搜索"
        >
          <label class="hg-search-field">
            <UIcon
              name="i-lucide-search"
              aria-hidden="true"
            />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="搜索工具、会话或页面"
              aria-label="搜索工具、会话或页面"
              @keydown="onSearchKeydown"
            >
            <button
              type="button"
              aria-label="关闭搜索"
              @click="searchOpen = false"
            >
              <UIcon name="i-lucide-x" />
            </button>
          </label>

          <p
            v-if="!searchQuery.trim()"
            class="hg-search-hint"
          >
            输入关键词搜索工具、历史会话或页面入口。
          </p>
          <p
            v-else-if="searchEmpty"
            class="hg-search-hint"
          >
            没有找到「{{ searchQuery }}」相关的结果。
          </p>
          <div
            v-else
            class="hg-search-results"
          >
            <template v-if="searchResults.tools.length">
              <h3>工具</h3>
              <button
                v-for="tool in searchResults.tools"
                :key="tool.id"
                type="button"
                @click="goSearch('/create')"
              >
                <UIcon
                  :name="tool.icon"
                  aria-hidden="true"
                />{{ tool.label }}
              </button>
            </template>
            <template v-if="searchResults.sessions.length">
              <h3>历史会话</h3>
              <button
                v-for="item in searchResults.sessions"
                :key="item.id"
                type="button"
                @click="goSearch(`/create?session=${encodeURIComponent(item.id)}`)"
              >
                <UIcon
                  name="i-lucide-history"
                  aria-hidden="true"
                />{{ item.title }}
              </button>
            </template>
            <template v-if="searchResults.pages.length">
              <h3>页面</h3>
              <button
                v-for="page in searchResults.pages"
                :key="page.to"
                type="button"
                @click="goSearch(page.to)"
              >
                <UIcon
                  name="i-lucide-arrow-up-right"
                  aria-hidden="true"
                />{{ page.label }}
              </button>
            </template>
          </div>
        </section>
      </div>

      <HgAuthDialog v-model:open="authOpen" />
    </div>
  </UApp>
</template>

<style scoped>
.hg-search-mask {
  position: fixed;
  inset: 0;
  z-index: 88;
  display: grid;
  place-items: start center;
  padding: 12vh 20px 20px;
  background: rgb(6 7 9 / 68%);
  backdrop-filter: blur(3px);
}
.hg-search {
  width: min(520px, 100%);
  padding: 14px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 16px;
  background: #1c1d21;
  box-shadow: 0 24px 70px #000a;
}
.hg-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--hg3-line-strong, rgb(255 255 255 / 14%));
  border-radius: 11px;
  background: #141519;
  color: var(--hg3-faint, #6e6b66);
}
.hg-search-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--hg3-ink, #f2f0ec);
  font-family: inherit;
  font-size: 14px;
  outline: none;
}
.hg-search-field button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.hg-search-hint {
  margin: 12px 4px 4px;
  color: var(--hg3-faint, #6e6b66);
  font-size: 12px;
}
.hg-search-results {
  display: grid;
  gap: 2px;
  max-height: 52vh;
  margin-top: 10px;
  overflow-y: auto;
}
.hg-search-results h3 {
  margin: 8px 6px 4px;
  color: var(--hg3-faint, #6e6b66);
  font-size: 11px;
  font-weight: 500;
}
.hg-search-results button {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--hg3-ink, #f2f0ec);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.hg-search-results button:hover {
  background: rgb(255 255 255 / 6%);
}
.hg-topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.rail-toggle {
  display: none;
}
.hg-account-wrap {
  position: relative;
}
.hg-account-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  display: grid;
  min-width: 168px;
  padding: 6px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 12px;
  background: #1c1d21;
  box-shadow: 0 18px 44px #0009;
}
.hg-account-menu a,
.hg-account-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--hg3-ink, #f2f0ec);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.hg-account-menu a:hover,
.hg-account-menu button:hover {
  background: rgb(255 255 255 / 7%);
}
.hg-login,
.hg-register {
  height: 34px;
  padding: 0 16px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.hg-login {
  border: 1px solid rgb(255 255 255 / 14%);
  background: transparent;
  color: var(--hg3-ink, #f2f0ec);
}
.hg-login:hover {
  background: rgb(255 255 255 / 6%);
}
.hg-register {
  border: 0;
  background: linear-gradient(135deg, var(--hg3-accent-hi, #f99749), var(--hg3-accent, #d9834d));
  color: var(--hg3-accent-ink, #3a2412);
  font-weight: 700;
}
.hg-rail-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(6 7 9 / 62%);
}

@media (max-width: 900px) {
  .rail-toggle {
    display: grid;
  }
  .hg-app.rail-open :deep(.hg-rail) {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    display: flex;
    width: min(84vw, 300px);
    height: 100vh;
  }
  .hg-register {
    display: none;
  }
}
</style>
