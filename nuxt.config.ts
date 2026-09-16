// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css', '~/assets/css/hougong3.css'],

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
      // 本地/dev 不传就是 'dev'。它同时被 server/api/version.get.ts 读取并在运行时返回，
      // 因此不需要把版本号写进代码，也不会与镜像 tag 漂移。
      buildVersion: process.env.NUXT_PUBLIC_BUILD_VERSION || 'dev',
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
    '/': { prerender: true },
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
  }
})
