<script setup lang="ts">
// 注册原型：契约对齐 go-sdk /api/v1/account/auth/register + /auth/code。
const email = ref('')
const code = ref('')
const password = ref('')
const agreed = ref(false)
const pending = ref(false)
const sending = ref(false)
const countdown = ref(0)
const error = ref('')

let timer: ReturnType<typeof setInterval> | undefined

function sendCode() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    error.value = '请先填写有效邮箱'
    return
  }
  error.value = ''
  sending.value = true
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      sending.value = false
      if (timer) {
        clearInterval(timer)
      }
    }
  }, 1000)
}

function submit() {
  error.value = ''
  if (!email.value.trim() || !code.value.trim() || password.value.length < 8) {
    error.value = '请填写邮箱、验证码，密码至少 8 位'
    return
  }
  if (!agreed.value) {
    error.value = '请先阅读并同意服务条款与隐私政策'
    return
  }
  pending.value = true
  setTimeout(() => {
    pending.value = false
    navigateTo('/')
  }, 600)
}

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
  }
})
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
            创建账号
          </h1>
          <p class="auth-sub">
            20 积分免费开始 · 素材仅用于执行生成任务。
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

      <div class="field">
        <span>邮箱验证码</span>
        <div class="field-row">
          <input
            v-model="code"
            class="grow"
            inputmode="numeric"
            maxlength="6"
            placeholder="6 位验证码"
          >
          <button
            type="button"
            class="code-btn"
            :disabled="sending"
            @click="sendCode"
          >
            {{ sending ? `${countdown}s` : '获取验证码' }}
          </button>
        </div>
      </div>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          placeholder="至少 8 位"
        >
      </label>

      <label class="check-row">
        <input
          v-model="agreed"
          type="checkbox"
        >
        <span>我已阅读并同意<a href="#">服务条款</a>与<a href="#">隐私政策</a></span>
      </label>

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
        {{ pending ? '创建中…' : '创建账号' }}
      </button>

      <p class="auth-foot">
        已经注册？
        <NuxtLink to="/auth/login">直接登录</NuxtLink>
      </p>
      <p class="turnstile-note">
        提交由 Cloudflare Turnstile 保护
      </p>
    </form>
  </div>
</template>
