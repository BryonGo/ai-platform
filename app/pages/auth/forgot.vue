<script setup lang="ts">
// 找回密码：契约对齐 go-sdk /api/v1/account/auth/code（发码）与 /account/auth/reset-pwd（重置）。
//
// 单页三段式，避免让用户在多页之间来回丢状态：
//   ① 输邮箱 → 发送验证码；
//   ② 输验证码 + 新密码 → 重置；
//   ③ 成功提示 → 去登录。
// 站点把验证方式配成 turnstile/both 时，发码接口要求带 cf-turnstile-response，
// 所以第 ① 步复用 useTurnstile（与登录/注册同一套判定）。
import { PASSWORD_HINT, PASSWORD_RE } from '~/utils/password'

// step 控制当前展示哪一段：email（发码）/ reset（重置）/ done（成功）。
const step = ref<'email' | 'reset' | 'done'>('email')
const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const sending = ref(false)
const submitting = ref(false)
const error = ref('')
// notice 是发码成功后的非错误提示（验证码已发出，请查收）。
const notice = ref('')

// 人机验证：仅发码这一步需要；后端要求时拿不到 token 会被拒。
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

// 站点要求人机验证、但还没拿到 token 时禁用发码按钮并给出明确状态。
const turnstileBlocked = computed(() => turnstileRequired.value && !turnstileToken.value)

// sendCode 发验证码：成功后进入重置段。
async function sendCode() {
  error.value = ''
  notice.value = ''
  if (!email.value.trim()) {
    error.value = '请输入注册邮箱'
    return
  }
  if (turnstileRequired.value && !turnstileToken.value) {
    error.value = '请先完成人机验证'
    return
  }
  sending.value = true
  try {
    await useHougongApi().sendAuthCode(email.value.trim(), turnstileToken.value)
    notice.value = `验证码已发送至 ${email.value.trim()}，请查收（5 分钟内有效）。`
    step.value = 'reset'
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '验证码发送失败，请稍后再试'
    // Turnstile 的 token 是一次性的：失败后换一张，否则重试只会再失败一次。
    resetTurnstile()
  } finally {
    sending.value = false
  }
}

// submitReset 提交验证码 + 新密码：成功后进入成功段。
async function submitReset() {
  error.value = ''
  if (!code.value.trim()) {
    error.value = '请输入验证码'
    return
  }
  if (!PASSWORD_RE.test(newPassword.value)) {
    error.value = PASSWORD_HINT
    return
  }
  if (!confirmPassword.value) {
    error.value = '请再次输入新密码以确认'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  submitting.value = true
  try {
    await useHougongApi().resetPassword({
      email: email.value.trim(),
      code: code.value.trim(),
      newPassword: newPassword.value
    })
    step.value = 'done'
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '重置失败，请稍后再试'
  } finally {
    submitting.value = false
  }
}

// 回到第 ① 步：邮箱填错或需要重新发码时用。
function backToEmail() {
  error.value = ''
  notice.value = ''
  step.value = 'email'
}
</script>

<template>
  <div class="auth-wrap">
    <form
      class="auth-card"
      @submit.prevent="step === 'email' ? sendCode() : submitReset()"
    >
      <div class="auth-brand">
        <span
          class="brand-emblem"
          aria-hidden="true"
        >后</span>
        <div>
          <h1 class="auth-title">
            找回密码
          </h1>
          <p class="auth-sub">
            用注册邮箱接收验证码，重设你的密码。
          </p>
        </div>
      </div>

      <!-- ① 输邮箱发码 -->
      <template v-if="step === 'email'">
        <label class="field">
          <span>注册邮箱</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
          >
        </label>

        <p
          v-if="error"
          class="form-error"
        >
          {{ error }}
        </p>

        <!-- Turnstile widget 容器：站点要求人机验证时才渲染（写法同登录/注册）。 -->
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
        <!-- 未拿到 token 时按钮禁用，必须说明原因；widget 可能加载失败，故给手动重载入口。 -->
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
          :disabled="sending || turnstileBlocked"
        >
          {{ sending ? '发送中…' : '发送验证码' }}
        </button>
      </template>

      <!-- ② 输验证码 + 新密码 -->
      <template v-else-if="step === 'reset'">
        <p
          v-if="notice"
          class="form-notice"
        >
          {{ notice }}
        </p>

        <label class="field">
          <span>邮箱验证码</span>
          <input
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="6 位数字验证码"
          >
        </label>

        <label class="field">
          <span>新密码</span>
          <input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            placeholder="至少 8 位，含字母与数字"
          >
        </label>

        <label class="field">
          <span>确认新密码</span>
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入新密码"
            aria-label="确认新密码"
          >
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
          :disabled="submitting"
        >
          {{ submitting ? '重置中…' : '重置密码' }}
        </button>
        <p class="auth-foot">
          <button
            type="button"
            class="link-btn"
            @click="backToEmail"
          >
            重新输入邮箱
          </button>
        </p>
      </template>

      <!-- ③ 成功提示 → 去登录 -->
      <template v-else>
        <p
          class="form-notice"
          role="status"
        >
          密码已重置成功，请用新密码登录。
        </p>
        <NuxtLink
          to="/auth/login"
          class="btn-primary btn-block"
        >
          去登录
        </NuxtLink>
      </template>

      <p
        v-if="step !== 'done'"
        class="auth-foot"
      >
        想起密码了？
        <NuxtLink to="/auth/login">返回登录</NuxtLink>
      </p>
      <p
        v-if="step === 'email' && turnstileRequired && turnstileToken"
        class="turnstile-note"
      >
        提交由 Cloudflare Turnstile 保护
      </p>
    </form>
  </div>
</template>
