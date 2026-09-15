<script setup lang="ts">
// 设置页：账号（用户名）与成人内容偏好。
//
// 账号部分的口径（2026-09）：注册只填邮箱，用户名由服务端按「邮箱前缀 + 随机后缀」
// 自动生成，用户可在这里自行修改；用户名同时就是展示名，改名后展示名一并跟随。
// 成人内容部分：全站按 18+ 处理，成人内容**默认显示**；这里提供
// "我不想看成人内容"（随时可逆的个人偏好）与"清除本浏览器的入口确认"两个出口。
const gate = useAdultGate()
const session = useAuthSession()
const hgApi = useHougongApi()

useSeoMeta({ title: '设置 · 后宫' })

const message = ref('')
const errorText = ref('')

// —— 账号：用户名 ——
const profile = ref<{ username: string, email: string } | null>(null)
const usernameDraft = ref('')
const usernamePending = ref(false)
const usernameMsg = ref('')
const usernameErr = ref('')

/** 与后端同一套规则（4-32 位字母/数字/下划线/连字符），先在前端拦一次，省一趟请求。 */
const USERNAME_RE = /^[a-zA-Z0-9_-]{4,32}$/

async function loadProfile() {
  if (!session.token.value) return
  try {
    const info = await hgApi.getProfile()
    profile.value = { username: info.username, email: info.email }
    usernameDraft.value = info.username
  } catch {
    // 拉不到资料不影响页面其余部分（可能是 token 过期），静默留给后续操作报错
    profile.value = null
  }
}

async function saveUsername() {
  usernameMsg.value = ''
  usernameErr.value = ''
  const next = usernameDraft.value.trim()
  if (!USERNAME_RE.test(next)) {
    usernameErr.value = '用户名需 4-32 位，只能包含字母、数字、下划线与连字符'
    return
  }
  if (profile.value && next === profile.value.username) {
    usernameMsg.value = '用户名没有变化'
    return
  }
  usernamePending.value = true
  try {
    const res = await hgApi.updateUsername(next)
    profile.value = { username: res.username, email: profile.value?.email || '' }
    usernameDraft.value = res.username
    usernameMsg.value = `用户名已改为 ${res.username}`
  } catch (e: unknown) {
    usernameErr.value = e instanceof Error ? e.message : '修改失败，请稍后重试'
  } finally {
    usernamePending.value = false
  }
}

onMounted(() => {
  session.load()
  gate.refresh()
  loadProfile()
})

async function toggleAdultMode(next: boolean) {
  message.value = ''
  errorText.value = ''
  const ok = await gate.setAdultMode(next)
  if (ok) {
    message.value = next ? '已开启：显示成人内容' : '已关闭：隐藏成人内容'
  } else {
    errorText.value = gate.error.value || '设置失败'
  }
}

async function resetGate() {
  message.value = ''
  errorText.value = ''
  await gate.reset()
  message.value = '已清除本浏览器的入口确认；站点开启弹窗时下次访问会重新询问'
}
</script>

