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

      <!-- Turnstile widget 容器：写法与后台控制台一致（class + data-sitekey），
           站点要求人机验证时才渲染。 -->
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
        {{ pending ? '登录中…' : '登录并继续' }}
      </button>

      <p class="auth-foot">
        还没有账号？
        <NuxtLink to="/auth/register">免费注册</NuxtLink>
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
