<script setup lang="ts">
// 设置页：目前只放成人内容相关的偏好与合规状态。
//
// 为什么单独成页而不是塞进顶栏一个开关：成人模式是**账号级**偏好，
// 需要说清它与年龄门的关系（必须先过门才能开），一句话的开关说不清；
// 而且这一页同时是"我怎么关掉成人内容 / 怎么重置年龄确认"的入口。
const gate = useAdultGate()
const session = useAuthSession()

useSeoMeta({ title: '设置 · 后宫' })

const message = ref('')
const errorText = ref('')

onMounted(() => {
  session.load()
  gate.refresh()
})

async function toggleAdultMode(next: boolean) {
  message.value = ''
  errorText.value = ''
  const ok = await gate.setAdultMode(next)
  if (ok) {
    message.value = next ? '已开启成人模式' : '已关闭成人模式'
  } else {
    errorText.value = gate.error.value || '设置失败'
  }
}

async function resetGate() {
  message.value = ''
  errorText.value = ''
  await gate.reset()
  message.value = '已清除本浏览器的年龄确认，下次访问会重新询问'
}
</script>

<template>
  <div class="settings-page">
    <header class="settings-head">
      <p class="settings-eyebrow">
        偏好设置
      </p>
      <h1>成人内容</h1>
      <p class="settings-sub">
        本站的成人内容需要同时满足三件事：站点开启成人内容、本浏览器通过 18+ 年龄确认、
        账号开启成人模式。三者缺一，成人效果包与成人分级作品都不会出现。
      </p>
    </header>

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
          本站当前未开启，因此不会出现成人内容，也不需要年龄确认。
        </template>
      </p>
    </section>

    <section class="settings-card">
      <div class="settings-card__head">
        <h2>年龄确认</h2>
        <span
          class="settings-pill"
          :class="{ on: gate.status.value.verified }"
        >
          {{ gate.status.value.verified ? '已确认' : '未确认' }}
        </span>
      </div>
      <p class="settings-card__hint">
        确认结果保存在本浏览器，用于免去每次访问重复填写；换设备或换浏览器需要重新确认。
      </p>
      <button
        v-if="gate.status.value.verified"
        type="button"
        class="settings-btn"
        @click="resetGate"
      >
        清除本浏览器的年龄确认
      </button>
    </section>

    <section class="settings-card">
      <div class="settings-card__head">
        <h2>成人模式</h2>
        <span
          class="settings-pill"
          :class="{ on: gate.status.value.adultMode }"
        >
          {{ gate.status.value.adultMode ? '已开启' : '已关闭' }}
        </span>
      </div>
      <p class="settings-card__hint">
        开启后：模型/效果包选择器会列出成人条目，作品流不再遮罩你标注为 r18 的作品。
        关闭随时可以；开启必须先通过年龄确认。
      </p>
      <p
        v-if="!session.token.value"
        class="settings-card__hint"
      >
        成人模式是账号偏好，请先登录（可用游客一键登录）。
      </p>
      <p
        v-else-if="!gate.status.value.verified"
        class="settings-card__hint"
      >
        请先完成年龄确认，再开启成人模式。
      </p>
      <button
        v-else
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="gate.pending.value"
        @click="toggleAdultMode(!gate.status.value.adultMode)"
      >
        {{ gate.status.value.adultMode ? '关闭成人模式' : '开启成人模式' }}
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
