// https://nuxt.com/docs/api/configuration/nuxt-config
import { execSync } from 'node:child_process'

/**
 * 本地 dev 的版本号：dev-<短 sha>[-dirty]。
 *
 * 为什么需要：dev 下 NUXT_PUBLIC_BUILD_VERSION 没人传，版本就是字面量 'dev' ——
 * 它回答不了「现在跑的是哪一版代码」，而这恰恰是本地最常问的问题
 * （"我改了，dev server 到底有没有吃到"）。生产不受影响：compose 传了镜像 tag。
 *
 * 取**配置求值时**（≈ dev server 启动那一刻）的仓库状态，不是每次请求都算：
 *   · 这样它表达的是"这个进程是从哪一版启动的"，与后端 buildinfo 的口径一致；
 *   · 改动源码由 HMR 生效、版本号不变，所以它变了 = 需要重启（改了 nuxt.config
 *     这类不参与 HMR 的东西），这正是要看出来的信号。
 * 拿不到 git（没装、不在仓库里）就退回 'dev'，不影响启动。
 */
function devBuildVersion(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    if (!sha) return 'dev'
    // dirty 很关键：本地几乎总是带未提交改动在跑，只报 sha 会让人以为跑的就是那个提交。
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
    return `dev-${sha}${dirty ? '-dirty' : ''}`
  } catch {
    return 'dev'
  }
}

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css', '~/assets/css/hougong3.css', '~/assets/css/canvas.css'],

  runtimeConfig: {
    // 私有项：只在服务端可见，不会下发浏览器。
    // SSR 走容器内网直连（服务端内部请求不必绕公网域名）。
    // 注意 Host：站点按请求 Host 解析，容器内直连要用带站点域名的网络别名
    // （compose 里给 API 服务挂了 hougong.avmaker.ai 别名），否则会静默回落默认站。
    apiBaseInternal: process.env.NUXT_API_BASE_INTERNAL || '',
    public: {
      // 浏览器用：留空 = 同源 /api/v1，由本服务的 routeRules 代理到内网 API（无跨域）；
      // 也可填公网 API 域名直连。
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '',
      siteCode: process.env.NUXT_PUBLIC_SITE_CODE || 'default',
      // 本次运行的版本（浏览器缓存的那份前端是哪个版本）。生产由 compose 传
      // NUXT_PUBLIC_BUILD_VERSION=${HOUGONGWEB_IMAGE_TAG}（形如 20260914151045-96ce975）；
      // 本地/dev 不传则回落到 dev-<短 sha>[-dirty]（见 devBuildVersion）。它同时被
      // server/api/version.get.ts 读取并在运行时返回，因此不需要把版本号写进代码，
      // 也不会与镜像 tag 漂移。
      buildVersion: process.env.NUXT_PUBLIC_BUILD_VERSION || devBuildVersion(),
      // 版本检测节拍（毫秒）：轮询间隔 / 两次探测的最小间隔 / 检测到新版本后的自动刷新延迟。
      // 生产用默认值；本地与 e2e 可以调短，否则一个用例要等一分钟。
      versionPollMs: Number(process.env.NUXT_PUBLIC_VERSION_POLL_MS || 60000),
      // 画布（/canvas）开关：产品侧仍在开发，本地/dev 要能用、生产要屏蔽，
      // 因此走运行时配置而不是写死在代码里 —— 生产只改环境变量
      // （compose 的 NUXT_PUBLIC_CANVAS_ENABLED=false）即可屏蔽，不必改代码或回滚。
      // 默认开启，避免本地与 dev 被误关。
      canvasEnabled: process.env.NUXT_PUBLIC_CANVAS_ENABLED !== 'false',
      versionMinIntervalMs: Number(process.env.NUXT_PUBLIC_VERSION_MIN_INTERVAL_MS || 15000),
      versionAutoDelayMs: Number(process.env.NUXT_PUBLIC_VERSION_AUTO_DELAY_MS || 20000)
    }
  },

  routeRules: {
    // 首页**不做构建期预渲染**：技能卡封面是后端下发的 S3 限时签名地址
    // （X-Amz-Expires），预渲染会把"构建那一刻"的签名烤进 HTML，上线几个小时后
    // 全套封面 403。改走按请求 SSR：render 前由 useToolCatalogSsr() 现取目录，
    // 签名地址随每次请求刷新（见 app/composables/useToolCatalog.ts）。
    // 这里刻意**不挂 cache**：目录是运营随时会停用/排序的动态数据，缓存会撑长
    // "后台停用了、前台还在"的窗口。
    '/api/v1/**': { proxy: (process.env.API_PROXY || 'http://127.0.0.1:8201') + '/api/v1/**' }
  },

  devServer: {
    port: 3333
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  /**
   * 图标打包。
   *
   * @nuxt/icon 的客户端打包**默认只扫 .vue/.jsx/.tsx，而且 scan 默认关闭** ——
   * 我们的节点类型、端口、右键菜单的图标名写在数据表里（app/data/canvas-nodes.ts），
   * 于是这些图标一律没进客户端包：界面上该显示剪刀的地方只有一个空圈。
   * 这里两手都上：显式列出数据表里用到的图标（确定能进包），
   * 同时打开扫描并把 .ts 纳入范围（以后往数据文件里加图标也能自动带上）。
   */
  icon: {
    clientBundle: {
      icons: [
        'lucide:audio-lines',
        'lucide:clapperboard',
        'lucide:download',
        'lucide:film',
        'lucide:image',
        'lucide:image-plus',
        'lucide:list-tree',
        'lucide:list-video',
        'lucide:monitor',
        'lucide:mountain-snow',
        'lucide:package',
        'lucide:pen-line',
        'lucide:scissors',
        'lucide:scroll-text',
        'lucide:smartphone',
        'lucide:split',
        'lucide:square',
        'lucide:table',
        'lucide:type',
        'lucide:user-round'
      ],
      scan: {
        globInclude: ['**/*.{vue,ts,jsx,tsx,md,mdc,mdx}']
      }
    }
  }
})
