<script setup lang="ts">
// 未登录时的登录弹窗（效果图 homepage-interactions 面板 04）。
// 契约：关闭即退回草稿，登录成功后由调用方回到费用确认，不自动扣费。
import { PASSWORD_HINT, PASSWORD_RE } from '~/utils/password'

const open = defineModel<boolean>('open', { required: true })

const hgApi = useHougongApi()
const { intent } = useAuthDialog()

const tab = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const agreed = ref(false)
const showPassword = ref(false)
const pending = ref(false)
const error = ref('')

// 站点要求人机验证时，这个弹窗同样是登录/注册入口 —— 少了它，从站内点「登录」
// 发出的请求就不带 cf-turnstile-response，后端必拒（2026-09-23 线上就是这么挂的：
// /auth/login 页修好了，但真正在用的这个弹窗漏了）。
const {
  host: turnstileHost,
  required: turnstileRequired,
  token: turnstileToken,
  error: turnstileError,
  siteKey: turnstileSiteKey,
  init: initTurnstile,
  reset: resetTurnstile
} = useTurnstile()

const heading = computed(() => intent.value.reason === 'publish' ? '登录后继续发布' : '登录后继续创作')
const emblemSrc = '/mock/home/emblem.png'

function close() {
  open.value = false
}

function reset() {
  error.value = ''
  password.value = ''
  agreed.value = false
  showPassword.value = false
}

