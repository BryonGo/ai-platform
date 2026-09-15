<script setup lang="ts">
// 注册：契约对齐 /api/v1/account/auth/register。
//
// 只填邮箱与密码 —— 用户名由服务端按「邮箱前缀 + 随机后缀」自动生成，并且就是展示名，
// 注册后可在设置页自行修改；过去让用户先想一个用户名的做法已取消（2026-09 口径）。
const email = ref('')
const password = ref('')
const agreed = ref(false)
const pending = ref(false)
const error = ref('')

/**
 * 密码强度基线：与后端同一口径（≥8 位且同时含字母与数字）。
 *
 * 后端在 2026-09-15 的 fix(security) 里加了这条校验（注册/游客升级/改密/重置密码都走它），
 * 前端此前只判 ≥6 位、错误文案还写「6-18 位」—— 用户按前端规则填 6 位会被服务端拒，
 * 报错还来自后端，看起来像"前端没问题但注册失败"。这里对齐，避免两端口径漂移。
 */
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = '请填写邮箱与密码'
    return
  }
  if (!PASSWORD_RE.test(password.value)) {
    error.value = '密码至少 8 位，且需同时包含字母与数字'
    return
  }
  if (!agreed.value) {
    error.value = '请先阅读并同意服务条款与隐私政策'
    return
  }
  pending.value = true
  try {
    await useHougongApi().register({
      email: email.value.trim(),
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

      <p class="field-note">
        用户名由系统自动生成（形如 <code>asher_7f3a</code>），注册后可在设置页修改。
      </p>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          placeholder="至少 8 位，含字母与数字"
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
