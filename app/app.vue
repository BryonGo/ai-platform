<script setup lang="ts">
import type { SessionItem } from '~/composables/useHougongApi'
import { canvasFeatureEnabled, FEATURES } from '~/config/features'
import AppAgeGate from './components/AppAgeGate.vue'

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

/** 登录态。侧栏里有几项是「进入后才有的东西」（登录才能看的探索流、只有自己才有的
 *  最近会话），未登录时它们要么指向一个不存在的区块、要么只能拿示例数据充数 ——
 *  两种都是假装，所以直接不出现。会话恢复是异步的，因此必须用 computed 而不是
 *  在 setup 里读一次快照，否则 cookie 换回 token 后侧栏不会更新。 */
const loggedIn = computed(() => !!session.token.value)

/* 侧栏底部展示的版本号：客户端（前台产物）与服务端（Go API）各一个。
   两条发布链彼此独立，并排显示用于一眼核对「这次是不是只发了半边」；
   刻意不判断两者是否相等（编号规则与仓库都不同，比相等没有意义）。 */
const {
  clientVersion,
  serverVersion,
  serverCommit,
  serverBuildTime,
  serverStartedAt,
  loading: versionLoading,
  failed: versionFailed,
  load: loadVersions
} = useAppVersions()
const { open: authOpen, openDialog } = useAuthDialog()

/* 品牌徽标：从品牌母版裁出的狐狸头像（public/mock/home/emblem.png）。
   用绑定而不是静态 src，避免 Vite 把 public 路径当模块解析。 */
const emblemSrc = '/mock/home/emblem.png'

/* 导航图标为彩色线性图标：色值取自参考图逐像素实测，同一功能保持同一颜色 */
/* 「画布」是产品侧并发开发中的功能，生产先用 canvasFeatureEnabled() 屏蔽入口
   （见 config/features.ts）；直接访问 /canvas 另由 canvas-gate.global.ts 拦回首页。 */
const canvasOn = canvasFeatureEnabled()
const navMain = computed(() => [
  { to: '/', label: '首页', icon: 'i-lucide-house', color: 'var(--hg3-i-orange)' },
  { to: '/effects', label: '全部工具', icon: 'i-lucide-layout-grid', color: 'var(--hg3-i-coral)' },
  ...(canvasOn
    ? [{ to: '/canvas', label: '画布', icon: 'i-lucide-brush', color: 'var(--hg3-i-amber)' }]
    : []),
  // 「探索」是首页那个区块的锚点（/#explore），而那个区块未登录时不渲染 ——
  // 留着它就是一个点了没反应的入口。
  ...(loggedIn.value
    ? [{ to: '/#explore', label: '探索', icon: 'i-lucide-compass', color: 'var(--hg3-i-green)' }]
    : [])
])
// 「我的资产」下的入口。
//
// 图片/视频原来是两个平级入口，但它们指向**同一个页面**（只差一个 kind 查询参数），
// 而页面本身叫「素材」—— 三套叫法互相不一致。现在收敛成：一个「素材」入口，
// 图片/视频在页面内做成页签（一处管理、多选可跨类型）。
const navAssets = [
  { to: '/assets', label: '素材', icon: 'i-lucide-images', color: 'var(--hg3-i-blue)' },
  // 角色资产的入口按 FEATURES.characterAssets 决定是否出现；页面与接口都还在，
  // 直接访问 /characters 依旧可用（见 config/features.ts）。
  { to: '/characters', label: '角色资产', icon: 'i-lucide-user-round', color: 'var(--hg3-i-green)', feature: 'characterAssets' as const },
  { to: '/works', label: '我的发布', icon: 'i-lucide-send', color: 'var(--hg3-i-amber)' }
].filter(item => !item.feature || FEATURES[item.feature])
const navBottom = [
  { to: '/notifications', label: '通知', icon: 'i-lucide-bell', color: 'var(--hg3-i-coral)' },
  { to: '/settings', label: '设置', icon: 'i-lucide-settings', color: 'var(--hg3-i-gray)' }
]

/* 未登录时的「最近会话」由 mock 兜底的时代结束了：后端 listSessions 需要登录态，
   拿不到就**什么都不显示**（模板里 v-if 挡着），不再摆三条编出来的会话名。
   编出来的条目点进去只会开一个不存在的会话，而且它出现在"最近"这个词下面。 */
const recentSessions = ref<{ id: string, title: string }[]>([])

