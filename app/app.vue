<script setup lang="ts">
import type { SessionItem } from '~/composables/useHougongApi'
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
/* 生成任务的全局轻提示：完成/失败时右下角弹条（轮询为主 + SSE 加速，详见 useTaskNotifier） */
const { toasts: taskToasts, dismissToast: dismissTaskToast } = useTaskNotifier()

/* 品牌徽标：从品牌母版裁出的狐狸头像（public/mock/home/emblem.png）。
   用绑定而不是静态 src，避免 Vite 把 public 路径当模块解析。 */
const emblemSrc = '/mock/home/emblem.png'

/* 导航图标为彩色线性图标：色值取自参考图逐像素实测，同一功能保持同一颜色 */
/* 一级导航：平铺，不再分「我的资产」组。
 *
 * 2026-09-22 收口：按原型（public/prototypes/hougong-oii.html）重排 ——
 *   工作室 · 首页 · 技能 · 资产 · TV 频道 · 我的发布
 * 三处改名与两处撤下的理由：
 *   - 「全部工具」→「技能」：前台叫法是"技能"，和 /skill 的语义一致（路由暂时仍走 /effects）。
 *   - 「素材」→「资产」：页内本来就是"资产/素材"混用，统一成资产。
  *   - 「画布」撤下侧栏入口（`canvasFeatureEnabled()` 生产为关），/canvas 路由与页面都还在，
  *     直接敲 URL 依旧可用。
 *   - 「我的画布」同样撤下入口，/canvases 路由与页面保留。
 *   - 「探索」是首页区块的锚点，区块本身滚得到，不再单独占一个导航项。
 *   - 角色资产（/characters）的入口不进侧栏：它要收进「资产」页里当「演员库」页签
 *     （见 config/features.ts 的 characterAssets）。
 */
const navMain = [
  { to: '/', label: '首页', icon: 'i-lucide-house', color: 'var(--hg3-i-orange)' },
  // 工作室 = 创作工作台（/create）。原先它是侧栏顶部的「创作」主按钮，
  // 现在按原型改成一级导航项，位置就在「首页」下面。
  { to: '/create', label: '工作室', icon: 'i-lucide-sparkles', color: 'var(--hg3-i-coral)' },
  { to: '/effects', label: '技能', icon: 'i-lucide-layout-grid', color: 'var(--hg3-i-amber)' },
  { to: '/assets', label: '资产', icon: 'i-lucide-images', color: 'var(--hg3-i-blue)' },
  { to: '/tv', label: 'TV 频道', icon: 'i-lucide-tv', color: 'var(--hg3-i-green)' },
  { to: '/works', label: '我的发布', icon: 'i-lucide-send', color: 'var(--hg3-i-violet)' }
]
const navBottom = [
  { to: '/notifications', label: '通知', icon: 'i-lucide-bell', color: 'var(--hg3-i-coral)' },
  { to: '/settings', label: '设置', icon: 'i-lucide-settings', color: 'var(--hg3-i-gray)' }
]

/* 未登录时的「最近会话」由 mock 兜底的时代结束了：后端 listSessions 需要登录态，
   拿不到就**什么都不显示**（模板里 v-if 挡着），不再摆三条编出来的会话名。
   编出来的条目点进去只会开一个不存在的会话，而且它出现在"最近"这个词下面。 */
const recentSessions = ref<{ id: string, title: string }[]>([])

