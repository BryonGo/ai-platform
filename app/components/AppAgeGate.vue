<script setup lang="ts">
// 站点 18+ 年龄门遮罩。
//
// 只在服务端说"需要过门且本浏览器还没过"时出现（gateRequired），
// 并且**挡住整页**：它是合规拦截，不是一个可以点掉的提示条。
// 未满 18 岁的输入由服务端拒绝，这里把拒绝原因原样显示出来。
const gate = useAdultGate()
const session = useAuthSession()

const birthDate = ref('')
const alsoAdultMode = ref(true)
const localError = ref('')

// 日期选择器的上限就是今天：未来日期在服务端会被拒，但没必要让用户先试一次。
const today = new Date().toISOString().slice(0, 10)

const visible = computed(() => gate.status.value.gateRequired)

const canSubmit = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(birthDate.value) && !gate.pending.value)

onMounted(() => {
  session.load()
  // 首次进入时拉一次服务端口径（SSR 阶段拿不到 cookie，必须放在客户端）。
  if (!gate.loaded.value) gate.refresh()
})

async function submit() {
  localError.value = ''
  if (!canSubmit.value) {
    localError.value = '请填写完整的出生日期'
    return
  }
  const ok = await gate.confirmBirthDate(birthDate.value)
  if (!ok) {
    localError.value = gate.error.value || '年龄确认失败'
    return
  }
  // 登录用户顺手开启成人模式：年龄门已经过了，再让用户去设置里点一次是多余的一步。
  if (alsoAdultMode.value && session.token.value && !gate.status.value.adultMode) {
    await gate.setAdultMode(true)
  }
}

function leave() {
  // 不提供"继续浏览"的绕过路径：拒绝就是离开，这是年龄门的意义所在。
  window.location.href = 'https://www.google.com/'
}
</script>

<template>
  <Teleport
    v-if="visible"
    to="body"
  >
    <div
      class="age-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
    >
      <div class="age-gate__panel">
        <p class="age-gate__eyebrow">
          仅限成年人
        </p>
        <h1
          id="age-gate-title"
          class="age-gate__title"
        >
          本站包含成人内容
        </h1>
        <p class="age-gate__body">
          本站面向 {{ gate.status.value.minAge }} 周岁及以上用户，包含成人向的 AI 生成内容。
          请填写你的出生日期以确认年龄；未满 {{ gate.status.value.minAge }} 周岁请勿进入。
        </p>

        <label
          class="age-gate__field"
          for="age-gate-birth"
        >
          <span>出生日期</span>
          <input
            id="age-gate-birth"
            v-model="birthDate"
            type="date"
            :max="today"
            autocomplete="bday"
          >
        </label>

        <label
          v-if="session.token.value"
          class="age-gate__check"
        >
          <input
            v-model="alsoAdultMode"
            type="checkbox"
          >
          <span>同时开启成人模式（显示成人内容与成人效果包）</span>
        </label>

        <p
          v-if="localError"
          class="age-gate__error"
          role="alert"
        >
          {{ localError }}
        </p>

        <div class="age-gate__actions">
          <button
            type="button"
            class="age-gate__primary"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ gate.pending.value ? '确认中…' : '确认并进入' }}
          </button>
          <button
            type="button"
            class="age-gate__secondary"
            @click="leave"
          >
            我未满 {{ gate.status.value.minAge }} 岁
          </button>
        </div>

        <p class="age-gate__note">
          确认结果保存在本浏览器（默认 30 天），不会公开，也不会用于其他用途。
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.age-gate {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(120% 90% at 50% 0%, rgb(251 191 36 / 0.12), transparent 60%),
    rgb(8 9 10 / 0.94);
  backdrop-filter: blur(6px);
}

.age-gate__panel {
  width: min(520px, 100%);
  padding: 32px clamp(22px, 4vw, 36px);
  border: 1px solid var(--line);
  border-radius: 8px 3px 8px 3px;
  background: var(--panel);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.6);
}

.age-gate__eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--amber);
  text-transform: uppercase;
}

.age-gate__title {
  margin: 0 0 14px;
  font-family: var(--font-display);
  font-size: clamp(22px, 3vw, 28px);
  color: var(--ink);
}

.age-gate__body {
  margin: 0 0 22px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--muted);
}

.age-gate__field {
  display: block;
  margin-bottom: 16px;
}

.age-gate__field span {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--faint);
}

.age-gate__field input {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--canvas);
  color: var(--ink);
  font-size: 15px;
}

.age-gate__check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 18px;
  font-size: 13px;
  color: var(--muted);
}

.age-gate__check input {
  margin-top: 2px;
  accent-color: var(--amber);
}

.age-gate__error {
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 1px solid rgb(248 113 113 / 0.4);
  border-radius: 6px;
  background: rgb(248 113 113 / 0.08);
  font-size: 13px;
  color: #fca5a5;
}

.age-gate__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.age-gate__primary,
.age-gate__secondary {
  flex: 1 1 auto;
  min-width: 150px;
  padding: 12px 18px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.age-gate__primary {
  border: none;
  background: var(--amber);
  color: #1a1408;
  font-weight: 600;
}

.age-gate__primary:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.age-gate__secondary {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
}

.age-gate__note {
  margin: 18px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--faint);
}
</style>
