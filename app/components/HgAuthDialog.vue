<script setup lang="ts">
// 未登录时的登录弹窗（效果图 homepage-interactions 面板 04）。
// 契约：关闭即退回草稿，登录成功后由调用方回到费用确认，不自动扣费。
const open = defineModel<boolean>('open', { required: true })

const hgApi = useHougongApi()
const session = useAuthSession()
const { intent } = useAuthDialog()

const tab = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const username = ref('')
const nickname = ref('')
const showPassword = ref(false)
const pending = ref(false)
const error = ref('')

const heading = computed(() => intent.value.reason === 'publish' ? '登录后继续发布' : '登录后继续创作')
const emblemSrc = '/mock/home/emblem.png'

function close() {
  open.value = false
}

function reset() {
  error.value = ''
  password.value = ''
  showPassword.value = false
}

watch(open, (value) => {
  if (value) {
    reset()
    tab.value = 'login'
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

async function submitLogin() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱与密码'
    return
  }
  pending.value = true
  try {
    await hgApi.login(email.value.trim(), password.value)
    close()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '登录失败，请检查账号与密码'
  } finally {
    pending.value = false
  }
}

async function submitRegister() {
  error.value = ''
  if (!username.value.trim() || !email.value.trim() || !password.value) {
    error.value = '请填写用户名、邮箱与密码'
    return
  }
  pending.value = true
  try {
    await hgApi.register({
      username: username.value.trim(),
      email: email.value.trim(),
      password: password.value,
      nickname: nickname.value.trim() || username.value.trim()
    })
    close()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '注册失败，请稍后重试'
  } finally {
    pending.value = false
  }
}

async function guest() {
  error.value = ''
  pending.value = true
  try {
    await hgApi.guestLogin()
    close()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '游客登录失败，请稍后重试'
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
            <a href="#">忘记密码</a>
            <span v-if="intent.reason === 'generate'">当前草稿已保留</span>
          </div>

          <button
            type="button"
            class="hg-auth-guest"
            :disabled="pending"
            @click="guest"
          >
            游客一键登录（无需注册）
          </button>
        </form>

        <form
          v-else
          @submit.prevent="submitRegister"
        >
          <label class="hg-field">
            <UIcon
              name="i-lucide-user-round"
              aria-hidden="true"
            />
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              placeholder="用户名"
              aria-label="用户名"
            >
          </label>
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
            {{ pending ? '注册中…' : '注册并继续' }}
          </button>

          <div class="hg-auth-foot">
            <span />
            <span>当前草稿已保留</span>
          </div>
        </form>

        <p class="hg-auth-note">
          当前登录态：{{ session.token.value ? '已登录' : '未登录' }}
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
  color: var(--hg3-ink, #f2f0ec);
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
  background: linear-gradient(180deg, #ffd79a, var(--hg3-accent, #d9834d));
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
  color: var(--hg3-muted, #9a9791);
  cursor: pointer;
}
.hg-auth-close:hover {
  background: rgb(255 255 255 / 8%);
  color: var(--hg3-ink, #f2f0ec);
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
  border-bottom: 1px solid rgb(255 255 255 / 8%);
}
.hg-auth-tabs button {
  position: relative;
  padding: 0 0 10px;
  border: 0;
  background: transparent;
  color: var(--hg3-muted, #9a9791);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.hg-auth-tabs button.active {
  color: var(--hg3-ink, #f2f0ec);
  font-weight: 600;
}
.hg-auth-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--hg3-accent, #d9834d);
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
  color: var(--hg3-faint, #6e6b66);
}
.hg-field:focus-within {
  border-color: var(--hg3-accent-line, rgb(217 131 77 / 38%));
}
.hg-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--hg3-ink, #f2f0ec);
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
  color: var(--hg3-faint, #6e6b66);
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
  color: var(--hg3-faint, #6e6b66);
  font-size: 12px;
}
.hg-auth-foot a {
  color: inherit;
  text-decoration: none;
}
.hg-auth-foot a:hover {
  color: var(--hg3-muted, #9a9791);
}
.hg-auth-guest {
  width: 100%;
  margin-top: 14px;
  padding: 9px 0;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 10px;
  background: transparent;
  color: var(--hg3-muted, #9a9791);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.hg-auth-guest:hover {
  background: rgb(255 255 255 / 5%);
  color: var(--hg3-ink, #f2f0ec);
}
.hg-auth-note {
  margin: 12px 0 0;
  color: var(--hg3-faint, #6e6b66);
  font-size: 11px;
  text-align: center;
}
</style>