// 搜索不再是一个浮层：点侧栏「搜索」直接进独立搜索页 /search（结果可刷新/分享/后退）。
// 页面见 app/pages/search.vue。
const accountOpen = ref(false)
const accountWrapRef = ref<HTMLElement | null>(null)
const railOpen = ref(false)
// 原型的点阵尾迹：仅指针移动时更新，760ms 后自然衰减；触摸与减少动态效果时跳过。
const dotTrailRef = ref<HTMLElement | null>(null)
const dotTrails: { el: HTMLElement, born: number }[] = []
let dotTrailIndex = 0
let lastDotTrail = 0
let dotTrailFrame = 0
function fadeDotTrails(now: number) {
  let live = false
  for (const trail of dotTrails) {
    const age = now - trail.born
    if (trail.born && age < 760) {
      trail.el.style.opacity = String(0.9 * (1 - age / 760))
      live = true
    } else {
      trail.el.style.opacity = '0'
    }
  }
  dotTrailFrame = live ? requestAnimationFrame(fadeDotTrails) : 0
}
function onDotPointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const now = performance.now()
  if (now - lastDotTrail < 28 || !dotTrailRef.value) return
  lastDotTrail = now
  const trail = dotTrails[dotTrailIndex++ % dotTrails.length]
  if (!trail) return
  const bounds = dotTrailRef.value.getBoundingClientRect()
  const x = event.clientX - bounds.left - 120
  const y = event.clientY - bounds.top - 120
  trail.born = now
  trail.el.style.transform = `translate(${x}px, ${y}px)`
  trail.el.style.backgroundPosition = `${-x}px ${-y}px`
  if (!dotTrailFrame) dotTrailFrame = requestAnimationFrame(fadeDotTrails)
}
onMounted(() => {
  dotTrails.push(...Array.from(dotTrailRef.value?.children || [], el => ({ el: el as HTMLElement, born: 0 })))
})
onBeforeUnmount(() => {
  if (dotTrailFrame) cancelAnimationFrame(dotTrailFrame)
  dotTrails.length = 0
})
/**
 * 侧栏收起态（只留图标）。
 *
 * 画布是"横向空间就是生产力"的页面：一动手画布，那条约 17vw 的侧栏就该让位，
 * 只剩一条图标竖条（点图标仍能导航，也能再展开）。状态放 `useState` 里，
 * 因为**触发收起的是画布页**（点画布那一刻），而这条栏画在 app.vue 的壳上。
 */
const railCollapsed = useState('hg-rail-collapsed', () => false)
// 对话创作页需要占满可视高度（输入器贴底、消息区独立滚动），
// 因此让主内容区去掉通用内边距，由页面自己排布。
const isFullBleed = computed(() => route.path.startsWith('/create') || route.path.startsWith('/canvas'))
const credits = ref(0)
const unread = ref(0)

