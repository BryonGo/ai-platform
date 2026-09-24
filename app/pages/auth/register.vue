<script setup lang="ts">
// 注册：契约对齐 /api/v1/account/auth/register。
//
// 只填邮箱与密码 —— 用户名由服务端按「邮箱前缀 + 随机后缀」自动生成，并且就是展示名，
// 注册后可在设置页自行修改；过去让用户先想一个用户名的做法已取消（2026-09 口径）。
import { PASSWORD_HINT, PASSWORD_RE } from '~/utils/password'

const route = useRoute()
const email = ref('')
const password = ref('')
// 确认密码只在本地比对，不提交给 API（register 的字段仍是 email + password）。
const confirmPassword = ref('')
const agreed = ref(false)
const pending = ref(false)
const error = ref('')

// 站点要求人机验证时，注册同样必须带 cf-turnstile-response（与登录同一套判定）。
const {
  host: turnstileHost,
  required: turnstileRequired,
  token: turnstileToken,
  error: turnstileError,
  siteKey: turnstileSiteKey,
  retrying: turnstileRetrying,
  init: initTurnstile,
  reset: resetTurnstile,
  retry: retryTurnstile
} = useTurnstile()
onMounted(initTurnstile)

// 站点要求人机验证、但还没拿到 token 时禁用提交并给出明确状态。
// `ready` 只代表 render 调用过，不代表 token 到位，所以判据只能是 token 本身。
const turnstileBlocked = computed(() => turnstileRequired.value && !turnstileToken.value)

// 成功后回到来源页（只放行站内路径），没有来源就回首页。
function redirectTarget(): string {
  const raw = route.query.redirect
  const target = typeof raw === 'string' ? raw : ''
  return target.startsWith('/') ? target : '/'
}

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = '请填写邮箱与密码'
    return
  }
  if (!PASSWORD_RE.test(password.value)) {
    error.value = PASSWORD_HINT
    return
  }
  if (!confirmPassword.value) {
    error.value = '请再次输入密码以确认'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  if (!agreed.value) {
    error.value = '请先阅读并同意服务条款与隐私政策'
    return
  }
  if (turnstileRequired.value && !turnstileToken.value) {
    error.value = '请先完成人机验证'
    return
  }
  pending.value = true
  try {
    await useHougongApi().register({
      email: email.value.trim(),
      password: password.value,
      turnstileToken: turnstileToken.value
    })
    await navigateTo(redirectTarget())
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '注册失败'
    // token 一次性：失败后换一张。
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
            创建账号
          </h1>
          <p class="auth-sub">
            素材仅用于执行生成任务。
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

      <label class="field">
        <span>确认密码</span>
        <input
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="再次输入密码"
          aria-label="确认密码"
        >
      </label>

      <label class="check-row">
        <input
          v-model="agreed"
          type="checkbox"
        >
        <span>我已阅读并同意服务条款与隐私政策</span>
      </label>

      <p
        v-if="error"
        class="form-error"
      >
        {{ error }}
      </p>

      <!-- Turnstile widget 容器：写法与后台控制台一致（class + data-sitekey）。 -->
      <div
        v-if="turnstileRequired"
        ref="turnstileHost"
        class="cf-turnstile"
        :data-sitekey="turnstileSiteKey"
        data-action="turnstile-spin-v2"
      />
      <p
        v-if="turnstileError"
        class="form-error"
        role="alert"
      >
        {{ turnstileError }}
      </p>
      <!-- 未拿到 token 时按钮禁用，必须说明原因，否则用户只看到「点不动」；
           widget 可能加载失败，所以再给一个手动重载入口（远端 ff13085 的语义）。 -->
      <p
        v-if="turnstileBlocked"
        class="turnstile-hint"
      >
        {{ turnstileError ? '人机验证未就绪，请刷新页面或更换浏览器后重试' : '请完成上方的人机验证后继续' }}
      </p>
      <div
        v-if="(turnstileRequired && !turnstileToken) || turnstileError"
        class="turnstile-help"
      >
        <span v-if="!turnstileError">验证进行中；若没有看到验证框，请重新加载。</span>
        <button
          type="button"
          class="turnstile-retry"
          :disabled="turnstileRetrying"
          @click="retryTurnstile"
        >
          {{ turnstileRetrying ? '正在重新加载…' : '重新加载验证' }}
        </button>
      </div>

      <button
        type="submit"
        class="btn-primary btn-block"
        :disabled="pending || turnstileBlocked"
      >
        {{ pending ? '创建中…' : '创建账号' }}
      </button>

      <p class="auth-foot">
        已经注册？
        <NuxtLink to="/auth/login">直接登录</NuxtLink>
      </p>
      <p
        v-if="turnstileRequired && turnstileToken"
        class="turnstile-note"
      >
        提交由 Cloudflare Turnstile 保护
      </p>
    </form>
  </div>
</template>
