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
  { href: '#create', label: '总览', icon: 'overview' as const },
  { href: '#studio', label: '创作', icon: 'create' as const },
  { href: '#characters', label: '角色', icon: 'characters' as const },
  { href: '#stories', label: '故事', icon: 'stories' as const },
  { href: '#works', label: '作品', icon: 'works' as const }
]

const current = ref('总览')
</script>

<template>
  <UApp>
    <div class="app-shell">
      <!-- 通栏顶栏：横跨整屏，置于侧栏之上 -->
      <header class="top-bar">
        <div class="top-context">
          <strong>创作中心</strong>
          <small>Image Studio</small>
        </div>
        <div class="account-area">
          <button
            class="credits"
            type="button"
            aria-label="查看积分余额"
          >
            <span aria-hidden="true" />
            <strong>2,400</strong> 积分
          </button>
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
          <a
            class="brand"
            href="#create"
            aria-label="后宫创作首页"
            @click="current = '总览'"
          >
            <span
              class="brand-emblem"
              aria-hidden="true"
            >后</span>
            <strong>后宫</strong>
          </a>

          <nav
            class="rail-navigation"
            aria-label="主导航"
          >
            <a
              v-for="item in nav"
              :key="item.label"
              :href="item.href"
              :class="{ active: current === item.label }"
              @click="current = item.label"
            >
              <BrandNavIcon :name="item.icon" />
              <span class="nav-label">{{ item.label }}</span>
            </a>
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
            <button
              type="button"
              aria-label="通知"
            >
              <span
                class="i-lucide-bell"
                aria-hidden="true"
              />
              <span class="utility-label">通知</span>
            </button>
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
        <a
          v-for="item in nav"
          :key="item.label"
          :href="item.href"
          :class="{ active: current === item.label }"
          @click="current = item.label"
        >
          <BrandNavIcon :name="item.icon" />
          <span class="nav-label">{{ item.label }}</span>
        </a>
      </nav>
    </div>
  </UApp>
</template>
