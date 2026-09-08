<script setup lang="ts">
import BrandNavIcon from './components/BrandNavIcon.vue'

useHead({
  htmlAttrs: { lang: 'zh-CN' },
  link: [{ rel: 'icon', href: '/favicon.ico' }]
})

useSeoMeta({
  title: '后宫 · AI 影像创作',
  description: '创建和发展你的成年角色，用 AI 生成图片与视频，构建私人影像宇宙。'
})

const nav = [
  { to: '/', label: '总览', icon: 'overview' as const },
  { to: '/create', label: '创作', icon: 'create' as const },
  { to: '/characters', label: '角色', icon: 'characters' as const },
  { to: '/stories', label: '故事', icon: 'stories' as const },
  { to: '/works', label: '作品', icon: 'works' as const },
  { to: '/assets', label: '素材库', icon: 'assets' as const },
  { to: '/models', label: '模型', icon: 'models' as const },
  { to: '/wallet', label: '钱包', icon: 'wallet' as const }
]

const route = useRoute()
const railCollapsed = ref(false)

// 顶栏：积分余额 + 未读通知角标（登录态下加载）
const topCredits = ref(0)
const unreadCount = ref(0)
onMounted(async () => {
  const session = useAuthSession()
  session.load()
  if (!session.token.value) return
  const api = useHougongApi()
  try {
    const [w, u] = await Promise.all([
      api.walletBalance().catch(() => null),
      api.unreadNotifications().catch(() => 0)
    ])
    if (w) topCredits.value = w.credits
    unreadCount.value = u || 0
  } catch { /* 忽略（未登录/接口暂不可用） */ }
})

function isActive(item: { to: string }) {
  if (item.to === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(item.to)
}

function toggleRail() {
  railCollapsed.value = !railCollapsed.value
}
</script>

<template>
  <UApp>
    <div
      class="app-shell"
      :class="{ 'rail-collapsed': railCollapsed }"
    >
      <!-- 通栏顶栏：横跨整屏；左侧组与主内容区起点对齐 -->
      <header class="top-bar">
        <div class="topbar-left">
          <button
            class="rail-toggle"
            type="button"
            :aria-label="railCollapsed ? '展开侧边栏' : '收起侧边栏'"
            :aria-expanded="!railCollapsed"
            @click="toggleRail"
          >
            <span
              :class="railCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
              aria-hidden="true"
            />
          </button>

          <NuxtLink
            class="home-link"
            to="/"
          >
            <span
              class="i-lucide-home"
              aria-hidden="true"
            />
            首页
          </NuxtLink>

          <span
            class="topbar-divider"
            aria-hidden="true"
          />

          <div class="top-context">
            <strong>创作中心</strong>
            <small>Image Studio</small>
          </div>
        </div>

        <div class="account-area">
          <NuxtLink
            class="credits"
            to="/wallet"
            aria-label="查看积分余额"
          >
            <span aria-hidden="true" />
            <strong>{{ topCredits.toLocaleString() }}</strong> 积分
          </NuxtLink>
          <NuxtLink
            class="notification-bell"
            to="/notifications"
            aria-label="通知"
          >
            <span
              class="i-lucide-bell"
              aria-hidden="true"
            />
            <span
              v-if="unreadCount > 0"
              class="bell-badge"
            >{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
          </NuxtLink>
          <button
            class="avatar"
            type="button"
            aria-label="打开账户菜单"
          >
            <img
              src="/images/daji-three-tail-front-v1.webp"
              alt=""
            >
          </button>
        </div>
      </header>

      <div class="shell-body">
        <aside class="side-rail">
          <NuxtLink
            class="brand"
            to="/"
            aria-label="后宫首页"
          >
            <span
              class="brand-emblem"
              aria-hidden="true"
            >后</span>
            <strong>后宫</strong>
          </NuxtLink>

          <nav
            class="rail-navigation"
            aria-label="主导航"
          >
            <NuxtLink
              v-for="item in nav"
              :key="item.label"
              :to="item.to"
              :class="{ active: isActive(item) }"
            >
              <BrandNavIcon :name="item.icon" />
              <span class="nav-label">{{ item.label }}</span>
            </NuxtLink>
          </nav>

          <div class="rail-utilities">
            <button
              class="language-switch"
              type="button"
              aria-label="切换语言，当前为简体中文"
            >
              <span
                class="i-lucide-languages"
                aria-hidden="true"
              />
              <span class="utility-label">简体中文</span>
            </button>
            <NuxtLink
              class="utility-link"
              to="/notifications"
              aria-label="通知"
            >
              <span
                class="i-lucide-bell"
                aria-hidden="true"
              />
              <span class="utility-label">通知</span>
            </NuxtLink>
            <button
              type="button"
              aria-label="设置"
            >
              <span
                class="i-lucide-settings-2"
                aria-hidden="true"
              />
              <span class="utility-label">设置</span>
            </button>
          </div>
        </aside>

        <div class="main-column">
          <main><NuxtPage /></main>
        </div>
      </div>

      <nav
        class="mobile-navigation"
        aria-label="移动端导航"
      >
        <NuxtLink
          v-for="item in nav"
          :key="item.label"
          :to="item.to"
          :class="{ active: isActive(item) }"
        >
          <BrandNavIcon :name="item.icon" />
          <span class="nav-label">{{ item.label }}</span>
        </NuxtLink>
      </nav>
    </div>
  </UApp>
</template>

<style scoped>
.notification-bell {
  position: relative;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--hg-muted, #666);
  border-radius: 999px;
  text-decoration: none;
}
.notification-bell:hover {
  background: var(--hg-amber, #f3e3c0);
  color: #333;
}
.bell-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 0.64rem;
  font-weight: 800;
  display: grid;
  place-items: center;
  line-height: 1;
}
.utility-link {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: inherit;
  text-decoration: none;
  width: 100%;
}
</style>