const PAGE_NAMES: Record<string, string> = {
  '/': '首页',
  '/create': '工作室',
  '/effects/image': '图片技能',
  '/effects/video': '视频技能',
  '/effects': '技能',
  // 技能详情页（/tool/<code>）：原来没有任何键命中，面包屑一直回落成「创作」。
  '/tool': '技能',
  '/explore': '探索',
  '/canvases': '我的画布',
  '/canvas': '画布',
  '/assets/temp': '临时资产',
  '/assets/trash': '回收站',
  '/assets': '资产',
  '/actors/mine': '我的演员',
  '/actors/new': '新建演员',
  '/actors': '演员库',
  '/tv': 'TV 频道',
  '/works': '我的发布',
  '/wallet/ledger': '金币流水',
  '/wallet/recharge': '充值',
  '/wallet/orders': '订单',
  '/wallet/membership': '会员',
  '/wallet': '钱包与账单',
  '/notifications': '通知',
  '/search': '搜索',
  '/stories': '故事',
  '/auth/login': '登录',
  '/auth/register': '注册'
}
const pageName = computed(() => {
  const path = route.path.replace(/\/$/, '') || '/'
  if (PAGE_NAMES[path]) return PAGE_NAMES[path]
  // 前缀匹配取首个命中，所以**更长的键必须排在更短的键前面**（'/canvases' 要在 '/canvas' 前），
  // 否则 /canvases 会被 '/canvas' 抢先匹配，面包屑显示成「画布」。
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
// 登录弹窗关闭或成功后刷新顶栏金币 / 最近会话
watch(authOpen, (value, previous) => {
  if (previous && !value) void loadShellData()
})
watch(() => route.fullPath, () => {
  railOpen.value = false
  accountOpen.value = false
  // 离开画布就把侧栏展开：收起态是"在画布上干活时"的，跟着走到别的页面会显得栏丢了。
  if (!route.path.startsWith('/canvas')) railCollapsed.value = false
})
</script>

<template>
  <UApp>
    <div
      class="hg-app"
      :class="{ 'rail-open': railOpen, 'rail-collapsed': railCollapsed, 'full-bleed': isFullBleed }"
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
        <!-- 收起 / 展开：收起后是**唯一**留在栏上的控件（否则一旦收起就没路回来） -->
        <button
          type="button"
          class="hg-rail-collapse"
          :aria-label="railCollapsed ? '展开侧栏' : '收起侧栏'"
          :title="railCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="railCollapsed = !railCollapsed"
        >
          <UIcon :name="railCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" />
        </button>

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
                :title="item.label"
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
                :title="item.label"
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
            <!-- 搜索：它是查找入口而不是导航目的地，所以排在一级导航之后，
                 不跟「首页 / 工作室 / 技能…」混在一起抢位置。
                 点它进独立搜索页 /search（结果可刷新/分享/后退），不再是 shell 内浮层。 -->
            <NuxtLink
              class="hg-nav-item"
              to="/search"
              title="搜索"
            >
              <UIcon
                name="i-lucide-search"
                style="color: var(--hg3-i-blue)"
                aria-hidden="true"
              />
              <span class="hg-nav-label">搜索</span>
            </NuxtLink>
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
                :title="item.title"
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
                :title="item.label"
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
                :title="item.label"
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

          <!-- 协议链接固定在侧栏底部稳定位置，不随信息流滚动（首页设计说明第 4 条批注）。
               条款正文页尚未上线，这里先渲染为普通文本 —— 保留 # 空链会让用户点了没反应。 -->
          <p class="hg-legal">
            <span>隐私政策</span>
            <span>用户协议</span>
          </p>
        </div>
      </aside>

      <div
        class="hg-main"
        @pointermove="onDotPointerMove"
      >
        <div
          ref="dotTrailRef"
          class="hg-dot-trails"
          aria-hidden="true"
        >
          <span
            v-for="index in 18"
            :key="index"
          />
        </div>
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
                {{ credits.toLocaleString() }} 金币
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
                  aria-haspopup="menu"
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
                  <!-- 「个人中心」= 账号资料页（/settings，含昵称/头像等资料的查看与编辑）。
                       以前它挂在 FEATURES.characterAssets 上指向 /characters，该开关为 false，
                       入口等于消失；这里改成始终可见并指向真正管资料的那一页。 -->
                  <NuxtLink
                    to="/settings"
                    @click="accountOpen = false"
                  >
                    <UIcon
                      name="i-lucide-circle-user"
                      aria-hidden="true"
                    />个人中心
                  </NuxtLink>
                  <NuxtLink
                    to="/works"
                    @click="accountOpen = false"
                  >
                    <UIcon
                      name="i-lucide-send"
                      aria-hidden="true"
                    />我的发布
                  </NuxtLink>
                  <!-- 充值 / 订单各有独立地址（/wallet/recharge、/wallet/orders），
                       不再是同一个钱包页的 ?tab= 滚动落点。 -->
                  <NuxtLink
                    to="/wallet/recharge"
                    @click="accountOpen = false"
                  >
                    <UIcon
                      name="i-lucide-circle-dollar-sign"
                      aria-hidden="true"
                    />充值
                  </NuxtLink>
                  <NuxtLink
                    to="/wallet/orders"
                    @click="accountOpen = false"
                  >
                    <UIcon
                      name="i-lucide-receipt-text"
                      aria-hidden="true"
                    />订单
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
                @click="openDialog({ reason: 'account', mode: 'login' })"
              >
                登录
              </button>
              <button
                type="button"
                class="hg-register"
                @click="openDialog({ reason: 'account', mode: 'register' })"
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

      <HgAuthDialog v-model:open="authOpen" />

      <!-- 生成任务完成/失败的全局轻提示：右下角胶囊堆栈，点一下即消（详见 useTaskNotifier） -->
      <div
        v-if="taskToasts.length"
        class="hg-task-toasts"
        aria-live="polite"
      >
        <button
          v-for="t in taskToasts"
          :key="t.id"
          type="button"
          class="hg-task-toast"
          :class="t.kind === 'ok' ? 'is-ok' : 'is-fail'"
          @click="dismissTaskToast(t.id)"
        >
          {{ t.text }}
        </button>
      </div>

      <!-- 站点 18+ 年龄门：服务端说需要过门且本浏览器未过时遮住整页。
           挂在应用壳最外层，任何页面（含直接深链进入）都拦得住。 -->
      <AppAgeGate />

      <!-- 新版本提示条：全局挂载，任何页面都检测得到（详见 useVersionWatcher） -->
      <HgUpdateBar />
    </div>
  </UApp>
</template>

<style scoped>
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
  /* 移动端：顶栏右侧贴着屏幕边，菜单靠 right:0 向左展开，加个上限别顶出视口。 */
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 80px);
  padding: 6px;
  overflow-y: auto;
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
  color: var(--hg3-ink, #fafafa);
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
  border: 1px solid #333;
  background: transparent;
  color: var(--hg3-ink, #fafafa);
}
.hg-login:hover {
  background: #1e1e1e;
}
.hg-register {
  border: 0;
  background: linear-gradient(135deg, var(--hg3-accent-hi, #f347bc), var(--hg3-accent, #e832b0));
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
