<script setup lang="ts">
// 18+ 确认弹窗。
//
// 只在服务端说"需要弹窗且本浏览器还没确认过"时出现（gateRequired），
// 并且挡住整页 —— 它是入口提示，不是可以点掉的通知条。
//
// 刻意做成**一键确认**，不收集出生日期：
// 产品口径是"弹窗提示即可"；而一个自己填的生日并不产生可核验的事实，
// 那就不该顺手把用户的生日存下来。站点开关默认关闭（site.compliance.ageGate=0），
// 所以默认情况下这个弹窗根本不会出现。
const gate = useAdultGate()

const visible = computed(() => gate.status.value.gateRequired)

onMounted(() => {
  // 首次进入时拉一次服务端口径（SSR 阶段拿不到 cookie，必须放在客户端）。
  if (!gate.loaded.value) gate.refresh()
})

function leave() {
  // 不提供"继续浏览"的绕过路径：拒绝就是离开，这是入口提示的意义所在。
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
          本站面向 {{ gate.status.value.minAge }} 周岁及以上用户，内容为成人向的
          AI 生成影像。继续访问即表示你已确认自己已满 {{ gate.status.value.minAge }} 周岁。
        </p>

        <p
          v-if="gate.error.value"
          class="age-gate__error"
          role="alert"
        >
          {{ gate.error.value }}
        </p>

        <div class="age-gate__actions">
          <button
            type="button"
            class="age-gate__primary"
            :disabled="gate.pending.value"
            @click="gate.confirm()"
          >
            {{ gate.pending.value ? '确认中…' : `我已满 ${gate.status.value.minAge} 岁，进入` }}
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
          确认结果只保存在本浏览器（默认 30 天），用于免去每次访问重复确认，不会公开。
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
