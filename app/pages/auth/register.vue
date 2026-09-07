<script setup lang="ts">
// 注册原型：契约对齐 go-sdk /api/v1/account/auth/register + /auth/code。
const email = ref('')
const username = ref('')
const nickname = ref('')
const password = ref('')
const agreed = ref(false)
const pending = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!email.value.trim() || !username.value.trim() || password.value.length < 6) {
    error.value = '请填写邮箱、用户名与密码（6-18 位）'
    return
  }
  if (!agreed.value) {
    error.value = '请先阅读并同意服务条款与隐私政策'
    return
  }
  pending.value = true
  try {
    await useHougongApi().register({
      username: username.value.trim(),
      email: email.value.trim(),
      nickname: nickname.value.trim() || username.value.trim(),
      password: password.value
    })
    await navigateTo('/')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '注册失败'
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

      <label class="field">
        <span>用户名</span>
        <input
          v-model="username"
          type="text"
          autocomplete="username"
          minlength="4"
          maxlength="32"
          placeholder="4-32 位字母数字下划线"
        >
      </label>

      <label class="field">
        <span>昵称</span>
        <input
          v-model="nickname"
          type="text"
          maxlength="50"
          placeholder="作品署名"
        >
      </label>

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