// 打开时停在入口指定的页签：点「注册」直接进注册，不再让用户自己找页签。
watch(open, (value) => {
  if (value) {
    reset()
    tab.value = intent.value.mode ?? 'login'
    // widget 容器在 v-if="open" 里面，要等 DOM 出来才能渲染。
    void nextTick(initTurnstile)
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

// 登录/注册成功后的收尾：resume 是站内路径就跳过去，否则关闭、由调用方原位恢复。
function afterAuth() {
  const resume = intent.value.resume
  if (resume && resume.startsWith('/')) void navigateTo(resume)
  close()
}

async function submitLogin() {
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
    await hgApi.login(email.value.trim(), password.value, turnstileToken.value)
    afterAuth()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '登录失败，请检查账号与密码'
    resetTurnstile()
  } finally {
    pending.value = false
  }
}

// 注册只要邮箱 + 密码：用户名由服务端自动生成（并且就是展示名），注册后可在设置页修改。
async function submitRegister() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱与密码'
    return
  }
  if (!PASSWORD_RE.test(password.value)) {
    error.value = PASSWORD_HINT
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
    await hgApi.register({
      email: email.value.trim(),
      password: password.value,
      turnstileToken: turnstileToken.value
    })
    afterAuth()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '注册失败，请稍后重试'
    resetTurnstile()
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="hg-auth-mask"
      @click.self="close"
    >
      <section
        class="hg-auth"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hg-auth-title"
      >
        <header class="hg-auth-head">
          <img
            :src="emblemSrc"
            alt=""
            width="30"
            height="30"
          >
          <strong>后宫</strong>
          <button
            type="button"
            class="hg-auth-close"
            aria-label="关闭登录弹窗"
            @click="close"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </header>

        <h2 id="hg-auth-title">
          {{ heading }}
        </h2>

        <div
          class="hg-auth-tabs"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'login'"
            :class="{ active: tab === 'login' }"
            @click="tab = 'login'"
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'register'"
            :class="{ active: tab === 'register' }"
            @click="tab = 'register'"
          >
            注册
          </button>
        </div>

        <form
          v-if="tab === 'login'"
          @submit.prevent="submitLogin"
        >
          <label class="hg-field">
            <UIcon
              name="i-lucide-mail"
              aria-hidden="true"
            />
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="邮箱"
              aria-label="邮箱"
            >
          </label>
          <label class="hg-field">
            <UIcon
              name="i-lucide-lock"
              aria-hidden="true"
            />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="密码"
              aria-label="密码"
            >
            <button
              type="button"
              class="hg-field-eye"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
            </button>
          </label>

          <p
            v-if="error"
            class="hg-auth-error"
            role="alert"
          >
            {{ error }}
          </p>

          <button
            type="submit"
            class="hg-btn-primary hg-auth-submit"
            :disabled="pending"
          >
            {{ pending ? '登录中…' : '登录并继续' }}
          </button>

          <div class="hg-auth-foot">
            <span v-if="intent.reason === 'generate'">当前输入已在本页面保留</span>
          </div>
        </form>

        <form
          v-else
          @submit.prevent="submitRegister"
        >
          <label class="hg-field">
            <UIcon
              name="i-lucide-mail"
              aria-hidden="true"
            />
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="邮箱"
              aria-label="邮箱"
            >
          </label>
          <label class="hg-field">
            <UIcon
              name="i-lucide-lock"
              aria-hidden="true"
            />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="至少 8 位，含字母与数字"
              aria-label="密码"
            >
            <button
              type="button"
              class="hg-field-eye"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
            </button>
          </label>

          <p
            v-if="error"
            class="hg-auth-error"
            role="alert"
          >
            {{ error }}
          </p>

          <p class="hg-auth-note">
            用户名由系统自动生成，注册后可在设置页修改。
          </p>

          <label class="hg-auth-check">
            <input
              v-model="agreed"
              type="checkbox"
            >
            <span>我已阅读并同意服务条款与隐私政策</span>
          </label>

          <button
            type="submit"
            class="hg-btn-primary hg-auth-submit"
            :disabled="pending"
          >
            {{ pending ? '注册中…' : '注册并继续' }}
          </button>

          <div class="hg-auth-foot">
            <span />
            <span>当前输入已在本页面保留</span>
          </div>
        </form>

        <!-- Turnstile widget 挂在两个表单**之外**：切换登录/注册页签时 v-if/v-else 会重建
             表单内部节点，挂里面的话 widget 会跟着被卸载，用户就得重过一遍验证。
             写法与后台控制台一致（class + data-sitekey）。 -->
        <div
          v-if="turnstileRequired"
          ref="turnstileHost"
          class="cf-turnstile"
          :data-sitekey="turnstileSiteKey"
          data-action="turnstile-spin-v2"
        />
        <p
          v-if="turnstileError"
          class="hg-auth-error"
          role="alert"
        >
          {{ turnstileError }}
        </p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.hg-auth-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(6 7 9 / 68%);
  backdrop-filter: blur(3px);
}
.hg-auth {
  position: relative;
  width: min(380px, 100%);
  padding: 20px 22px 18px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 18px;
  background: #1c1d21;
  box-shadow: 0 24px 70px #000a;
  color: var(--hg3-ink, #fafafa);
}
.hg-auth-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hg-auth-head img {
  width: 30px;
  height: 30px;
  border-radius: 9px;
}
.hg-auth-head strong {
  font-size: 17px;
  font-weight: 800;
  background: linear-gradient(180deg, #ff8ad8, var(--hg3-accent, #e832b0));
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hg-auth-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hg3-muted, #949494);
  cursor: pointer;
}
.hg-auth-close:hover {
  background: #282828;
  color: var(--hg3-ink, #fafafa);
}
.hg-auth h2 {
  margin: 14px 0 16px;
  font-size: 21px;
  font-weight: 700;
}
.hg-auth-tabs {
  display: flex;
  gap: 18px;
  margin-bottom: 16px;
  border-bottom: 1px solid #282828;
}
.hg-auth-tabs button {
  position: relative;
  padding: 0 0 10px;
  border: 0;
  background: transparent;
  color: var(--hg3-muted, #949494);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.hg-auth-tabs button.active {
  color: var(--hg3-ink, #fafafa);
  font-weight: 600;
}
.hg-auth-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--hg3-accent, #e832b0);
  content: '';
}
.hg-field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  margin-bottom: 10px;
  padding: 0 12px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 10px;
  background: #141519;
  color: var(--hg3-faint, #6f6f6f);
}
.hg-field:focus-within {
  border-color: var(--hg3-accent-line, rgb(232 50 176 / 38%));
}
.hg-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--hg3-ink, #fafafa);
  font-family: inherit;
  font-size: 14px;
  outline: none;
}
.hg-field-eye {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  background: transparent;
  color: var(--hg3-faint, #6f6f6f);
  cursor: pointer;
}
.hg-auth-error {
  margin: 4px 0 8px;
  color: #ff8f8f;
  font-size: 12px;
}
.hg-auth-submit {
  width: 100%;
  height: 46px;
  margin-top: 6px;
  font-size: 15px;
}
.hg-auth-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  color: var(--hg3-faint, #6f6f6f);
  font-size: 12px;
}
.hg-auth-foot a {
  color: inherit;
  text-decoration: none;
}
.hg-auth-foot a:hover {
  color: var(--hg3-muted, #949494);
}
.hg-auth-note {
  margin: 12px 0 0;
  color: var(--hg3-faint, #6f6f6f);
  font-size: 11px;
  text-align: center;
}
.hg-auth-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  color: var(--hg3-muted, #949494);
  font-size: 12px;
}
.hg-auth-check input {
  width: 15px;
  height: 15px;
  flex: none;
}
</style>
