<script setup lang="ts">
// 登录原型：契约对齐 go-sdk /api/v1/account/auth/login（邮箱/用户名 + 密码 + Turnstile）。
const route = useRoute()
const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref('')

// 站点把登录验证方式配成 turnstile/both 时，后端要求 cf-turnstile-response；
// 拿不到 token 的提交必被拒（「turnstile token 为空」），所以这里必须真接上 widget。
const {
  host: turnstileHost,
  required: turnstileRequired,
  token: turnstileToken,
  error: turnstileError,
  init: initTurnstile,
  reset: resetTurnstile
} = useTurnstile()
onMounted(initTurnstile)

// 成功后回到来源页（只放行站内路径），没有来源就回首页。
function redirectTarget(): string {
  const raw = route.query.redirect
  const target = typeof raw === 'string' ? raw : ''
  return target.startsWith('/') ? target : '/'
}

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱与密码'
    return
  }
  if (turnstileRequired.value && !turnstileToken.value) {
    error.value = '请先完成人机验证'
    return
  }
  pending.value = true
  try {
    await useHougongApi().login(email.value.trim(), password.value, turnstileToken.value)
    await navigateTo(redirectTarget())
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '登录失败，请检查账号与密码'
    // Turnstile 的 token 是一次性的：失败后换一张，否则重试只会再失败一次。
    resetTurnstile()
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="auth-wrap">
    <form
      class="auth-card"
      @submit.prevent="submit"
    >
      <div class="auth-brand">
        <span
          class="brand-emblem"
          aria-hidden="true"
        >后</span>
        <div>
          <h1 class="auth-title">
            欢迎回来
          </h1>
          <p class="auth-sub">
            登录后宫，继续你的影像宇宙。
          </p>
        </div>
      </div>

      <label class="field">
        <span>邮箱</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
        >
      </label>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="输入密码"
        >
      </label>

      <p
        v-if="error"
        class="form-error"
      >
        {{ error }}
      </p>

      <!-- Turnstile widget 容器：站点要求人机验证时才渲染（useTurnstile 决定）。 -->
      <div
        v-if="turnstileRequired"
        ref="turnstileHost"
        class="turnstile-host"
      />
      <p
        v-if="turnstileError"
        class="form-error"
      >
        {{ turnstileError }}
      </p>

      <button
        type="submit"
        class="btn-primary btn-block"
        :disabled="pending"
      >
        {{ pending ? '登录中…' : '登录并继续' }}
      </button>

      <p class="auth-foot">
        还没有账号？
        <NuxtLink to="/auth/register">免费注册</NuxtLink>
      </p>
      <p
        v-if="turnstileRequired"
        class="turnstile-note"
      >
        提交由 Cloudflare Turnstile 保护
      </p>
    </form>
  </div>
</template>
