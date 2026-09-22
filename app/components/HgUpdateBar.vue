<script setup lang="ts">
// 新版本提示条（全局挂在 app.vue）：线上发了新版本时出现。
// 文案随状态变化：倒计时中 / 因正在输入而暂停 / 用户点过"稍后"。
const watcher = useVersionWatcher()

onMounted(() => watcher.start())

const visible = computed(() => !!watcher.available.value && !watcher.dismissed.value)
const version = computed(() => watcher.available.value)
const shortVersion = computed(() => {
  const v = version.value
  if (!v) return ''
  // 镜像 tag 形如 20260914151045-96ce975：只展示短 sha，避免提示条过长
  const parts = v.split('-')
  return parts.length > 1 ? parts[parts.length - 1] : v
})
</script>

<template>
  <div
    v-if="visible"
    class="update-bar"
    role="status"
    aria-live="polite"
  >
    <UIcon
      name="i-lucide-refresh-cw"
      aria-hidden="true"
    />
    <span class="update-bar__text">
      新版本已上线
      <em v-if="shortVersion">{{ shortVersion }}</em>
      <template v-if="watcher.paused.value">· 当前有未完成的输入或任务，完成后自动刷新</template>
      <template v-else-if="watcher.countdown.value > 0">· {{ watcher.countdown.value }} 秒后自动刷新</template>
    </span>
    <button
      type="button"
      class="update-bar__go"
      @click="watcher.reload()"
    >
      立即刷新
    </button>
    <button
      type="button"
      class="update-bar__later"
      title="本次会话不再自动刷新"
      @click="watcher.dismiss()"
    >
      稍后
    </button>
  </div>
</template>

<style scoped>
.update-bar {
  position: fixed;
  top: 14px;
  left: 50%;
  z-index: 95;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(92vw, 560px);
  padding: 8px 10px 8px 14px;
  border: 1px solid var(--hg3-accent-line, rgb(232 50 176 / 38%));
  border-radius: 999px;
  background: #1c1d21;
  color: var(--hg3-ink, #fafafa);
  font-size: 13px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 52%);
  transform: translateX(-50%);
}
.update-bar__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.update-bar__text em {
  margin-left: 4px;
  color: var(--hg3-faint, #6f6f6f);
  font-style: normal;
  font-size: 11px;
}
.update-bar__go,
.update-bar__later {
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.update-bar__go {
  border: 0;
  background: linear-gradient(135deg, #f347bc, #e832b0);
  color: #241609;
  font-weight: 600;
}
.update-bar__later {
  border: 1px solid var(--hg3-line, rgb(255 255 255 / 12%));
  background: transparent;
  color: var(--hg3-muted, #949494);
}
.update-bar__later:hover {
  color: var(--hg3-ink, #fafafa);
}
</style>
