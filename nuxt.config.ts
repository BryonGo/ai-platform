// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true },
    '/api/v1/**': { proxy: (process.env.API_PROXY || 'http://127.0.0.1:8201') + '/api/v1/**' }
  },

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
      siteCode: process.env.NUXT_PUBLIC_SITE_CODE || 'default'
    }
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