/* 侧栏「搜索」（上一轮交互标注 a）：搜工具、会话与页面，纯前端过滤已有数据 */
const searchOpen = ref(false)
const searchQuery = ref('')
/** 工具搜索的数据源：与首页/效果页同一份目录（useState 共享，不会多打接口）。 */
const toolCatalog = useToolCatalog()
const SEARCH_PAGES = [
  { label: '创作首页', to: '/' },
  { label: '对话创作', to: '/create' },
  { label: '全部工具', to: '/effects' },
  { label: '我的资产', to: '/assets' },
  { label: '角色资产', to: '/characters', feature: 'characterAssets' as const },
  { label: '我的发布', to: '/works' },
  { label: '钱包与账单', to: '/wallet' },
  { label: '设置', to: '/settings' }
].filter(item => !item.feature || FEATURES[item.feature])

const searchResults = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) return { tools: [], sessions: [], pages: [] }
  const hit = (text: string) => text.toLowerCase().includes(keyword)
  return {
    // 工具结果走**真实目录**（后台「创作工具」维护），不再搜写死的 HOME_TOOLS 示例清单 ——
    // 那份清单里的工具本站可能根本没有（名字/入口都是编的），点进去只会被后端拒绝；
    // 而且它与首页「全部工具」是两个数据源，同一件事两处口径必然对不上。
    tools: toolCatalog.tools.value
      .filter(tool => hit(tool.name) || hit(tool.code) || hit(tool.summary || ''))
      .slice(0, 5)
      .map(tool => ({
        id: tool.code,
        icon: tool.icon || 'i-lucide-sparkles',
        label: tool.name,
        to: `/tool/${tool.code}`
      })),
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
  // 打开搜索时确保目录已拉取：目录是 useState 共享的，已加载过就是空操作。
  // 少了这一下，在没调用过 ensure() 的页面里搜索会永远搜不到工具。
  void toolCatalog.ensure()
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
const isFullBleed = computed(() => route.path.startsWith('/create') || route.path.startsWith('/canvas'))
const credits = ref(0)
const unread = ref(0)

const PAGE_NAMES: Record<string, string> = {
  '/': '首页',
  '/create': '对话创作',
  '/effects': '全部工具',
  '/canvas': '画布',
  '/assets': '素材',
  '/characters': '角色资产',
  '/works': '我的发布',
  '/wallet': '钱包与账单',
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
  // load() 内含一次 auto-login：用 HttpOnly Cookie 把内存会话恢复回来，必须 await，
  // 否则下面的钱包/通知请求会以未登录态发出。
  await session.load()
  if (!session.token.value) {
    recentSessions.value = []
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
  recentSessions.value = sessions.map(item => ({ id: String(item.id), title: item.title || '未命名会话' }))
}

onMounted(loadShellData)
// 版本号只在客户端取：SSR 阶段取到的内网版本对浏览器没有意义，也会拖慢首屏。
onMounted(() => loadVersions())
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
            <!-- 搜索：原排在「首页」之上、与一级导航混在一起，位置抢了首页的头部。
                 它是查找入口而不是导航目的地，下移到「我的资产」整组之后 ——
                 既不再顶在最上面，也仍在侧栏可见区内。 -->
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
          </nav>

          <!-- 没有真实会话（未登录 / 新账号）时整块不出现：一个「最近会话」标题下面
               空着，比不显示更让人以为加载坏了。 -->
          <template v-if="recentSessions.length">
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
          </template>
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
          <!-- 版本号：就放在「设置」下面（底部导航之后、协议链接之前）。
               服务端/客户端分开显示 —— 两条发布链独立，可能只发了半边。 -->
          <div
            class="hg-rail-version"
            :title="`服务端构建时间 ${serverBuildTime || '未知'}｜进程启动 ${serverStartedAt || '未知'}`"
          >
            <p class="hg-rail-version__row">
              <span>服务端</span>
              <code>{{ serverVersion || (versionLoading ? '…' : (versionFailed ? '未知' : '—')) }}</code>
              <em v-if="serverCommit">{{ serverCommit }}</em>
            </p>
            <p class="hg-rail-version__row">
              <span>客户端</span>
              <code>{{ clientVersion || (versionLoading ? '…' : (versionFailed ? '未知' : '—')) }}</code>
            </p>
          </div>

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
                    v-if="FEATURES.characterAssets"
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
                    to="/settings"
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
                @click="goSearch(tool.to)"
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

      <!-- 站点 18+ 年龄门：服务端说需要过门且本浏览器未过时遮住整页。
           挂在应用壳最外层，任何页面（含直接深链进入）都拦得住。 -->
      <AppAgeGate />

      <!-- 新版本提示条：全局挂载，任何页面都检测得到（详见 useVersionWatcher） -->
      <HgUpdateBar />
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