<template>
  <div class="settings-page">
    <header class="settings-head">
      <p class="settings-eyebrow">
        偏好设置
      </p>
      <h1>账号与偏好</h1>
      <p class="settings-sub">
        账号部分可以修改你的用户名；偏好部分是成人内容的显示开关，
        本站按 18+ 处理、成人内容默认显示，这里的开关用于按自己的意愿隐藏它，
        随时可以再打开。
      </p>
    </header>

    <section class="settings-card">
      <div class="settings-card__head">
        <h2>用户名</h2>
        <span
          class="settings-pill"
          :class="{ on: !!profile }"
        >
          {{ profile ? '已登录' : '未登录' }}
        </span>
      </div>
      <template v-if="!session.token.value">
        <p class="settings-card__hint">
          登录后可修改用户名。注册只需邮箱与密码，用户名由系统自动生成（形如
          <code>asher_7f3a</code>）。
        </p>
      </template>
      <template v-else-if="!profile">
        <p class="settings-card__hint">
          正在读取账号信息…
        </p>
      </template>
      <template v-else>
        <p class="settings-card__hint">
          用户名就是你的展示名，4-32 位，只能包含字母、数字、下划线与连字符，全站唯一。
          邮箱（登录账号）为 <strong>{{ profile.email }}</strong>，如需更换请使用「修改邮箱」。
        </p>
        <div class="settings-inline">
          <input
            v-model="usernameDraft"
            class="settings-input"
            type="text"
            maxlength="32"
            autocomplete="username"
            placeholder="输入新的用户名"
            @keydown.enter.prevent="saveUsername"
          >
          <button
            type="button"
            class="settings-btn settings-btn--primary"
            :disabled="usernamePending"
            @click="saveUsername"
          >
            {{ usernamePending ? '保存中…' : '保存用户名' }}
          </button>
        </div>
        <p
          v-if="usernameMsg"
          class="settings-inline-msg"
        >
          {{ usernameMsg }}
        </p>
        <p
          v-if="usernameErr"
          class="settings-inline-msg settings-inline-msg--error"
          role="alert"
        >
          {{ usernameErr }}
        </p>
      </template>
    </section>

    <section class="settings-card">
      <div class="settings-card__head">
        <h2>本站是否提供成人内容</h2>
        <span
          class="settings-pill"
          :class="{ on: gate.status.value.siteAdultContent }"
        >
          {{ gate.status.value.siteAdultContent ? '已开启' : '未开启' }}
        </span>
      </div>
      <p class="settings-card__hint">
        这是站点级配置，由运营在后台「合规与成人内容」里设置，用户无法自行更改。
        <template v-if="!gate.status.value.siteAdultContent">
          本站当前未开启成人内容，因此不会出现成人条目与成人分级作品。
        </template>
      </p>
    </section>

    <section class="settings-card">
      <div class="settings-card__head">
        <h2>入口确认</h2>
        <span
          class="settings-pill"
          :class="{ on: gate.status.value.verified }"
        >
          {{ gate.status.value.verified ? '已确认' : '未确认' }}
        </span>
      </div>
      <p class="settings-card__hint">
        站点开启 18+ 入口弹窗时，确认结果保存在本浏览器（默认 30 天），
        用于免去每次访问重复确认；换设备或换浏览器需要重新确认。
        <template v-if="!gate.status.value.siteAdultContent">
          本站未开启成人内容，因此不会弹出入口确认。
        </template>
      </p>
      <button
        v-if="gate.status.value.verified"
        type="button"
        class="settings-btn"
        @click="resetGate"
      >
        清除本浏览器的入口确认
      </button>
    </section>

    <section class="settings-card">
      <div class="settings-card__head">
        <h2>显示成人内容</h2>
        <span
          class="settings-pill"
          :class="{ on: gate.status.value.adultMode }"
        >
          {{ gate.status.value.adultMode ? '已开启' : '已关闭' }}
        </span>
      </div>
      <p class="settings-card__hint">
        开启（默认）：效果包选择器列出成人条目，作品流正常显示你标注为 r18 的作品。
        关闭：成人条目不再出现，r18 作品默认遮罩（可在作品详情页临时查看）。
      </p>
      <p
        v-if="!session.token.value"
        class="settings-card__hint"
      >
        这是账号级偏好，请先登录（可用游客一键登录）。
      </p>
      <button
        v-else
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="gate.pending.value"
        @click="toggleAdultMode(!gate.status.value.adultMode)"
      >
        {{ gate.status.value.adultMode ? '隐藏成人内容' : '显示成人内容' }}
      </button>
    </section>

    <p
      v-if="message"
      class="settings-flash"
    >
      {{ message }}
    </p>
    <p
      v-if="errorText"
      class="settings-flash settings-flash--error"
      role="alert"
    >
      {{ errorText }}
    </p>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 760px;
  margin: 0 auto;
  padding: clamp(24px, 4vw, 40px) clamp(16px, 3vw, 32px) 64px;
}

.settings-head {
  margin-bottom: 28px;
}

.settings-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--amber);
  text-transform: uppercase;
}

.settings-head h1 {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: clamp(24px, 3vw, 30px);
  color: var(--ink);
}

.settings-sub {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--muted);
}

.settings-card {
  margin-bottom: 16px;
  padding: 20px 22px;
  border: 1px solid var(--line);
  border-radius: 8px 3px 8px 3px;
  background: var(--panel);
}

.settings-card__head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.settings-card__head h2 {
  margin: 0;
  font-size: 16px;
  color: var(--ink);
}

.settings-pill {
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 12px;
  color: var(--faint);
}

.settings-pill.on {
  border-color: rgb(251 191 36 / 0.5);
  color: var(--amber);
}

.settings-card__hint {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--muted);
}

.settings-inline {
  display: flex;
  gap: 10px;
  align-items: center;
}

.settings-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
}

.settings-input:focus {
  border-color: rgb(251 191 36 / 0.55);
  outline: 0;
}

.settings-inline-msg {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--amber);
}

.settings-inline-msg--error {
  color: #fca5a5;
}

.settings-card__hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgb(255 255 255 / 0.06);
  font-size: 11px;
}

.settings-btn {
  padding: 10px 16px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  cursor: pointer;
}

.settings-btn--primary {
  border-color: transparent;
  background: var(--amber);
  color: #1a1408;
  font-weight: 600;
}

.settings-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.settings-flash {
  margin-top: 12px;
  font-size: 13px;
  color: var(--amber);
}

.settings-flash--error {
  color: #fca5a5;
}
</style>
