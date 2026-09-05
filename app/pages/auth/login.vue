<script setup lang="ts">
// 登录原型：契约对齐 go-sdk /api/v1/account/auth/login（邮箱/用户名 + 密码 + Turnstile）。
const email = ref('')
const password = ref('')
const remember = ref(true)
const pending = ref(false)
const error = ref('')

function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱与密码'
    return
  }
  pending.value = true
  setTimeout(() => {
    pending.value = false
    navigateTo('/')
  }, 600)
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

      <div
        class="check-row"
        style="justify-content: space-between"
      >
        <label
          class="check-row"
          style="margin-top: 0"
        >
          <input
            v-model="remember"
            type="checkbox"
          >
          记住登录
        </label>
        <a href="#">忘记密码</a>
      </div>

      <p
        v-if="error"
        class="form-error"
      >
        {{ error }}
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
      <p class="turnstile-note">
        提交由 Cloudflare Turnstile 保护
      </p>
    </form>
  </div>
</template>
